// Menu "Giảm giá hàng loạt" — helper THUẦN (không mạng), dùng chung trình duyệt + Function + test.
// Trình duyệt nạp qua dist/js/bulk-sale.js (build-dist.sh copy kèm price-discount.js).
//
// Cách làm (chủ dự án chốt 14/09/2026, thay cho ý tưởng nhân bản SP): dùng GIÁ SALE HẸN GIỜ có sẵn
// của WooCommerce (sale_price + date_on_sale_from/to) → tới ngày web tự hiện giá giảm, hết hạn tự
// về giá cũ. Giữ 1 trang / 1 SKU / 1 kho / đánh giá / SEO. Danh mục "Giảm giá" gắn thêm (SP được
// nằm nhiều danh mục) để làm menu chạy quảng cáo.
//
// Nguyên tắc:
//   - KHÔNG BAO GIỜ sửa regular_price (giá gạch phải là giá thật đang bán).
//   - Lưu giá sale CŨ của từng SP/biến thể vào KV trước khi ghi → kết thúc đợt trả về đúng giá đó.
//   - Giá bị sửa tay sau khi áp → kết thúc đợt KHÔNG đè lên.
import { parseMoney, saleFromOld, parsePercent, computePercent } from "./price-discount.js";

export const BULK_SALE_SITES = ["doscom", "noma"];
export const PCT_WARN = 50;

// Mốc dùng khi trả lại một giá sale VĨNH VIỄN (không có ngày). REST WooCommerce không xoá được
// ngày hẹn giờ (chuỗi rỗng bị WP từ chối là ngày sai, null thì bị bỏ qua) → đặt khoảng rất rộng.
export const PAST_GMT = "2000-01-01T00:00:00";
export const FAR_GMT = "2099-12-31T16:59:59";

export const campKey = (site, id) => `salecamp:${site}:${id}`;
export const campPrefix = (site) => `salecamp:${site}:`;

const H7 = 7 * 3600 * 1000;

/** Ngày hôm nay theo giờ Việt Nam: "2026-09-14" */
export function vnToday(now = Date.now()) {
  return new Date(now + H7).toISOString().slice(0, 10);
}

/** "2026-10-10" giờ VN → GMT cho WooCommerce. start = 00:00:00, end = 23:59:59. Sai ngày → null. */
export function vnDateToGmt(date, edge = "start") {
  const s = String(date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T${edge === "end" ? "23:59:59" : "00:00:00"}+07:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (new Date(d.getTime() + H7).toISOString().slice(0, 10) !== s) return null; // 30/02 lăn sang tháng sau
  return d.toISOString().slice(0, 19);
}

/** "2026-10-09T17:00:00" (GMT, WooCommerce trả không có Z) → "2026-10-10" giờ VN */
export function gmtToVnDate(gmt) {
  const s = String(gmt || "");
  if (!s) return "";
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z");
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + H7).toISOString().slice(0, 10);
}

/** Kiểm tra khoảng ngày của đợt. Trả câu lỗi hoặc null. */
export function validateRange(from, to, today = vnToday()) {
  if (!vnDateToGmt(from)) return "Ngày bắt đầu không hợp lệ";
  if (!vnDateToGmt(to, "end")) return "Ngày kết thúc không hợp lệ";
  if (to < from) return "Ngày kết thúc phải từ ngày bắt đầu trở đi";
  if (to < today) return "Ngày kết thúc đã qua";
  return null;
}

/** Trạng thái đợt theo ngày VN: pending | running | expired */
export function campStatus(camp, today = vnToday()) {
  if (!camp) return null;
  if (camp.from && today < camp.from) return "pending";
  if (camp.to && today > camp.to) return "expired";
  return "running";
}

/**
 * Tính giá sale cho 1 đơn vị giá (SP đơn hoặc 1 biến thể).
 * rule = { sale_price } (gõ thẳng giá) hoặc { pct } (giảm %, làm tròn 1.000đ).
 * Trả { ok, regular, sale_price, pct, warnings } hoặc { ok:false, reason }.
 */
export function planPrice(unit, rule) {
  const regular = parseMoney(unit && unit.regular_price);
  if (!regular) return { ok: false, reason: "chưa có giá gốc" };
  let sale;
  const typed = rule && rule.sale_price != null && String(rule.sale_price).trim() !== "";
  if (typed) {
    sale = parseMoney(rule.sale_price);
  } else {
    const p = parsePercent(rule && rule.pct);
    if (p == null) return { ok: false, reason: "% giảm không hợp lệ (1–99)" };
    sale = saleFromOld(regular, p);
  }
  if (!sale || sale >= regular) return { ok: false, reason: "giá sale phải thấp hơn giá gốc" };
  const pct = computePercent(regular, sale);
  const warnings = [];
  if (pct > PCT_WARN) warnings.push(`giảm ${Math.round(pct)}% — trên 50%, kiểm tra lại quy định khuyến mại`);
  return { ok: true, regular, sale_price: String(sale), pct, warnings };
}

/** Chụp giá sale hiện có của 1 đơn vị giá. */
export function snapshotSale(unit) {
  return {
    sale_price: unit && unit.sale_price ? String(unit.sale_price) : "",
    from: (unit && unit.date_on_sale_from_gmt) || "",
    to: (unit && unit.date_on_sale_to_gmt) || "",
  };
}

/**
 * Kết thúc đợt với 1 đơn vị giá:
 *   "restore" — giá sale hiện tại vẫn là giá tool đặt, hoặc đã trống (WooCommerce tự xoá khi hết hạn).
 *   "manual"  — giá đã bị người sửa tay sau khi áp → không đè.
 */
export function endUnitDecision(unit, unitState) {
  const cur = unit && unit.sale_price ? String(unit.sale_price) : "";
  if (!cur) return "restore";
  if (unitState && parseMoney(cur) === parseMoney(unitState.set_sale)) return "restore";
  return "manual";
}

/** Giá CŨ cần lưu khi áp đợt. Áp lại lên SP đang trong đợt → giữ giá cũ ban đầu, không lưu nhầm giá đợt. */
export function choosePrev(unit, unitState) {
  if (unitState && unitState.prev && endUnitDecision(unit, unitState) === "restore") return unitState.prev;
  return snapshotSale(unit);
}

/** Payload trả lại giá cũ. */
export function restorePayload(prev) {
  if (!prev || !prev.sale_price) return { sale_price: "" };
  return {
    sale_price: String(prev.sale_price),
    date_on_sale_from_gmt: prev.from || PAST_GMT,
    date_on_sale_to_gmt: prev.to || FAR_GMT,
  };
}

/**
 * Danh mục khi áp đợt. Chỉ ghi nhận category_added khi CHÍNH tool gắn thêm — SP vốn đã nằm
 * trong danh mục đó thì kết thúc đợt không gỡ. Áp lại với danh mục khác → gỡ danh mục cũ tool đã gắn.
 */
export function planCategories(currentIds, saleCatId, prevState) {
  let base = (currentIds || []).map(Number).filter(Boolean);
  if (prevState && prevState.category_added && prevState.category_id) {
    base = base.filter((id) => id !== Number(prevState.category_id));
  }
  const cat = Number(saleCatId) || null;
  const added = !!cat && !base.includes(cat);
  return { ids: added ? [...base, cat] : base, category_id: cat, category_added: added };
}

/** Danh mục khi kết thúc đợt. */
export function endCategories(currentIds, state) {
  const cur = (currentIds || []).map(Number).filter(Boolean);
  if (!state || !state.category_added || !state.category_id) return { ids: cur, changed: false };
  const ids = cur.filter((id) => id !== Number(state.category_id));
  return { ids, changed: ids.length !== cur.length };
}

export function sameIds(a, b) {
  const x = [...(a || [])].map(Number).sort((m, n) => m - n);
  const y = [...(b || [])].map(Number).sort((m, n) => m - n);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Nhãn biến thể: "Zoom 5x / Đen" */
export function variationLabel(v) {
  const a = (v && v.attributes) || [];
  return a.map((x) => x && x.option).filter(Boolean).join(" / ") || `#${v && v.id}`;
}
