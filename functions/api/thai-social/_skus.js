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
// Đường dẫn ảnh là URL cùng origin (vd "/sku-images/911.png"). Graph API nhận thẳng
// tham số `url` cho /photos nên ảnh chỉ cần công khai, không phải tải bytes lên.
//
// HAI nguồn thông số sản phẩm, cố ý gộp:
//   - noma-sku-specs.js  : 17 SKU dung dịch NOMA (250, 310, 911, 922, 350…)
//   - lib/product-catalog.js : thiết bị Doscom (D1, DR1, DA8.1) — KHÔNG có trong file trên,
//     mà D1 lại đúng là sản phẩm chủ lực của thị trường Thái (landing noma955.click).
//     Thiếu bước gộp này thì ô chọn sản phẩm không có D1 để chọn.

import { loadSkuSpecs, skuSpecText } from "../geo/_utils/noma-sku-specs.js";
import { PRODUCTS } from "../../lib/product-catalog.js";

export const SKU_IMAGES_KV_KEY = "thai_sku_images:v1";

/* Ảnh mặc định đi kèm repo. Thêm SKU mới: bỏ file vào sku-images/ rồi thêm một dòng ở đây.
   scripts/build-dist.sh copy cả thư mục sang dist/, thiếu bước đó là ảnh 404. */
export const SKU_IMAGES = {
  "250": "/sku-images/250.jpg",
  "310": "/sku-images/310.png",
  "911": "/sku-images/911.png",
  "922": "/sku-images/922.png",
  "D1":  "/sku-images/D1.png",   // đã tách nền, bỏ chữ tiếng Việt (24/08/2026)
};

/* Ảnh có chữ IN SẴN không phải tiếng Thái/tiếng Anh. Vẫn dùng được, nhưng UI phải cảnh báo
   để người duyệt biết mà cân nhắc — đăng ảnh tiếng Việt lên fanpage Thái thì khách không
   đọc được và trông như lấy nhầm thị trường.

   Hiện RỖNG: ảnh D1 bản đầu có chữ tiếng Việt in sẵn, đã tách nền lấy riêng phần máy
   (24/08/2026) nên không còn chữ. Giữ cơ chế lại cho ảnh nạp sau. */
export const IMAGE_WARNINGS = {};

/* Giá bán tại Thái Lan (baht). Chỉ điền mã đã thực sự bán ở Thái — thiếu giá thì prompt
   KHÔNG được bịa, phải bỏ hẳn phần giá khỏi bài. */
export const THB_PRICES = {
  "D1": 3590,   // landing noma955.click, đối chiếu 24/08/2026
};

// Mã trong product-catalog.js KHÔNG phải dung dịch NOMA (tên khoá dạng "Noma 911" thì bỏ,
// vì noma-sku-specs.js đã có bản đầy đủ hơn cho chúng).
const DEVICE_KEYS = Object.keys(PRODUCTS).filter((k) => !/^noma\s/i.test(k));

export async function loadSkuImages(env) {
  try {
    const raw = env && env.INVENTORY ? await env.INVENTORY.get(SKU_IMAGES_KV_KEY) : null;
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d === "object" && Object.keys(d).length) {
        return { images: { ...SKU_IMAGES, ...d }, nguon: "kv" };
      }
    }
  } catch { /* KV hỏng → dùng bản mặc định, không làm gãy việc sinh bài */ }
  return { images: SKU_IMAGES, nguon: "mac_dinh" };
}

/* Danh sách SKU cho hai ô chọn trên giao diện. Gộp dung dịch NOMA + thiết bị Doscom,
   kèm trạng thái ảnh để UI hiện rõ SKU nào đã có ảnh thật. */
export async function listSkus(env) {
  const { specs, nguon: nguonSpec } = await loadSkuSpecs(env);
  const { images, nguon: nguonAnh } = await loadSkuImages(env);

  const items = [
    ...Object.keys(specs).map((code) => ({
      code,
      name: (specs[code] && specs[code].name) || `NOMA ${code}`,
      nhom: "Dung dịch NOMA",
    })),
    ...DEVICE_KEYS.map((code) => ({
      code,
      name: PRODUCTS[code].fullName || PRODUCTS[code].name || code,
      nhom: "Thiết bị Doscom",
    })),
  ].map((x) => ({
    ...x,
    image_url: images[x.code] || null,
    image_warning: IMAGE_WARNINGS[x.code] || null,
    thb: THB_PRICES[x.code] || null,
  }));

  items.sort((a, b) =>
    a.nhom === b.nhom ? a.code.localeCompare(b.code, "en", { numeric: true })
                      : a.nhom.localeCompare(b.nhom));

  return { items, nguon_thong_so: nguonSpec, nguon_anh: nguonAnh, so_san_pham: items.length };
}

/* Dựng khối THÔNG SỐ CHUẨN của thiết bị từ product-catalog.js.
   Cố ý mang theo avoidWords + fbPolicyNotes: đây là bài đăng lên FACEBOOK, mà D1 là máy dò
   thiết bị nghe lén — viết sai giọng là bị Meta hạn chế bài, không chỉ là chuyện văn phong. */
function deviceBlock(code) {
  const p = PRODUCTS[code];
  if (!p) return "";
  const L = [];
  L.push(`THÔNG SỐ CHUẨN ${p.fullName || p.name} (nguồn: trang bán thật — DÙNG ĐÚNG, KHÔNG tự thêm số):`);
  if (p.specs && p.specs.length) L.push(...p.specs.map((s) => `- ${s}`));
  if (p.usps && p.usps.length) {
    L.push("Điểm bán chính:");
    L.push(...p.usps.map((s) => `- ${s}`));
  }
  if (p.painPoints && p.painPoints.length) {
    L.push("Nỗi lo của khách:");
    L.push(...p.painPoints.map((s) => `- ${s}`));
  }
  if (p.tonePreferred) L.push(`Giọng văn: ${p.tonePreferred}`);
  if (p.avoidWords && p.avoidWords.length) L.push(`CẤM dùng ý/từ: ${p.avoidWords.join("; ")}`);
  if (p.fbPolicyNotes) L.push(`LUẬT FACEBOOK: ${p.fbPolicyNotes}`);
  return L.join("\n");
}

// Thông số chuẩn của 1 SKU để nhét vào prompt. known=false nghĩa là mã không có trong hồ sơ.
export async function skuBlock(env, code) {
  const { specs } = await loadSkuSpecs(env);
  if (specs[code]) {
    return { text: skuSpecText(code, specs), known: true, name: specs[code].name || `NOMA ${code}` };
  }
  if (PRODUCTS[code]) {
    return { text: deviceBlock(code), known: true, name: PRODUCTS[code].fullName || PRODUCTS[code].name };
  }
  return { text: "", known: false, name: "" };
}
