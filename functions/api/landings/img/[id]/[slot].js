// GET /api/landings/img/:id/:slot — trả ảnh (PNG/JPG) từ D1 landing_images.
// CÔNG KHAI (read-only): _middleware.js bypass GET path này để landing đã publish
// (khác origin) lẫn preview trong dashboard đều load được. Không lộ gì nhạy cảm.

function notFound() {
  return new Response("not found", { status: 404, headers: { "Content-Type": "text/plain" } });
}

// base64 -> Uint8Array (atob có sẵn trong Workers runtime)
function b64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function onRequestGet({ env, params }) {
  if (!env.DB) return notFound();
  const id = Number(params.id);
  const slot = String(params.slot || "");
  if (!Number.isInteger(id) || !slot) return notFound();

  const row = await env.DB.prepare(
    "SELECT b64, mime FROM landing_images WHERE landing_id = ? AND slot = ?"
  ).bind(id, slot).first();
  if (!row || !row.b64) return notFound();

  let bytes;
  try { bytes = b64ToBytes(row.b64); } catch { return notFound(); }

  return new Response(bytes, {
    headers: {
      "Content-Type": row.mime || "image/png",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
