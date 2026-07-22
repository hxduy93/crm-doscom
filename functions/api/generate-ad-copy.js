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
// sang Anthropic Claude Haiku 4.5 qua Cloudflare AI Gateway 'doscom-erp' (JSON ổn định,
// nhanh). Tái dùng pattern callClaudeViaGateway của agent FB/Google.
// CẦN env: ANTHROPIC_API_KEY (secret) + CF_ACCOUNT_ID (var) — crm đã có sẵn.

import { getProduct } from "../lib/product-catalog.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../lib/ad-prompts.js";
import { AD_FORMATS, FORMAT_KEYS, getFormat, pickFormats } from "../lib/ad-formats.js";
// Brand Core NOMA v3 — nguồn sự thật thương hiệu NOMA, ĐÃ CÓ SẴN trong repo và
// đang được module GEO + đăng sản phẩm dùng. Trước 2026-07-22 agent viết ads
// KHÔNG đọc file này nên viết Noma như một dòng sản phẩm của Doscom và dùng cụm
// "chuẩn Mỹ" sai nghĩa xuất xứ — đúng thứ brand core cấm.
import { NOMA_BRAND_GUIDE, scanForbidden } from "./geo/_utils/noma-brandcore.js";

const CLAUDE_MODEL = "claude-haiku-4-5";

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

  const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/anthropic/v1/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      temperature: 0.9,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(60000),
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
          styles, count, seed, rotate } = body;

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
  parsed.variants = parsed.variants.map((v, i) => {
    const f = chosenFormats[i] || chosenFormats[chosenFormats.length - 1];
    const out = {
      id: v.id || String.fromCharCode(65 + i),
      style: f.key,
      style_label: f.label,
      headline: (v.headline || "").slice(0, 40),
      primary_text: (v.primary_text || "").slice(0, 2200),
      video_title: (v.video_title || "").slice(0, 100),
      description: (v.description || "").slice(0, 30),
    };
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
    variants: parsed.variants,
  });
}

// GET: liệt kê dạng bài để UI dựng dropdown (không tốn credit AI).
export function onRequestGet() {
  return jsonResponse({
    ok: true,
    formats: AD_FORMATS.map((f) => ({ key: f.key, label: f.label, bestFor: f.bestFor })),
  });
}
