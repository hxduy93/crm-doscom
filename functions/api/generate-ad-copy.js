// Endpoint: POST /api/generate-ad-copy
// Body: { product: "D1" | "DR1" | ..., format: "lead_gen" | ..., formatLabel, cta, notes, promotion }
//  - promotion (tùy chọn): chuỗi mô tả KM do user cung cấp (quà tặng/giảm giá/thời hạn).
//    Nếu rỗng → AI KHÔNG tự ý bịa KM. Chỉ giữ dòng Bảo hành cố định.
// Response: { variants: [...] }
//
// 2026-06-15 (crm): đổi từ Cloudflare Workers AI (Llama 3.3 70B — hay trả JSON hỏng)
// sang Anthropic Claude Haiku 4.5 qua Cloudflare AI Gateway 'doscom-erp' (JSON ổn định,
// nhanh). Tái dùng pattern callClaudeViaGateway của agent FB/Google.
// CẦN env: ANTHROPIC_API_KEY (secret) + CF_ACCOUNT_ID (var) — crm đã có sẵn.

import { getProduct } from "../lib/product-catalog.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../lib/ad-prompts.js";

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

  const { product: productKey, format, formatLabel, cta, notes, promotion } = body;

  const product = getProduct(productKey);
  if (!product) {
    return jsonResponse({ error: `Không tìm thấy sản phẩm: ${productKey}` }, 400);
  }

  const userPrompt = buildUserPrompt({ product, format, formatLabel, cta, notes, promotion });

  let textOut;
  try {
    textOut = await callClaudeViaGateway(env, SYSTEM_PROMPT, userPrompt);
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

  // Truncate to enforce FB limits (safety net)
  parsed.variants = parsed.variants.map((v) => ({
    id: v.id || "?",
    style: v.style || "",
    headline: (v.headline || "").slice(0, 40),
    primary_text: (v.primary_text || "").slice(0, 2200),
    video_title: (v.video_title || "").slice(0, 100),
    description: (v.description || "").slice(0, 30),
  }));

  return jsonResponse({
    ok: true,
    model: CLAUDE_MODEL,
    product: productKey,
    variants: parsed.variants,
  });
}

// Các method khác GET sẽ tự động trả 405 bởi Cloudflare Pages Functions
