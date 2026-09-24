import { anthropicBase, proxyHeaders } from "../lib/ai-endpoint.js";
// Endpoint: POST /api/generate-ad-copy
// Body: { product: "D1" | "DR1" | ..., format: "lead_gen" | ..., formatLabel, cta, notes, promotion,
//         styles?, count?, seed?, rotate? }
//  - promotion (tùy chọn): chuỗi mô tả KM do user cung cấp (quà tặng/giảm giá/thời hạn).
//    Nếu rỗng → AI KHÔNG tự ý bịa KM. Chỉ giữ dòng Bảo hành cố định.
//  - styles (tùy chọn): mảng mã DẠNG BÀI muốn dùng (xem lib/ad-formats.js).
//    Bỏ trống → tự chọn theo seed + rotate.
//  - count  (tùy chọn, mặc định 3): số variant.
//  - seed / rotate: điểm neo xoay vòng dạng bài. Endpoint DETERMINISTIC — cùng
//    (product, seed, rotate, count) luôn ra cùng bộ dạng. Muốn ra bài khác thì
//    NGƯỜI GỌI đổi seed/rotate, server không tự random (giữ luật "cùng input →
//    cùng output" của dự án, và để lỗi tái hiện được).
//
// 2026-07-22: thêm dạng bài xoay vòng. Trước đây mọi lần gọi đều dùng chung 1
// khung 8 bước nên chạy N video ra N bài giống hệt nhau về cấu trúc.
// Response: { ok, model, product, styles, variants: [...] }
//
// 2026-06-15 (crm): đổi từ Cloudflare Workers AI (Llama 3.3 70B — hay trả JSON hỏng)
// sang Anthropic Claude (nay là Sonnet 5, xem CLAUDE_MODEL) qua Cloudflare AI Gateway 'doscom-erp' (JSON ổn định,
// nhanh). Tái dùng pattern callClaudeViaGateway của agent FB/Google.
// CẦN env: ANTHROPIC_API_KEY (secret) + CF_ACCOUNT_ID (var) — crm đã có sẵn.

import { getProduct } from "../lib/product-catalog.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../lib/ad-prompts.js";
import { AD_FORMATS, ENABLED_FORMATS, FORMAT_KEYS, getFormat, pickFormats } from "../lib/ad-formats.js";
// Brand Core NOMA v3 — nguồn sự thật thương hiệu NOMA, ĐÃ CÓ SẴN trong repo và
// đang được module GEO + đăng sản phẩm dùng. Trước 2026-07-22 agent viết ads
// KHÔNG đọc file này nên viết Noma như một dòng sản phẩm của Doscom và dùng cụm
// "chuẩn Mỹ" sai nghĩa xuất xứ — đúng thứ brand core cấm.
import { NOMA_BRAND_GUIDE, scanForbidden } from "./geo/_utils/noma-brandcore.js";

// 24/09/2026: Haiku 4.5 → Sonnet 5. Đo trên cùng prompt, 22 bài/11 SP: Haiku vẫn
// 12 bài quá độ dài headline/mô tả, 2 cụm cấm, 1 bài thiếu câu bắt buộc; Sonnet 5
// = 0/0/0. Lượng bài ads ít nên chênh chi phí không đáng kể.
const CLAUDE_MODEL = "claude-sonnet-5";

/**
 * Thay placeholder {{URL}} trong bài bằng link đích thật.
 *
 * Prompt bảo model giữ nguyên {{URL}} để biết chỗ nào cần chèn link. Trước đây
 * client không thay nên người chạy ads phải tự tìm rồi sửa tay từng bài.
 *
 * Bắt rộng: model hay viết lệch thành {URL}, {{ URL }}, {{url}}. Sót một biến thể
 * là quảng cáo chạy với chữ "{{URL}}" nằm giữa bài.
 * Không có link → giữ nguyên placeholder, KHÔNG xoá (xoá đi thì mất luôn dấu chỗ chèn).
 */
export function fillUrlPlaceholder(text, link) {
  const l = String(link || "").trim();
  const s = String(text == null ? "" : text);
  return l ? s.replace(/\{\{?\s*URL\s*\}?\}/gi, l) : s;
}

/**
 * Cắt chuỗi về tối đa `max` ký tự, ưu tiên cắt ở ranh giới TỪ.
 *
 * Trước 24/09/2026 dùng .slice(0, 40) thẳng: duyệt 22 bài thì 11 headline bị cắt
 * giữa chữ ("…không dùng smartphone, làm s"). Giờ lùi về dấu cách gần nhất và bỏ
 * dấu nối/dấu câu thừa ở đuôi. Đếm theo code point để emoji không bị chẻ đôi.
 */
export function cutAtWord(text, max) {
  const chars = Array.from(String(text == null ? "" : text).trim());
  if (chars.length <= max) return chars.join("");
  let cut = chars.slice(0, max).join("");
  const sp = cut.lastIndexOf(" ");
  if (sp >= Math.floor(max * 0.5)) cut = cut.slice(0, sp);
  return cut.replace(/[\s\-–—:;,.?!]+$/u, "");
}

// Lỗi Haiku vẫn lặp lại dù prompt đã cấm (đo 24/09/2026 trên 22 bài). Chỉ CẢNH BÁO
// cho người duyệt, không tự sửa. "rẻ" không nằm trong scanForbidden dùng chung với
// GEO vì bộ đó bỏ dấu trước khi so ("re" khớp cả "rè", "rẽ") — ở đây so nguyên dấu.
const COPY_CHECKS = [
  { re: /(^|[^\p{L}])rẻ(?![\p{L}])/iu, msg: "từ cấm NOMA: “rẻ”", noma: true },
  { re: /\bDIY\b|detailing|video call|non-chlorinated/i, msg: "trộn tiếng Anh" },
  { re: /Đó là lý do|được thiết kế để|Tình huống quen thuộc|Bạn có bao giờ/i, msg: "câu chuyển mùi AI" },
  { re: /\d{1,3}\.\d{3}(\.\d{3})? (người|chủ xe|khách|doanh nhân)|hàng triệu (người|chủ xe)/i, msg: "số người mua tự bịa" },
];

export function copyWarnings(text, isNoma) {
  return COPY_CHECKS.filter((c) => (!c.noma || isNoma) && c.re.test(text)).map((c) => c.msg);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Gọi Claude qua Cloudflare AI Gateway (giữ observability gateway 'doscom-erp').
// System prompt cache_control ephemeral → bấm lại nhiều mẫu cùng SP → cache hit.
async function callClaudeViaGateway(env, systemPrompt, userPrompt) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY chưa set trong Cloudflare env");
  if (!env.CF_ACCOUNT_ID) throw new Error("CF_ACCOUNT_ID chưa set trong Cloudflare env");

  // Đường ra do lib/ai-endpoint.js chọn: proxy ghim vùng Bắc Mỹ nếu có (Anthropic chặn
  // colo Hong Kong — xem file đó), không thì AI Gateway như cũ.
  const url = `${anthropicBase(env)}/v1/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...proxyHeaders(env),
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      // Sonnet 5 không nhận `temperature` (API trả 400 "deprecated for this model").
      max_tokens: 8192,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
    // Sonnet viết 3 bài mất ~40-70 giây, 60s cũ dễ hụt.
    signal: AbortSignal.timeout(120000),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`Claude API ${r.status}: ${errText.slice(0, 300)}`);
  }
  const data = await r.json();
  const textBlock = (data.content || []).find(b => b.type === "text");
  if (!textBlock?.text) throw new Error("Claude trả empty content");
  return textBlock.text;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY || !env.CF_ACCOUNT_ID) {
    return jsonResponse({
      error: "Thiếu cấu hình Claude: cần ANTHROPIC_API_KEY (secret) + CF_ACCOUNT_ID (var) trên Cloudflare Pages.",
    }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Body không phải JSON hợp lệ." }, 400);
  }

  const { product: productKey, format, formatLabel, cta, notes, promotion,
          styles, count, seed, rotate, link } = body;

  // Link đích: thay thẳng vào chỗ {{URL}} để bài trả về dùng được ngay.
  // Không truyền link thì giữ nguyên placeholder (client tự thay sau).
  const destLink = String(link || "").trim();

  const product = getProduct(productKey);
  if (!product) {
    return jsonResponse({ error: `Không tìm thấy sản phẩm: ${productKey}` }, 400);
  }

  // Chọn DẠNG BÀI. Người gọi chỉ định tay thì tôn trọng; không thì xoay vòng
  // theo seed + rotate (deterministic — xem ghi chú đầu file).
  let chosenFormats;
  if (Array.isArray(styles) && styles.length) {
    const unknown = styles.filter((s) => !FORMAT_KEYS.includes(s));
    if (unknown.length) {
      return jsonResponse({
        error: `Dạng bài không có: ${unknown.join(", ")}. Dạng hợp lệ: ${FORMAT_KEYS.join(", ")}`,
      }, 400);
    }
    chosenFormats = styles.map(getFormat);
  } else {
    chosenFormats = pickFormats({
      seed: seed != null ? String(seed) : String(productKey),
      rotate: Number(rotate) || 0,
      count: Number(count) || 3,
      allowed: product.blockFormats
        ? FORMAT_KEYS.filter((k) => !product.blockFormats.includes(k))
        : null,
    });
  }
  if (!chosenFormats.length) {
    return jsonResponse({ error: "Không chọn được dạng bài nào." }, 400);
  }

  const userPrompt = buildUserPrompt({
    product, format, formatLabel, cta, notes, promotion, formats: chosenFormats,
    // Cùng seed/rotate với việc chọn dạng bài → kiểu headline cũng xoay theo video,
    // vẫn deterministic (chạy lại lô cũ ra đúng bộ headline cũ).
    seed: seed != null ? String(seed) : String(productKey),
    rotate: Number(rotate) || 0,
  });

  // Sản phẩm NOMA → nối Brand Core v3 vào cuối system prompt. Đặt SAU để luật
  // brand thắng mọi mô tả chung ở trên (chính brand core ghi "THẮNG mọi mô tả khác").
  const systemPrompt = product.brand === "NOMA"
    ? `${SYSTEM_PROMPT}\n\n${NOMA_BRAND_GUIDE}`
    : SYSTEM_PROMPT;

  let textOut;
  try {
    textOut = await callClaudeViaGateway(env, systemPrompt, userPrompt);
  } catch (err) {
    return jsonResponse({
      error: "Claude lỗi: " + (err?.message || String(err)),
    }, 502);
  }

  // Parse JSON; nếu model kèm text thừa, cố gắng extract block JSON đầu tiên.
  let parsed;
  try {
    parsed = JSON.parse(textOut);
  } catch {
    const match = textOut.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return jsonResponse({ error: "Claude trả JSON không hợp lệ.", raw: textOut.slice(0, 500) }, 502);
      }
    } else {
      return jsonResponse({ error: "Claude trả JSON không hợp lệ.", raw: textOut.slice(0, 500) }, 502);
    }
  }

  if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
    return jsonResponse({ error: "Claude không trả variants hợp lệ.", raw: parsed }, 502);
  }

  // Truncate to enforce FB limits (safety net).
  // style/style_label lấy từ dạng ĐÃ GIAO theo thứ tự, không tin chuỗi model tự
  // điền — model hay viết lại tên dạng, mà UI cần mã khớp lib/ad-formats.js.
  const fillUrl = (s) => fillUrlPlaceholder(s, destLink);

  parsed.variants = parsed.variants.map((v, i) => {
    const f = chosenFormats[i] || chosenFormats[chosenFormats.length - 1];
    const rawHeadline = fillUrl(v.headline).trim();
    const rawDesc = fillUrl(v.description).trim();
    const out = {
      id: v.id || String.fromCharCode(65 + i),
      style: f.key,
      style_label: f.label,
      headline: cutAtWord(rawHeadline, 40),
      primary_text: fillUrl(v.primary_text).slice(0, 2200),
      video_title: cutAtWord(fillUrl(v.video_title), 100),
      description: cutAtWord(rawDesc, 30),
    };
    // AI viết quá dài mà server phải cắt → báo để người duyệt đọc lại câu đã cắt.
    const cutFields = [];
    if (Array.from(rawHeadline).length > 40) cutFields.push("headline");
    if (Array.from(rawDesc).length > 30) cutFields.push("description");
    if (cutFields.length) out.trimmed = cutFields;
    const cw = copyWarnings(`${out.headline}\n${out.primary_text}\n${out.description}`, product.brand === "NOMA");
    if (cw.length) out.copy_warnings = cw;
    // Rà cụm vi phạm brand core bằng regex (không tốn credit AI). Chỉ CẢNH BÁO,
    // không tự sửa: câu chữ do người duyệt quyết, nhưng phải biết mà sửa.
    if (product.brand === "NOMA") {
      const hits = scanForbidden(`${out.headline}\n${out.primary_text}`);
      if (hits.length) out.brand_warnings = hits;
    }
    return out;
  });

  return jsonResponse({
    ok: true,
    model: CLAUDE_MODEL,
    product: productKey,
    styles: chosenFormats.map((f) => f.key),
    // Cho client biết link đã được gắn hay chưa, để còn tự thay nốt nếu chưa.
    link_filled: destLink || null,
    variants: parsed.variants,
  });
}

// GET: liệt kê dạng bài ĐANG BẬT để UI dựng dropdown (không tốn credit AI).
// Dạng đang tắt không hiện lên UI — tránh chọn nhầm lối viết chưa được duyệt.
export function onRequestGet() {
  return jsonResponse({
    ok: true,
    formats: ENABLED_FORMATS.map((f) => ({ key: f.key, label: f.label, bestFor: f.bestFor })),
    disabled_count: AD_FORMATS.length - ENABLED_FORMATS.length,
  });
}
