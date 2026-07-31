import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// LỖI ĐÃ SỬA (2026-07-31): bảng "brand × nhân sự" cộng lại KHÔNG khớp bảng "theo nhân sự".
// Tháng 7/2026 lệch 10.005.000đ ở cột LN sau hoàn (331.929tr vs 321.925tr).
//
// Gốc: doanh thu từng dòng SP lấy GIÁ NIÊM YẾT nên tổng các dòng cao hơn giá trị đơn thật
// (chiết khấu cấp đơn không phản ánh vào dòng). Công thức cũ Noma = max(0, tổng đơn − Doscom
// per-SP) bị KẸP về 0 khi Doscom per-SP vượt tổng đơn → tổng bảng brand phình lên.
//
// Cách sửa: quy tỉ lệ per-SP về đúng giá trị đơn thật RỒI mới tách brand.
// Bất biến bắt buộc: noma + doscom === tổng đơn thật của nguồn, với MỌI dữ liệu.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const src = html.match(/^[ \t]*function brandSplit\(key,excl\)\{[\s\S]*?\n[ \t]*\}/m);
assert.ok(src, "không trích được brandSplit từ index.html");

function build(D, range) {
  const EXCL = {};
  const inR = (d) => d >= range.start && d <= range.end;
  const sumByDate = (o) => { let s = 0; for (const d in o || {}) if (inR(d)) s += Number(o[d]) || 0; return s; };
  const isNomaP = (p) => /^\s*noma/i.test(p || "");
  return new Function("D", "EXCL", "sumByDate", "isNomaP", `${src[0]}\nreturn brandSplit;`)(D, EXCL, sumByDate, isNomaP);
}
const range = { start: "2026-07-01", end: "2026-07-31" };
const mk = (ord, prods) => ({ revenue: { source_groups: { S: {
  order_revenue_by_status_by_date: ord, products_by_status: prods } } } });

test("KHÔNG dùng lại công thức kẹp Math.max(0, …) đã gây lệch", () => {
  const brand = html.match(/function renderBrandCost\(\)\{[\s\S]*?\n  \}/)[0];
  assert.doesNotMatch(brand, /Math\.max\(0,\s*tr\s*-\s*dP\)/, "quay lại phần dư kẹp 0 là tái tạo lỗi cũ");
  assert.match(brand, /brandSplit\(k,\{\}\)/, "cột gộp phải qua brandSplit");
  assert.match(brand, /brandSplit\(k,EXCL_RET\)/, "cột sau hoàn phải qua brandSplit");
});

test("noma + doscom = ĐÚNG giá trị đơn thật, kể cả khi per-SP cao hơn", () => {
  // Đơn thật 100 (đã chiết khấu) nhưng dòng SP cộng lại 120 → phải co về 100
  const D = mk({ delivered: { "2026-07-05": 100 } }, { delivered: {
    "Noma 911": { by_date: { "2026-07-05": 70 } },
    D1: { by_date: { "2026-07-05": 50 } },
  } });
  const r = build(D, range)("S", {});
  assert.equal(Math.round(r.noma + r.doscom), 100, "tổng phải bằng giá trị đơn thật");
  assert.equal(Math.round(r.noma), 58, "70/120 × 100");
  assert.equal(Math.round(r.doscom), 42, "50/120 × 100");
});

test("trường hợp từng làm KẸP 0: Doscom per-SP vượt tổng đơn", () => {
  const D = mk({ delivered: { "2026-07-05": 100 } }, { delivered: {
    "Noma 911": { by_date: { "2026-07-05": 5 } },
    D1: { by_date: { "2026-07-05": 130 } },
  } });
  const r = build(D, range)("S", {});
  assert.equal(Math.round(r.noma + r.doscom), 100, "vẫn phải bằng 100, không phình lên 130");
  assert.ok(r.noma > 0, "Noma không bị kẹp về 0");
  // Công thức cũ sẽ ra noma=0, doscom=130 → tổng 130, phình 30
});

test("loại đơn hoàn ở CẢ tử số lẫn mẫu số", () => {
  const D = mk(
    { delivered: { "2026-07-05": 100 }, returned: { "2026-07-06": 50 } },
    { delivered: { "Noma 911": { by_date: { "2026-07-05": 60 } }, D1: { by_date: { "2026-07-05": 40 } } },
      returned: { D1: { by_date: { "2026-07-06": 50 } } } }
  );
  const f = build(D, range);
  assert.equal(Math.round(f("S", {}).noma + f("S", {}).doscom), 150, "gộp = 100 + 50");
  const net = f("S", { returned: 1 });
  assert.equal(Math.round(net.noma + net.doscom), 100, "sau hoàn chỉ còn đơn đã giao");
  assert.equal(Math.round(net.doscom), 40, "đơn hoàn phải biến mất khỏi cả Doscom");
});

test("đơn bán SP ngoài danh mục → dồn về Noma, không mất tiền", () => {
  const D = mk({ delivered: { "2026-07-05": 100 } }, { delivered: {} });
  const r = build(D, range)("S", {});
  assert.equal(Math.round(r.noma + r.doscom), 100, "không được đánh rơi doanh thu");
  assert.equal(Math.round(r.noma), 100);
});

test("nguồn không tồn tại / rỗng → 0, không NaN", () => {
  const f = build(mk({}, {}), range);
  const r = f("KHONG_CO", {}), r2 = f("S", {});
  for (const x of [r.noma, r.doscom, r2.noma, r2.doscom]) {
    assert.equal(x, 0);
    assert.ok(!Number.isNaN(x));
  }
});
