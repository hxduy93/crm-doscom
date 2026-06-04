// /api/landings/refine-prompt — cải thiện 1 prompt ảnh theo góp ý của user.
// Stateless (không đụng DB). Admin-only qua middleware. Dùng Gemini Flash.
//
// Body: { slot, current, suggestion, brand?, productDesc? }
// Trả:  { ok, prompt }  (prompt tiếng Anh đã viết lại, 1 khối)

const DEFAULT_MODEL = "gemini-3-flash-preview";
const GATEWAY_ID = "doscom-erp";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function baseUrl(env) {
  if (env.CF_ACCOUNT_ID) {
    return "https://gateway.ai.cloudflare.com/v1/" + env.CF_ACCOUNT_ID + "/" + GATEWAY_ID + "/google-ai-studio/v1beta";
  }
  return "https://generativelanguage.googleapis.com/v1beta";
}

function buildInstruction({ slot, current, suggestion, brand, productDesc }) {
  return [
    "You are an expert prompt engineer for AI image generators (ChatGPT / DALL·E that accept an ATTACHED product reference photo).",
    "Rewrite and improve the IMAGE PROMPT below for a product landing-page section, applying the user's suggestion.",
    "Return ONLY the final improved prompt in ENGLISH as one single block — no quotes, no markdown, no explanation.",
    "",
    "ALWAYS keep these in the result:",
    "- Instruct to use the ATTACHED reference product image as the EXACT product (keep its shape, label, text and colors unchanged; composite it photorealistically).",
    "- Keep (or set a sensible) aspect ratio & approximate pixel size for this section.",
    "- Photorealistic commercial photography, clean composition. No text, letters, captions, watermark or brand logo in the image (a colored highlight mark IS allowed).",
    "- If the suggestion asks to point out / emphasize a detail, add a clearly visible bright RED circle (and a thin red arrow) around that exact element.",
    "",
    "SECTION SLOT: " + (slot || "generic"),
    brand ? ("BRAND: " + brand) : "",
    productDesc ? ("PRODUCT CONTEXT: " + productDesc) : "",
    "",
    "CURRENT PROMPT:",
    (current && String(current).trim()) || "(empty — write a fresh one for this section)",
    "",
    "USER SUGGESTION (apply this faithfully):",
    String(suggestion || "").trim(),
  ].filter(Boolean).join("\n");
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ ok: false, error: "GEMINI_API_KEY chưa cấu hình" }, 500);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const suggestion = String(d.suggestion || "").trim();
  if (!suggestion) return json({ ok: false, error: "Thiếu góp ý cho AI" }, 400);

  const MODEL = env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = baseUrl(env) + "/models/" + MODEL + ":generateContent?key=" + env.GEMINI_API_KEY;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildInstruction(d) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });
  } catch (err) {
    return json({ ok: false, error: "Gọi Gemini lỗi: " + String(err?.message || err) }, 502);
  }

  if (!res.ok) {
    const txt = (await res.text()).slice(0, 400);
    return json({ ok: false, error: "Gemini HTTP " + res.status + ": " + txt }, 502);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  let out = parts.map(p => p?.text).filter(Boolean).join("").trim();
  if (!out) return json({ ok: false, error: "Gemini trả rỗng" }, 502);

  // Bỏ dấu nháy/markdown bao ngoài nếu có.
  out = out.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim();
  }

  return json({ ok: true, prompt: out });
}
