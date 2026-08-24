// Danh mục sản phẩm cho bài fanpage Thái + THƯ VIỆN ẢNH nền trắng.
//
// Vì sao có thư viện ảnh: ảnh do Flux sinh ra không vẽ đúng chai NOMA thật — nhãn sai,
// tỉ lệ sai, chữ méo. Chủ dự án chốt 24/08/2026: nạp sẵn ảnh sản phẩm nền trắng, mỗi lần
// sinh bài thì LẤY ẢNH THẬT ra dùng, Flux chỉ còn là đường lui khi SKU chưa có ảnh.
//
// Hai nguồn ảnh, ưu tiên từ trên xuống:
//   1. KV `thai_sku_images:v1` — bản người dùng tải lên qua UI, đổi được KHÔNG cần deploy.
//   2. SKU_IMAGES ngay dưới đây — bản mặc định đi kèm repo (file trong thư mục sku-images/).
//
// Đường dẫn ảnh là URL cùng origin (vd "/sku-images/350.webp"). Graph API nhận thẳng
// tham số `url` cho /photos nên ảnh chỉ cần công khai, không phải tải bytes lên.

import { loadSkuSpecs, skuSpecText } from "../geo/_utils/noma-sku-specs.js";

export const SKU_IMAGES_KV_KEY = "thai_sku_images:v1";

/* Ảnh mặc định đi kèm repo. Thêm SKU mới: bỏ file vào sku-images/ rồi thêm một dòng ở đây
   VÀ nhớ file được copy trong scripts/build-dist.sh, nếu không ảnh 404 trên bản deploy. */
export const SKU_IMAGES = {
  // "350": "/sku-images/350.webp",
};

/* Giá bán tại Thái Lan (baht). Chỉ điền mã đã thực sự bán ở Thái — thiếu giá thì prompt
   KHÔNG được bịa, phải bỏ hẳn phần giá khỏi bài. */
export const THB_PRICES = {
  // "D1": 3590,
};

export async function loadSkuImages(env) {
  try {
    const raw = env && env.INVENTORY ? await env.INVENTORY.get(SKU_IMAGES_KV_KEY) : null;
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d === "object" && Object.keys(d).length) {
        return { images: d, nguon: "kv" };
      }
    }
  } catch { /* KV hỏng → dùng bản mặc định, không làm gãy việc sinh bài */ }
  return { images: SKU_IMAGES, nguon: "mac_dinh" };
}

/* Danh sách SKU cho hai ô chọn trên giao diện. Gộp hồ sơ 17 SKU (nguồn sự thật về thông số)
   với thư viện ảnh, để UI hiện rõ SKU nào đã có ảnh thật. */
export async function listSkus(env) {
  const { specs, nguon: nguonSpec, so_san_pham } = await loadSkuSpecs(env);
  const { images, nguon: nguonAnh } = await loadSkuImages(env);
  const items = Object.keys(specs).map((code) => ({
    code,
    name: (specs[code] && specs[code].name) || `NOMA ${code}`,
    image_url: images[code] || null,
    thb: THB_PRICES[code] || null,
  }));
  items.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  return { items, nguon_thong_so: nguonSpec, nguon_anh: nguonAnh, so_san_pham };
}

// Thông số chuẩn của 1 SKU để nhét vào prompt. Rỗng = SKU không có trong hồ sơ.
export async function skuBlock(env, code) {
  const { specs } = await loadSkuSpecs(env);
  return { text: skuSpecText(code, specs), known: !!specs[code], name: (specs[code] || {}).name || "" };
}
