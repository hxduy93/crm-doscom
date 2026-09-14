// Menu "Ảnh sale" — helper THUẦN (không mạng), dùng chung cho trình duyệt, Function và bộ test.
// Trình duyệt nạp qua dist/js/sale-images.js (build-dist.sh copy kèm price-discount.js).
//
// Tool làm 3 việc trên ảnh ĐẠI DIỆN sản phẩm WooCommerce (images[0]) của doscom.vn / noma.vn:
//   1. Tạo ảnh sale: ghép khung + tem lên ảnh SP thật bằng canvas → gắn làm ảnh đại diện.
//   2. Thay hàng loạt bằng ảnh thiết kế sẵn: khớp file ↔ SP theo tên file, người dùng sửa tay.
//   3. Gỡ ảnh sale: trả lại ĐÚNG ảnh đại diện cũ + xoá file ảnh sale khỏi thư viện Media.
//
// Nguyên tắc an toàn: lưu ảnh gốc vào KV TRƯỚC khi đổi; chỉ gỡ khi ảnh đại diện hiện tại
// vẫn đúng là ảnh sale do tool gắn — ai đã đổi tay sau đó thì KHÔNG đụng (tránh xoá nhầm ảnh).
import { computePercent } from "./price-discount.js";

// nomaauto.us cố ý KHÔNG có: chủ dự án chốt 14/09/2026 chỉ áp cho 2 web Việt.
export const SALE_SITES = ["doscom", "noma"];

export const SALE_THEMES = {
  do_vang:  { label: "Đỏ – vàng",  main: "#E11D2E", accent: "#FFD400" },
  cam:      { label: "Cam",        main: "#EE4D2D", accent: "#FFE14D" },
  xanh:     { label: "Xanh dương", main: "#1D4ED8", accent: "#FACC15" },
  den_vang: { label: "Đen – vàng", main: "#111827", accent: "#FFC400" },
  hong:     { label: "Hồng",       main: "#DB2777", accent: "#FDE047" },
};

export const stateKey = (site, id) => `saleimg:${site}:${id}`;
export const statePrefix = (site) => `saleimg:${site}:`;

/** "Máy dò Định vị D1" → "may-do-dinh-vi-d1" */
export function normalizeName(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const compact = (s) => normalizeName(s).replace(/-/g, "");

/** "C:/x/noma-911.sale.JPG" → "noma-911.sale" */
export function fileStem(filename) {
  const f = String(filename || "").split(/[\\/]/).pop();
  return f.replace(/\.[a-z0-9]{2,5}$/i, "");
}

// Mọi cụm 1..maxLen token liền nhau, viết liền: ["noma","911"] → noma, 911, noma911.
// So theo CỤM TOKEN chứ không so chuỗi con: "noma911" không được khớp nhầm vào "noma9110".
function tokenGrams(tokens, maxLen) {
  const out = new Set();
  for (let i = 0; i < tokens.length; i++) {
    let g = "";
    for (let j = i; j < Math.min(tokens.length, i + maxLen); j++) {
      g += tokens[j];
      out.add(g);
    }
  }
  return out;
}

/**
 * Đoán sản phẩm cho 1 file ảnh. Trả { id, by, candidates }.
 *   by: "id" | "sku" | "name" | "code" | null
 *   id = null khi không khớp hoặc NHIỀU SP ngang điểm (candidates = các SP đó) — không đoán bừa,
 *   người dùng chọn tay trong bảng xem trước.
 */
export function matchFileToProduct(filename, products) {
  const n = normalizeName(fileStem(filename));
  const c = n.replace(/-/g, "");
  if (!c) return { id: null, by: null, candidates: [] };
  const stemTokens = n.split("-");
  const stemGrams = tokenGrams(stemTokens, 4);

  const scored = [];
  for (const p of products || []) {
    const name = normalizeName(p.name);
    let score = 0, by = null;
    const take = (s, b) => { if (s > score) { score = s; by = b; } };

    if (/^\d+$/.test(c) && String(p.id) === c) take(1000, "id");

    const sku = compact(p.sku);
    if (sku.length >= 3 && (c === sku || stemGrams.has(sku))) take(500 + sku.length, "sku");

    if (name.length >= 4 && (n === name || `-${n}-`.includes(`-${name}-`))) take(300 + name.length, "name");
    if (c.length >= 5 && `-${name}-`.includes(`-${n}-`)) take(200 + c.length, "name");

    // Mã model: cụm token của tên có chứa số (noma911, da3pro, d1…) trùng cụm token của file.
    const nameTokens = name.split("-");
    let best = 0;
    for (const g of tokenGrams(nameTokens, 3)) {
      if (g.length >= 3 && /\d/.test(g) && stemGrams.has(g) && g.length > best) best = g.length;
    }
    if (best) take(100 + best, "code");

    if (score) scored.push({ id: p.id, score, by });
  }

  if (!scored.length) return { id: null, by: null, candidates: [] };
  const top = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === top);
  if (winners.length === 1) return { id: winners[0].id, by: winners[0].by, candidates: [winners[0].id] };
  return { id: null, by: null, candidates: winners.map((w) => w.id) };
}

/**
 * Chữ trên tem giảm giá. `{pct}` = % giảm tính từ giá gạch/giá bán THẬT trên web.
 * SP không tính được % (không có giá sale, SP biến thể) → dùng `fallback` người dùng gõ —
 * KHÔNG tự bịa ra một con số.
 */
export function discountText(tpl, product, fallback) {
  const t = String(tpl == null ? "" : tpl);
  if (!t.includes("{pct}")) return t;
  const pct = computePercent(product && product.regular_price, product && product.sale_price);
  if (pct == null) return String(fallback == null ? "" : fallback);
  return t.split("{pct}").join(String(Math.round(pct)));
}

/** Mảng images gửi WooCommerce: ảnh mới lên đầu (= ảnh đại diện), giữ nguyên gallery phía sau. */
export function imagesWithFeatured(currentImages, newId) {
  const rest = (currentImages || []).slice(1)
    .map((im) => im && im.id)
    .filter((id) => id && id !== newId);
  return [{ id: newId }, ...rest.map((id) => ({ id }))];
}

/**
 * Chuẩn bị gắn ảnh sale. Quyết định ảnh GỐC nào được lưu để sau này trả lại.
 *   - Chưa có ảnh sale: gốc = ảnh đại diện hiện tại.
 *   - Đã có ảnh sale do tool gắn và vẫn đang hiển thị: GIỮ gốc cũ (không lưu nhầm ảnh sale
 *     làm "gốc"), ảnh sale cũ sẽ bị xoá sau khi gắn ảnh mới.
 *   - Có bản ghi nhưng ảnh đại diện đã bị đổi tay: coi ảnh hiện tại là gốc mới, không xoá gì.
 */
export function planApply(currentImages, state) {
  const cur = (currentImages || [])[0] || null;
  const curId = cur ? cur.id : null;
  const curSrc = cur ? cur.src || "" : "";
  if (state && curId && curId === state.sale_id) {
    return { orig_id: state.orig_id || null, orig_src: state.orig_src || "", delete_old_sale_id: state.sale_id, mismatch: false };
  }
  return { orig_id: curId, orig_src: curSrc, delete_old_sale_id: null, mismatch: !!state };
}

/** Chuẩn bị gỡ ảnh sale. Trả { ok, images } hoặc { ok:false, reason }. */
export function planRestore(currentImages, state) {
  if (!state || !state.sale_id) return { ok: false, reason: "SP này không có ảnh sale do tool gắn" };
  const cur = (currentImages || [])[0] || null;
  if (!cur || cur.id !== state.sale_id) {
    return { ok: false, reason: "Ảnh đại diện đã bị đổi tay sau khi gắn ảnh sale — tool không đụng để tránh mất ảnh" };
  }
  const rest = (currentImages || []).slice(1)
    .map((im) => im && im.id)
    .filter((id) => id && id !== state.sale_id && id !== state.orig_id);
  const ids = state.orig_id ? [state.orig_id, ...rest] : rest;
  return { ok: true, images: ids.map((id) => ({ id })) };
}

/** Tên file ảnh sale trên WP Media: sale-<đợt>-<tên SP>.<đuôi> (WP tự thêm -1 nếu trùng). */
export function saleFilename(campaign, productName, ext) {
  const camp = normalizeName(campaign).slice(0, 30) || "sale";
  const name = normalizeName(productName).slice(0, 50).replace(/-+$/, "") || "san-pham";
  const e = /^(jpe?g|png|webp)$/i.test(String(ext || "")) ? String(ext).toLowerCase() : "jpg";
  return `sale-${camp}-${name}.${e}`;
}

export function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  return null;
}

// Proxy ảnh cho canvas CHỈ nhận ảnh của chính 2 web — nhận link tuỳ ý thì thành cổng SSRF.
const PROXY_HOSTS = ["doscom.vn", "noma.vn"];

export function isProxyableImage(url) {
  let u;
  try { u = new URL(String(url || "")); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (PROXY_HOSTS.some((d) => h === d || h.endsWith("." + d))) return true;
  // CDN ảnh của Jetpack: https://i0.wp.com/doscom.vn/wp-content/...
  if (/^i[0-3]\.wp\.com$/.test(h)) {
    const first = u.pathname.split("/")[1] || "";
    return PROXY_HOSTS.some((d) => first === d || first.endsWith("." + d));
  }
  return false;
}

/* ───────── Khung sale DOSCOM ─────────
   Vẽ lại bằng canvas theo HUONG-DAN-KHUNG-SALE.md (designer gửi 14/09/2026). Bản PNG gốc có
   sẵn chữ ngày/mức giảm trong ảnh → mỗi đợt phải xuất PNG mới. Vẽ bằng code thì người dùng
   tự sửa ngày, mức giảm, dòng chữ đáy ngay trên tool. Toạ độ theo canvas 1000×1000. */
export const DOSCOM_FRAME = {
  font: '"Nunito", "Be Vietnam Pro", Arial, sans-serif',
  bar:   { h: 130, stops: ["#D32F2F", "#F4511E", "#FB8C00"] },       // thanh đáy full ngang
  badge: { w: 200, stops: ["#FFD54F", "#FFB300"], text: "#C62828" }, // góc trái thanh đáy
  chip:  { w: 230, h: 52, right: 24, text: "#D32F2F" },              // góc phải thanh đáy
  tag:   { w: 230, h: 160, right: 56, stops: ["#FFD54F", "#FFB300"], text: "#C62828" }, // top: 0
};

// Mục 6 hướng dẫn: từ brand DOSCOM không được dùng trên khung.
export const BRAND_FORBIDDEN = ["giá sốc", "rẻ nhất", "siêu rẻ", "số 1", "100%"];

/** Các từ cấm xuất hiện trong chữ trên khung (so bỏ dấu, theo ranh giới từ: "số 10" không dính "số 1"). */
export function brandWordViolations(...texts) {
  const out = [];
  for (const t of texts) {
    const raw = String(t == null ? "" : t);
    const n = `-${normalizeName(raw)}-`;
    for (const w of BRAND_FORBIDDEN) {
      const hit = w.includes("%")
        ? raw.replace(/\s+/g, "").includes(w)
        : n.includes(`-${normalizeName(w)}-`);
      if (hit && !out.includes(w)) out.push(w);
    }
  }
  return out;
}

/**
 * Mức giảm ghi trên khung phải đúng khuyến mãi thật (mục 6). Trả câu cảnh báo hoặc null.
 * Chữ dùng {pct} tự tính từ giá thật nên luôn khớp; chỉ số gõ cố định (VD "-30%") mới có thể lệch.
 */
export function tagPercentMismatch(text, product) {
  const m = String(text || "").match(/(\d{1,2})\s*%/);
  if (!m) return null;
  const shown = Number(m[1]);
  const real = computePercent(product && product.regular_price, product && product.sale_price);
  if (real == null) return `khung ghi ${shown}% nhưng SP chưa có giá sale trên web`;
  if (Math.round(real) !== shown) return `khung ghi ${shown}% nhưng giá web giảm ${Math.round(real)}%`;
  return null;
}
