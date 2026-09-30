/* Menu "Chốt chưa lên đơn": lọc + tổng hợp danh sách SĐT mà CRM Pancake ghi "Chốt đơn"
 * nhưng Pancake POS không có đơn (kind = "none") hoặc chỉ có đơn huỷ (kind = "cancel_only").
 * Dữ liệu dựng bởi scripts/build_chot_khong_don.py → data/chot-khong-don.json.
 * Dùng chung giữa trang chot-khong-don.html và tests/chot-khong-don.test.mjs.
 */

export const KIND_LABEL = { none: "Chưa có đơn", cancel_only: "Chỉ có đơn huỷ" };
export const KHONG_RO = "(trống)";

const boDau = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** f = {kind, month:'YYYY-MM', sale, runner, q}; mỗi điều kiện rỗng = bỏ qua. */
export function locDong(rows, f = {}) {
  const q = boDau(f.q).trim();
  const qSo = String(f.q || "").replace(/\D/g, "");
  return rows.filter((r) => {
    if (f.kind && r.kind !== f.kind) return false;
    if (f.month && !String(r.created || "").startsWith(f.month)) return false;
    if (f.sale && (r.sale || KHONG_RO) !== f.sale) return false;
    if (f.runner && (r.runner || KHONG_RO) !== f.runner) return false;
    if (q) {
      const soKhop = qSo.length >= 3 && String(r.phone).includes(qSo);
      const chuKhop = boDau([r.name, r.note, r.sale, r.runner].join(" ")).includes(q);
      if (!soKhop && !chuKhop) return false;
    }
    return true;
  });
}

/** Danh sách giá trị khác nhau của một trường, xếp theo số dòng giảm dần. */
export function giaTri(rows, field) {
  const m = new Map();
  for (const r of rows) {
    const v = field === "month" ? String(r.created || "").slice(0, 7) : (r[field] || KHONG_RO);
    if (v) m.set(v, (m.get(v) || 0) + 1);
  }
  const arr = [...m.entries()];
  return field === "month"
    ? arr.sort((a, b) => b[0].localeCompare(a[0])).map(([v, n]) => ({ v, n }))
    : arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v, n]) => ({ v, n }));
}

/** Đếm theo một trường (sale / runner / month), tách hai loại. */
export function tongHop(rows, field) {
  const m = new Map();
  for (const r of rows) {
    const k = field === "month" ? String(r.created || "").slice(0, 7) : (r[field] || KHONG_RO);
    const o = m.get(k) || { key: k, none: 0, cancel_only: 0, total: 0 };
    if (r.kind === "none" || r.kind === "cancel_only") o[r.kind] += 1;
    o.total += 1;
    m.set(k, o);
  }
  const arr = [...m.values()];
  return field === "month"
    ? arr.sort((a, b) => b.key.localeCompare(a.key))
    : arr.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

const csvO = (v) => {
  const s = String(v ?? "");
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** CSV mở thẳng bằng Excel: có BOM UTF-8, SĐT bọc ="…" để Excel không nuốt số 0 đầu. */
export function xuatCsv(rows) {
  const head = ["SĐT", "Tên khách", "Loại", "Ngày tạo contact", "Cập nhật lần cuối",
    "Sale phụ trách", "Người chạy QC", "Ghi chú", "Số contact", "Đơn huỷ"];
  const lines = [head.map(csvO).join(",")];
  for (const r of rows) {
    lines.push([
      '="' + r.phone + '"', r.name, KIND_LABEL[r.kind] || r.kind, r.created, r.modified,
      r.sale, r.runner, r.note, r.contacts,
      (r.orders || []).map((o) => o.id + " (" + o.date + ")").join("; "),
    ].map((v, i) => (i === 0 ? v : csvO(v))).join(","));
  }
  return "﻿" + lines.join("\r\n");
}
