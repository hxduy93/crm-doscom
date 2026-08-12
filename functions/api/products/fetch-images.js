// POST /api/products/fetch-images   (ENDPOINT ĐỌC — có bảo vệ)
// Nhận danh sách link ảnh CDN Shopee → tải về, trả base64 cho trang Đăng sản phẩm.
//
// Vì sao cần: bookmarklet chạy ở trình duyệt chỉ đưa được LINK ảnh (kéo cả ảnh
// qua clipboard/URL thì quá nặng). Còn máy chủ tải CDN Shopee thì thoải mái —
// CDN không chặn như trang sản phẩm (đo 2026-08-10).
//
// CHỈ cho tải từ CDN Shopee. Nếu nhận link tuỳ ý thì endpoint này thành cổng
// proxy để người ngoài quét mạng nội bộ qua hạ tầng của mình (SSRF).
import { getIdentity } from "../../lib/access.js";
import { cleanImages } from "../../lib/shopee-payload.js";

const IMG_MAX = 20;
const IMG_MAX_BYTES = 5 * 1024 * 1024;

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fetchOne(src) {
  const r = await fetch(src, {
    headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://shopee.vn/" },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  const type = (r.headers.get("content-type") || "").split(";")[0];
  if (!/^image\//i.test(type)) return null;
  const buf = await r.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > IMG_MAX_BYTES) return null;
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return { data: btoa(bin), media_type: type, src, bytes: buf.byteLength };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const id = await getIdentity(context);
  if (id.role === "open") {
    const tok = request.headers.get("x-products-token") || "";
    if (!env.PRODUCTS_TOKEN || tok !== env.PRODUCTS_TOKEN) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "body_not_json" }, 400);
  }

  // cleanImages đã lọc đúng host CDN Shopee + gộp trùng + bỏ đuôi _tn
  const urls = cleanImages(body.urls, IMG_MAX);
  if (!urls.length) return json({ ok: false, error: "khong_co_link_anh_hop_le" }, 400);

  const images = [];
  const failed = [];
  for (const u of urls) {
    try {
      const im = await fetchOne(u);
      if (im) images.push(im); else failed.push(u);
    } catch {
      failed.push(u);
    }
  }

  return json({ ok: true, images, failed, count: images.length });
}
