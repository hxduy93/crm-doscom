// POST /api/landings/:id/genimage — gen 1 ảnh cho 1 ô (slot) bằng CF Workers AI Flux,
// lưu base64 vào D1 landing_images. Admin-only qua middleware.
//
// Body: { slot: "hero"|"usage"|"benefit1"|"benefit2"|"benefit3", prompt: "english image prompt", steps?, width?, height? }
// Trả:  { ok, url, cost_usd, free_tier, usage_today }

import { estimateNeurons, logAIUsage } from "../../geo/_utils/ai-usage.js";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const GATEWAY_ID = "doscom-erp";
const GEN_SLOTS = new Set(["hero", "usage", "benefit1", "benefit2", "benefit3"]);

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  if (!env.AI) return json({ ok: false, error: "Workers AI binding 'AI' missing" }, 500);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "id không hợp lệ" }, 400);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const slot = String(d.slot || "");
  if (!GEN_SLOTS.has(slot)) return json({ ok: false, error: "slot không hợp lệ (chỉ ảnh AI: hero/usage/benefit1..3)" }, 400);
  const prompt = String(d.prompt || "").trim();
  if (!prompt) return json({ ok: false, error: "Thiếu prompt gen ảnh" }, 400);

  const landing = await env.DB.prepare("SELECT id FROM landings WHERE id = ?").bind(id).first();
  if (!landing) return json({ ok: false, error: "Landing chưa tồn tại — lưu nháp trước khi gen ảnh" }, 404);

  const steps  = Math.min(Math.max(parseInt(d.steps)  || 4,    1),  8);
  const width  = Math.min(Math.max(parseInt(d.width)  || 1024, 256), 2048);
  const height = Math.min(Math.max(parseInt(d.height) || 1024, 256), 2048);

  const safePrompt = (prompt + "\n\nPhotography style, professional, clean composition, NO TEXT in image, NO brand logos, NO clearly visible faces, brand-safe, high detail.").slice(0, 2000);

  let response;
  try {
    response = await env.AI.run(MODEL, { prompt: safePrompt, steps, width, height }, { gateway: { id: GATEWAY_ID } });
  } catch (err) {
    return json({ ok: false, error: "Flux lỗi: " + String(err?.message || err) }, 502);
  }
  if (!response?.image) return json({ ok: false, error: "Flux trả rỗng" }, 502);

  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(`
      INSERT INTO landing_images (landing_id, slot, b64, mime, prompt, source, updated_at)
      VALUES (?, ?, ?, 'image/png', ?, 'gen', ?)
      ON CONFLICT(landing_id, slot) DO UPDATE SET b64 = ?, mime = 'image/png', prompt = ?, source = 'gen', updated_at = ?
    `).bind(id, slot, response.image, safePrompt.slice(0, 1000), now, response.image, safePrompt.slice(0, 1000), now).run();
  } catch (err) {
    return json({ ok: false, error: "Lưu ảnh lỗi: " + String(err?.message || err) }, 500);
  }

  const neurons = estimateNeurons({ width, height, steps });
  const usage = await logAIUsage(env, { neurons, isImage: true });

  return json({
    ok: true,
    url: "/api/landings/img/" + id + "/" + slot + "?v=" + now,
    cost_usd: usage?.over_free_tier ? Number(((neurons / 1000) * 0.011).toFixed(6)) : 0,
    free_tier: !(usage?.over_free_tier),
    usage_today: usage,
  });
}
