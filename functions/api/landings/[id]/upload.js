// POST /api/landings/:id/upload — upload 1 ảnh THẬT (mặc định ô 'product', PNG/JPG)
// vào D1 landing_images. Dùng cho ảnh sản phẩm bạn tự gửi. Admin-only qua middleware.
//
// Body JSON: { slot: "product", dataUrl: "data:image/png;base64,...." }  (hoặc { b64, mime })
// Trả: { ok, url }

const ALLOWED_SLOTS = new Set(["product", "hero", "usage", "benefit1", "benefit2", "benefit3"]);
const MAX_B64 = 6 * 1024 * 1024; // ~6MB base64 (~4.5MB ảnh)

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "id không hợp lệ" }, 400);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const slot = String(d.slot || "product");
  if (!ALLOWED_SLOTS.has(slot)) return json({ ok: false, error: "slot không hợp lệ" }, 400);

  let b64 = String(d.b64 || "");
  let mime = String(d.mime || "image/png");
  if (d.dataUrl) {
    const m = String(d.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return json({ ok: false, error: "dataUrl không hợp lệ" }, 400);
    mime = m[1]; b64 = m[2];
  }
  if (!b64) return json({ ok: false, error: "Thiếu dữ liệu ảnh" }, 400);
  if (!/^image\/(png|jpeg|jpg|webp)$/.test(mime)) return json({ ok: false, error: "Chỉ nhận PNG/JPG/WebP" }, 400);
  if (b64.length > MAX_B64) return json({ ok: false, error: "Ảnh quá lớn (>~4.5MB), hãy nén nhỏ lại" }, 413);

  const landing = await env.DB.prepare("SELECT id FROM landings WHERE id = ?").bind(id).first();
  if (!landing) return json({ ok: false, error: "Landing chưa tồn tại — lưu nháp trước" }, 404);

  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(`
      INSERT INTO landing_images (landing_id, slot, b64, mime, prompt, source, updated_at)
      VALUES (?, ?, ?, ?, NULL, 'upload', ?)
      ON CONFLICT(landing_id, slot) DO UPDATE SET b64 = ?, mime = ?, source = 'upload', updated_at = ?
    `).bind(id, slot, b64, mime, now, b64, mime, now).run();
  } catch (err) {
    return json({ ok: false, error: "Lưu ảnh lỗi: " + String(err?.message || err) }, 500);
  }

  return json({ ok: true, url: "/api/landings/img/" + id + "/" + slot + "?v=" + now });
}
