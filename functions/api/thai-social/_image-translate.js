// Dịch CHỮ NẰM TRÊN ẢNH của bài gốc sang tiếng Thái.
//
// Hai bước tách rời, cố ý:
//   1. ĐỌC ảnh (vision) — có chữ Việt không, chữ gì. Rẻ.
//   2. VẼ LẠI ảnh với chữ Thái (OpenAI images/edits) — đắt, chỉ chạy khi bước 1 thấy có chữ.
//
// Vì sao không vẽ lại mọi ảnh: ảnh sản phẩm trơn, ảnh chụp thật, ảnh feedback khách… vốn
// không có chữ nào để dịch. Đưa qua model vẽ lại chỉ tốn tiền và LÀM HỎNG ảnh thật (nhãn
// chai bị vẽ sai — đúng cái bẫy đã ghi trong _image.js). Không chữ thì giữ nguyên ảnh gốc.
//
// Vẽ lại ảnh là bước RỦI RO: model có thể đổi bố cục, làm mờ logo, viết sai chữ Thái. Nên
// mọi ảnh đã vẽ lại đều kèm ghi chú để người duyệt biết mà soi, và UI luôn cho lật về ảnh gốc.

import { anthropicBase, proxyHeaders } from "../../lib/ai-endpoint.js";
import { logAIUsage } from "../geo/_utils/ai-usage.js";
import { BRAND_RULE, fixBrandNames } from "./_repost-prompt.js";

const VISION_MODEL = "claude-haiku-4-5";
const VISION_PRICE = { in: 1, out: 5 };          // USD / 1M token
const OPENAI_VISION_MODEL = "gpt-4o-mini";
const OPENAI_VISION_PRICE = { in: 0.15, out: 0.60 };

// Model vẽ lại ảnh. Cùng chuỗi thử của _image-openai.js: tài khoản chưa mở model mới thì tụt xuống.
const EDIT_CHAIN = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"];
const PRICE_OUT_PER_1M = { "gpt-image-2": 30, "gpt-image-1.5": 32, "gpt-image-1": 40, "gpt-image-1-mini": 8 };

const OK_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function gatewayOpenAI(env) {
  return env.CF_ACCOUNT_ID
    ? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/openai`
    : "https://api.openai.com/v1";
}

/* base64 cho mảng byte lớn. btoa(String.fromCharCode(...bytes)) trên ảnh 1MB là tràn stack —
   phải cắt khúc. */
export function bytesToBase64(bytes) {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Đọc kích thước ảnh từ bytes để chọn khung vẽ lại cho ĐÚNG TỈ LỆ.

   Bỏ bước này thì ảnh dọc 4:5 (khổ quảng cáo hay dùng nhất trên Facebook) bị vẽ lại thành
   vuông và mất phần trên/dưới. Trả null khi không đọc được → để model tự chọn. */
export function imageSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const b = bytes;
  // PNG: width/height là 2 số big-endian ở byte 16..23
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const rd = (o) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
    return { w: rd(16), h: rd(20) };
  }
  // JPEG: đi theo marker tới SOFn, kích thước nằm ngay sau
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      // SOF0..SOF15, trừ DHT(c4)/JPG(c8)/DAC(cc) không mang kích thước
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
    return null;
  }
  return null;   // WEBP/GIF: để model tự chọn, không đoán bừa
}

export function editSizeFor(bytes, env) {
  if (env && env.THAI_IMAGE_EDIT_SIZE) return env.THAI_IMAGE_EDIT_SIZE;
  const d = imageSize(bytes);
  if (!d || !d.w || !d.h) return "auto";
  const r = d.w / d.h;
  if (r >= 1.2) return "1536x1024";
  if (r <= 0.85) return "1024x1536";
  return "1024x1024";
}

/* ── BƯỚC 1: đọc chữ trên ảnh ────────────────────────────────────────────────
   Trả { has_text, blocks:[{vi, th}], text_vi, text_th, cost_usd, provider }.
   Claude trước, không được thì OpenAI — cùng chính sách với callClaude (và cùng kill switch
   USE_CLAUDE=false). */

const VISION_SYSTEM =
`Bạn đọc ảnh quảng cáo và dịch chữ trên ảnh sang tiếng Thái.
Chỉ quan tâm CHỮ ĐƯỢC IN/THIẾT KẾ trên ảnh (tiêu đề, khẩu hiệu, nhãn giá, dòng khuyến mãi).
BỎ QUA chữ in sẵn trên bao bì sản phẩm và logo thương hiệu — đó là hàng thật, không dịch.
KHÔNG đổi con số, không quy đổi tiền tệ.
${BRAND_RULE}
Trả DUY NHẤT một object JSON:
{"co_chu": true|false, "cac_dong": [{"vi": "chữ trên ảnh", "th": "bản tiếng Thái"}]}
Ảnh không có chữ thiết kế nào thì trả {"co_chu": false, "cac_dong": []}.`;

function parseVision(text) {
  const t = String(text || "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function visionAnthropic(env, { b64, mime }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
  const res = await fetch(`${anthropicBase(env)}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...proxyHeaders(env),
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 1200,
      system: VISION_SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
          { type: "text", text: "Đọc chữ thiết kế trên ảnh này và dịch sang tiếng Thái." },
        ],
      }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`Claude vision ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = ((data.content || []).find((b) => b.type === "text") || {}).text || "";
  const u = data.usage || {};
  const cost = ((u.input_tokens || 0) * VISION_PRICE.in + (u.output_tokens || 0) * VISION_PRICE.out) / 1e6;
  return { parsed: parseVision(text), cost_usd: Number(cost.toFixed(6)), provider: "anthropic" };
}

async function visionOpenAI(env, { b64, mime }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const res = await fetch(`${gatewayOpenAI(env)}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL || OPENAI_VISION_MODEL,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${VISION_SYSTEM}\n\nTrả lời bằng JSON.` },
        { role: "user", content: [
          { type: "text", text: "Đọc chữ thiết kế trên ảnh này và dịch sang tiếng Thái." },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
        ] },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`OpenAI vision ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  const u = data.usage || {};
  const cost = ((u.prompt_tokens || 0) * OPENAI_VISION_PRICE.in + (u.completion_tokens || 0) * OPENAI_VISION_PRICE.out) / 1e6;
  return { parsed: parseVision(text), cost_usd: Number(cost.toFixed(6)), provider: "openai" };
}

export function normalizeVision(parsed) {
  const rows = Array.isArray(parsed && parsed.cac_dong) ? parsed.cac_dong : [];
  const blocks = rows
    // Sửa luôn tên thương hiệu bị phiên âm — chữ này sẽ được vẽ lên ảnh, sai là hiện rành rành.
    .map((r) => ({ vi: String((r && r.vi) || "").trim(),
                   th: fixBrandNames(String((r && r.th) || "").trim()).text }))
    .filter((r) => r.vi || r.th)
    .slice(0, 12);
  const hasText = parsed ? parsed.co_chu === true && blocks.length > 0 : false;
  return {
    has_text: hasText,
    blocks,
    text_vi: blocks.map((b) => b.vi).filter(Boolean).join(" · ").slice(0, 600),
    text_th: blocks.map((b) => b.th).filter(Boolean).join(" · ").slice(0, 600),
  };
}

export async function readImageText(env, { b64, mime }) {
  const type = OK_MIME.includes(mime) ? mime : "image/jpeg";
  const forceOpenAI = String(env.USE_CLAUDE || "").toLowerCase() === "false";
  let r = null, err = null;
  if (!forceOpenAI) {
    try { r = await visionAnthropic(env, { b64, mime: type }); } catch (e) { err = e; }
  }
  if (!r) {
    if (!env.OPENAI_API_KEY) throw err || new Error("Không có nhà cung cấp nào đọc được ảnh");
    r = await visionOpenAI(env, { b64, mime: type });
  }
  if (!r.parsed) {
    // Không đọc nổi thì coi như KHÔNG CÓ CHỮ và giữ ảnh gốc — an toàn hơn là vẽ lại mù.
    return { ...normalizeVision(null), cost_usd: r.cost_usd, provider: r.provider, unreadable: true };
  }
  return { ...normalizeVision(r.parsed), cost_usd: r.cost_usd, provider: r.provider };
}

/* ── BƯỚC 2: vẽ lại ảnh với chữ Thái ─────────────────────────────────────────
   OpenAI images/edits: gửi ảnh gốc + mô tả phải thay chữ nào bằng chữ nào.
   Trả { b64, model, cost_usd }. */

function editPrompt(blocks) {
  const pairs = blocks
    .filter((b) => b.vi && b.th)
    .map((b, i) => `${i + 1}. "${b.vi}" → "${b.th}"`)
    .join("\n");
  return `Chỉnh sửa ảnh quảng cáo này: thay TOÀN BỘ chữ tiếng Việt trên ảnh bằng chữ tiếng Thái tương ứng.

Bảng thay chữ:
${pairs}

Yêu cầu bắt buộc:
- Giữ NGUYÊN bố cục, màu nền, hiệu ứng, vị trí và kích thước từng khối chữ.
- Giữ NGUYÊN ảnh sản phẩm, bao bì, nhãn mác và logo thương hiệu — không vẽ lại, không đổi chữ trên bao bì.
- Chữ tiếng Thái phải đúng chính tả, đủ dấu, nằm gọn trong đúng khối chữ cũ, cùng kiểu chữ và màu chữ.
- Giữ nguyên mọi con số. Không thêm chữ mới, không thêm logo, không thêm watermark.
- Không để sót chữ tiếng Việt nào trên ảnh.
- Tên thương hiệu NOMA và Doscom viết bằng chữ Latin y như ảnh gốc, KHÔNG phiên âm sang chữ Thái.`;
}

export async function redrawImageInThai(env, { bytes, mime, blocks }) {
  if (!env.OPENAI_API_KEY) {
    throw Object.assign(new Error("Thiếu OPENAI_API_KEY nên không vẽ lại ảnh được"), { kind: "no_key" });
  }
  const type = OK_MIME.includes(mime) && mime !== "image/gif" ? mime : "image/png";
  const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
  const size = editSizeFor(bytes, env);
  const chain = env.THAI_IMAGE_EDIT_MODEL ? [env.THAI_IMAGE_EDIT_MODEL] : EDIT_CHAIN;

  let lastErr = null;
  for (const model of chain) {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", editPrompt(blocks).slice(0, 4000));
    form.set("n", "1");
    if (size && size !== "auto") form.set("size", size);
    form.set("quality", env.THAI_IMAGE_QUALITY || "medium");
    form.set("image", new Blob([bytes], { type }), `goc.${ext}`);

    let res;
    try {
      res = await fetch(`${gatewayOpenAI(env)}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(150000),
      });
    } catch (e) { lastErr = e; continue; }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      lastErr = new Error(`OpenAI ${model} ${res.status}: ${txt.slice(0, 250)}`);
      // Hết tiền / chặn vùng thì đổi model cũng vô ích — dừng ngay, đừng đốt thêm lượt.
      if (res.status === 401 || res.status === 429 || /region|territory|billing|quota/i.test(txt)) {
        lastErr.kind = res.status === 429 ? "quota" : "blocked";
        throw lastErr;
      }
      continue;   // 400/404 do model chưa mở → thử model kế
    }

    let data = null;
    try { data = await res.json(); } catch { data = null; }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) { lastErr = new Error(`OpenAI ${model} trả về không có ảnh`); continue; }

    const out = (data.usage && (data.usage.output_tokens || data.usage.total_tokens)) || 0;
    const cost = Number((out * (PRICE_OUT_PER_1M[model] || 30) / 1e6).toFixed(6));
    // Quy về "neuron tương đương" cho bảng chi phí AI cộng chung được — giống _image.js.
    try { await logAIUsage(env, { neurons: Math.round((cost || 0) / 0.011 * 1000), isImage: true }); } catch {}
    return { b64, model, cost_usd: cost || estimateEditCost(model, size) };
  }

  const e = new Error(`Vẽ lại ảnh lỗi: ${String(lastErr?.message || lastErr)}`);
  e.kind = lastErr?.kind || "openai";
  throw e;
}

/* API không trả usage thì vẫn phải ghi một con số — nhưng ghi ƯỚC LƯỢNG và chỉ dùng cho
   cột chi phí, đừng nhầm là số đo thật. ~1.500 token đầu ra cho một ảnh medium. */
function estimateEditCost(model, size) {
  const tokens = size === "1024x1024" ? 1056 : 1584;
  return Number((tokens * (PRICE_OUT_PER_1M[model] || 30) / 1e6).toFixed(6));
}
