// Ràng buộc 3 chiều giữa GIÁ GỐC ↔ % GIẢM ↔ GIÁ BÁN cho trang Đăng sản phẩm.
//
// Ba tình huống người dùng gặp:
//   1. Có giá gốc, gõ % giảm      → tính ra giá bán.
//   2. Có giá bán, gõ % giảm      → tính ngược ra giá gốc (giá bán ÷ (1 − %)).
//   3. Gõ cả hai giá              → tự hiện % giảm.
//
// Tách khỏi HTML để test được: ba chiều này rất dễ đá nhau (sửa ô A → tính ô B →
// ô B lại tính ngược ô A) và sai số làm tròn thì lệch giá thật lên website.
//
// Làm tròn tới BỘI SỐ 1.000đ — giá bán lẻ Việt Nam không ai để lẻ trăm đồng.

export const ROUND_STEP = 1000;

/** "1.234.000" / "1234000đ" / 1234000 → 1234000 · rác → 0 */
export function parseMoney(v) {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  const digits = String(v == null ? "" : v).replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** 1234000 → "1.234.000" */
export function formatMoney(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function roundPrice(n, step = ROUND_STEP) {
  const v = Number(n) || 0;
  if (v <= 0) return 0;
  return Math.round(v / step) * step;
}

/** "20" / "20%" / "20,5" → 20 · ngoài khoảng 0–99 → null (100% thì giá bán = 0, vô nghĩa) */
export function parsePercent(v) {
  if (v == null || v === "") return null;
  const s = String(v).replace(",", ".").replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  return n;
}

/** % gọn: 20 → "20" · 20.04 → "20" · 20.5 → "20,5" */
export function formatPercent(n) {
  if (n == null) return "";
  const r = Math.round(n * 10) / 10;
  const s = Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(r)) : String(r);
  return s.replace(".", ",");
}

/** % giảm từ 2 giá. Không hợp lệ (thiếu giá, bán ≥ gốc) → null. */
export function computePercent(oldPrice, salePrice) {
  const o = parseMoney(oldPrice);
  const s = parseMoney(salePrice);
  if (!o || !s || s >= o) return null;
  return (1 - s / o) * 100;
}

/** Có giá gốc + % → giá bán (đã làm tròn). */
export function saleFromOld(oldPrice, percent) {
  const o = parseMoney(oldPrice);
  const p = parsePercent(percent);
  if (!o || p == null) return 0;
  return roundPrice(o * (1 - p / 100));
}

/** Có giá bán + % → giá gốc (đã làm tròn). */
export function oldFromSale(salePrice, percent) {
  const s = parseMoney(salePrice);
  const p = parsePercent(percent);
  if (!s || p == null) return 0;
  return roundPrice(s / (1 - p / 100));
}

/**
 * Người dùng vừa gõ ô % → tính lại ô giá CÒN LẠI.
 *
 * `anchor` = ô giá vừa được gõ gần nhất, giữ nguyên không đụng vào:
 *   "old"  → giữ giá gốc, tính giá bán
 *   "sale" → giữ giá bán, tính giá gốc
 * Chỉ có 1 ô có số thì ô đó làm gốc, bất kể anchor.
 * Trả { old, sale, changed } — changed = ô nào vừa bị tính lại ("old"|"sale"|null).
 */
export function applyPercent({ old: oldPrice, sale: salePrice, percent, anchor = "old" }) {
  const o = parseMoney(oldPrice);
  const s = parseMoney(salePrice);
  const p = parsePercent(percent);
  if (p == null) return { old: o, sale: s, changed: null };

  const use = !o && s ? "sale" : !s && o ? "old" : anchor;
  if (use === "sale") {
    if (!s) return { old: o, sale: s, changed: null };
    return { old: oldFromSale(s, p), sale: s, changed: "old" };
  }
  if (!o) return { old: o, sale: s, changed: null };
  return { old: o, sale: saleFromOld(o, p), changed: "sale" };
}
