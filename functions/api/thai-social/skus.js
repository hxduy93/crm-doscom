// GET  /api/thai-social/skus  — danh sách sản phẩm cho hai ô chọn + trạng thái ảnh
// POST /api/thai-social/skus  — cập nhật thư viện ảnh (ghi vào KV, không cần deploy)
//
// Body POST: { images: { "350": "/sku-images/350.webp", ... } }

import { ok, fail, requireToken } from "./_lib.js";
import { listSkus, SKU_IMAGES_KV_KEY } from "./_skus.js";

export async function onRequestGet({ env }) {
  const data = await listSkus(env);
  const thieu_anh = data.items.filter((x) => !x.image_url).map((x) => x.code);
  return ok({ ...data, thieu_anh });
}

export async function onRequestPost({ request, env }) {
  const bad = requireToken(request, env);
  if (bad) return bad;
  if (!env.INVENTORY) return fail("KV binding 'INVENTORY' missing", 500);

  let b;
  try { b = await request.json(); } catch { return fail("invalid_json"); }
  if (!b.images || typeof b.images !== "object") return fail("missing_images");

  // Chỉ nhận đường dẫn cùng origin. Ảnh ngoài sẽ đi thẳng vào bài đăng fanpage thật —
  // không để một URL lạ trở thành ảnh bài viết của thương hiệu.
  const clean = {};
  for (const [code, url] of Object.entries(b.images)) {
    const u = String(url || "").trim();
    if (!u) continue;
    if (!u.startsWith("/")) return fail("image_url_must_be_same_origin", 400, { code, url: u });
    clean[String(code).slice(0, 20)] = u.slice(0, 300);
  }

  await env.INVENTORY.put(SKU_IMAGES_KV_KEY, JSON.stringify(clean));
  return ok(await listSkus(env));
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Thai-Token",
    },
  });
}
