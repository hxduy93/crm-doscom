// Dịch caption bài gốc sang tiếng Thái. Tách khỏi preview.js để chỗ đó chỉ còn lo luồng.
//
// HAI LƯỢT GỌI, CỐ Ý:
//   1. BẮT BUỘC — caption tiếng Thái + hashtag + cảnh báo.
//   2. TUỲ CHỌN — dịch ngược bản Thái về tiếng Việt cho người duyệt đọc.
//
// Vì sao không gộp một lượt (sự cố thật 26/08/2026): bài gốc 1.918 ký tự, gộp cả hai bản
// vào một JSON là vượt max_tokens → JSON bị cắt giữa chừng → báo "AI trả về không đúng
// khuôn" và MẤT TRẮNG cả bài dù bản dịch đã gần xong. Tách ra thì lượt bắt buộc luôn đủ
// chỗ; lượt dịch ngược hỏng chỉ mất phần soát, bài vẫn còn.

import { callClaude, extractJson } from "../geo/_utils/claude.js";
import {
  buildSystemPrompt, buildUserPrompt, buildBackSystemPrompt, buildBackUserPrompt,
  tokenBudget, fixBrandNames, brandWarnings,
} from "./_repost-prompt.js";

function safeExtract(text) {
  try { return extractJson(text || ""); } catch { return null; }
}

const clean = (v) => String(v == null ? "" : v).trim();

/* Bản dịch chính. Ném lỗi có .kind = "ai_failed" | "ai_bad_output" (kèm .detail) —
   preview.js chỉ việc chuyển thẳng ra cho người dùng. */
export async function translateCaption(env, { message, pageName, imageTexts = [] }) {
  const src = clean(message);
  const maxTokens = tokenBudget(src);

  let cost = 0;
  let raw = "";
  let parsed = null;

  /* Thử hai lần. Lần hai bỏ bớt việc cho model: chỉ xin caption. Model trả thiếu thường là
     do hết chỗ hoặc lan man, chứ không phải không dịch được — hỏi gọn lại là ra.

     Lượt đầu HỎNG HẲN (mạng lỗi, hoặc output không phải JSON nên callClaude ném) cũng phải
     thử lại, đừng bỏ bài ngay: đó chính là kiểu hỏng đã gặp hôm 26/08 — JSON bị cắt giữa
     chừng vì hết chỗ, mà hỏi gọn lại thì vừa. */
  let lastErr = null;
  for (const lean of [false, true]) {
    let res;
    try {
      res = await callClaude(env, {
        model: "haiku",
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt({ message: src, pageName, imageTexts })
          + (lean ? `\n\nLẦN TRƯỚC BẠN TRẢ VỀ KHÔNG DÙNG ĐƯỢC. Lần này chỉ cần đúng một object JSON có trường "caption_th" là bản dịch tiếng Thái đầy đủ. "hashtags" và "canh_bao" để mảng rỗng cũng được. Không viết gì ngoài JSON.` : ""),
        maxTokens: lean ? Math.min(8000, maxTokens + 1500) : maxTokens,
        jsonOutput: true,
      });
    } catch (e) {
      lastErr = e;
      continue;
    }
    lastErr = null;
    cost += Number(res.cost_usd || 0);
    raw = res.text || "";
    parsed = res.parsed || safeExtract(raw);
    if (parsed && clean(parsed.caption_th)) break;
    parsed = null;
  }

  if (!parsed) {
    const msg = String(lastErr?.message || "");
    // Phân biệt "gọi không được" với "gọi được nhưng trả rác": hai việc phải sửa khác nhau.
    const badShape = !lastErr || /parse|JSON/i.test(msg);
    throw Object.assign(
      new Error(lastErr ? msg : "Model không trả JSON có caption_th sau 2 lần thử"),
      { kind: badShape ? "ai_bad_output" : "ai_failed",
        detail: lastErr ? msg.slice(0, 300) : `Model trả về: ${raw.slice(0, 300)}` },
    );
  }

  // Sửa tên thương hiệu bị phiên âm — prompt nhắc rồi nhưng model vẫn quên được.
  const capFix = fixBrandNames(parsed.caption_th);
  const tags = [];
  const tagFixed = [];
  for (const t of Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 8) : []) {
    const f = fixBrandNames(String(t).replace(/^#+/, "").replace(/\s+/g, ""));
    if (f.text) tags.push(f.text);
    for (const b of f.fixed) if (!tagFixed.includes(b)) tagFixed.push(b);
  }

  const canhBao = Array.isArray(parsed.canh_bao) ? parsed.canh_bao.map(String) : [];
  const brandFixed = [...new Set([...capFix.fixed, ...tagFixed])];
  if (brandFixed.length) {
    canhBao.push(`Máy đã phiên âm tên thương hiệu ${brandFixed.join(", ")} sang chữ Thái, hệ thống tự sửa lại thành chữ Latin. Đọc kỹ xem còn chỗ nào sót không.`);
  }
  canhBao.push(...brandWarnings(src, capFix.text));

  return {
    caption_th: capFix.text.trim(),
    hashtags: tags,
    canh_bao: canhBao,
    cost_usd: Number(cost.toFixed(6)),
  };
}

/* Dịch ngược để người Việt soát. KHÔNG BAO GIỜ ném lỗi: đây là phần phụ trợ, hỏng thì
   trả chuỗi rỗng kèm một câu cảnh báo, không được kéo cả bài chết theo. */
export async function backTranslate(env, captionTh) {
  const th = clean(captionTh);
  if (!th) return { caption_vi_back: "", cost_usd: 0, canh_bao: [] };
  try {
    const res = await callClaude(env, {
      model: "haiku",
      systemPrompt: buildBackSystemPrompt(),
      userPrompt: buildBackUserPrompt(th),
      maxTokens: tokenBudget(th, { floor: 1500, ceil: 6000, perChar: 1.2, extra: 500 }),
      jsonOutput: true,
    });
    const parsed = res.parsed || safeExtract(res.text);
    const back = clean(parsed && parsed.caption_vi_back);
    if (!back) {
      return { caption_vi_back: "", cost_usd: Number(res.cost_usd || 0),
               canh_bao: ["Chưa dịch ngược được sang tiếng Việt — đọc thẳng bản tiếng Thái, hoặc bấm Dịch lại."] };
    }
    return { caption_vi_back: back, cost_usd: Number(res.cost_usd || 0), canh_bao: [] };
  } catch (e) {
    return { caption_vi_back: "", cost_usd: 0,
             canh_bao: [`Chưa dịch ngược được sang tiếng Việt (${String(e?.message || e).slice(0, 120)}). Bản tiếng Thái vẫn dùng được.`] };
  }
}
