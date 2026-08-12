// Chuẩn hoá gói dữ liệu do bookmarklet Shopee gửi về.
//
// Bookmarklet chạy trong trình duyệt của người dùng (nơi trang Shopee mở bình
// thường) nên đọc được đủ tên/giá/mô tả/ảnh. Nhưng nó bóc từ DOM nên dữ liệu
// bẩn: giá lẫn số rác, ảnh trùng và dính đuôi biến thể, mô tả kèm rác giao diện.
// Mọi thứ đi qua đây trước khi vào form đăng bài.

export const SHOPEE_CDN = "https://down-vn.img.susercontent.com/file/";
const CDN_RE = /susercontent\.com\/file\/([A-Za-z0-9._-]{8,})/;

// Giá hợp lệ: 1.000đ → 500 triệu. Ngoài khoảng đó là số rác (lượt xem, mã đơn…).
export function cleanPrices(list) {
  const out = [];
  for (const raw of list || []) {
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n >= 1000 && n <= 500000000) out.push(n);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// Gộp trùng theo hash, bỏ đuôi _tn (thumbnail) và đuôi định dạng.
export function cleanImages(list, max = 20) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const m = String(raw || "").match(CDN_RE);
    if (!m) continue;
    const hash = m[1].replace(/_tn$/, "").replace(/\.(webp|jpg|jpeg|png)$/i, "");
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push(SHOPEE_CDN + hash);
    if (out.length >= max) break;
  }
  return out;
}

// Mô tả: bỏ tiêu đề khối, rác giao diện Shopee và khoảng trắng thừa.
export function cleanDescription(s, max = 6000) {
  let t = String(s || "")
    .replace(/^\s*MÔ TẢ SẢN PHẨM\s*/i, "")
    .replace(/\r/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // vài dòng rác hay dính khi quét DOM
  const rac = [
    /^Xem thêm$/i, /^Thu gọn$/i, /^Chat ngay$/i, /^Thêm vào Giỏ hàng$/i,
    /^Mua ngay$/i, /^Tố cáo$/i, /^Chia sẻ:?$/i, /^Đã bán \d+/i,
  ];
  t = t.split("\n").filter((line) => {
    const l = line.trim();
    if (!l) return true;
    return !rac.some((re) => re.test(l));
  }).join("\n").trim();
  return t.slice(0, max);
}

export function cleanName(s) {
  return String(s || "")
    .replace(/\s*\|\s*Shopee Việt Nam.*$/i, "")
    .replace(/^\s*Mua\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Nhận gói thô từ bookmarklet → trả dữ liệu sạch + danh sách cảnh báo.
 * Không bao giờ ném lỗi: thiếu gì thì báo cảnh báo, để người dùng điền tay.
 */
export function normalizeShopeePayload(raw) {
  const warnings = [];
  const p = raw && typeof raw === "object" ? raw : {};

  const name = cleanName(p.name);
  if (!name) warnings.push("Không có tên sản phẩm.");

  const prices = cleanPrices(p.prices || [p.price, p.old_price]);
  const price = prices.length ? prices[0] : 0;
  const old_price = prices.length > 1 ? prices[prices.length - 1] : 0;
  if (!price) warnings.push("Không có giá.");

  const images = cleanImages(p.images);
  if (!images.length) warnings.push("Không có ảnh nào.");

  const description = cleanDescription(p.description);
  if (!description) warnings.push("Không có mô tả.");

  return {
    name,
    price,
    old_price: old_price && old_price !== price ? old_price : 0,
    description,
    images,
    breadcrumb: Array.isArray(p.breadcrumb) ? p.breadcrumb.map(String).slice(0, 6) : [],
    source_url: typeof p.url === "string" ? p.url.slice(0, 500) : "",
    warnings,
  };
}
