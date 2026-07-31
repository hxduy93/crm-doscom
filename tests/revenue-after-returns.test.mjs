import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Cột "SAU HOÀN" (thêm 2026-07-31) trong 2 bảng: "theo nhân sự" và "brand × nhân sự".
// ĐỊNH NGHĨA (chủ dự án): hoàn = đơn ĐANG HOÀN (returning) + ĐÃ HOÀN (returned) trên Pancake POS.
// Đơn HUỶ (canceled) KHÔNG phải hoàn → vẫn được tính trong số sau hoàn.
// Cột gộp cũ KHÔNG đổi (QUYẾT 2026-07-15) — revenue-source-gross.test.mjs canh việc đó.
// Test này trích thẳng logic inline từ index.html để đổi công thức là đỏ ngay.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function grabLine(re, name) {
  const m = html.match(re);
  if (!m) throw new Error("Không trích được " + name + " từ index.html (cấu trúc đổi?)");
  return m[0].trim();
}

const src = [
  grabLine(/^[ \t]*var EXCL=\{[^}]*\};/m, "EXCL"),
  grabLine(/^[ \t]*var EXCL_RET=\{[^}]*\};/m, "EXCL_RET"),
  grabLine(/^[ \t]*function inR\(d\)\{.*\}$/m, "inR"),
  grabLine(/^[ \t]*function sumByDate\(obj\)\{.*\}$/m, "sumByDate"),
  grabLine(/^[ \t]*function srcRevenue\(key\)\{.*\}$/m, "srcRevenue"),
  grabLine(/^[ \t]*function srcCogs\(key\)\{.*\}$/m, "srcCogs"),
  grabLine(/^[ \t]*function srcRevenueNet\(key\)\{.*\}$/m, "srcRevenueNet"),
  grabLine(/^[ \t]*function srcCogsNet\(key\)\{.*\}$/m, "srcCogsNet"),
  // 2 hàm dưới nằm trong renderBrandCost().
  // (srcDoscomRev/srcDoscomRevNet đã bị thay bằng brandSplit ngày 31/07/2026 —
  //  xem tests/brand-split-reconcile.test.mjs.)
  grabLine(/^[ \t]*var isNomaP=function\(p\)\{.*\};$/m, "isNomaP"),
  grabLine(/^[ \t]*function srcCogsNetBrand\(key,wantNoma\)\{.*\}$/m, "srcCogsNetBrand"),
].join("\n");

const build = new Function(
  "D",
  "range",
  `${src}\nreturn { EXCL_RET, srcRevenue, srcCogs, srcRevenueNet, srcCogsNet, srcCogsNetBrand };`
);

// Giá nhập: Noma 911 = 50/cái, D1 = 20/cái.
const D = {
  product_costs: { "Noma 911": { gia_nhap_vnd: 50 }, D1: { gia_nhap_vnd: 20 } },
  revenue: {
    source_groups: {
      TEST: {
        order_revenue_by_status_by_date: {
          delivered: { "2026-07-05": 100 },
          canceled: { "2026-07-05": 30 },
          returning: { "2026-07-05": 20 },
          returned: { "2026-07-06": 10 },
          other: { "2026-07-05": 50 },
        },
        products_by_status: {
          delivered: {
            "Noma 911": { by_date: { "2026-07-05": 60 }, units_by_date: { "2026-07-05": 2 } },
            D1: { by_date: { "2026-07-05": 40 }, units_by_date: { "2026-07-05": 1 } },
          },
          returning: { D1: { by_date: { "2026-07-05": 20 }, units_by_date: { "2026-07-05": 1 } } },
          returned: { "Noma 911": { by_date: { "2026-07-06": 10 }, units_by_date: { "2026-07-06": 1 } } },
          canceled: { D1: { by_date: { "2026-07-05": 30 }, units_by_date: { "2026-07-05": 1 } } },
          other: { D1: { by_date: { "2026-07-05": 50 }, units_by_date: { "2026-07-05": 2 } } },
        },
      },
    },
  },
};
const range = { start: "2026-07-01", end: "2026-07-14" };
const F = build(D, range);

test("EXCL_RET đúng định nghĩa hoàn: chỉ returning + returned", () => {
  assert.deepEqual(F.EXCL_RET, { returning: 1, returned: 1 });
  assert.ok(!("canceled" in F.EXCL_RET), "đơn huỷ KHÔNG phải đơn hoàn — không được loại");
});

test("srcRevenueNet = doanh thu gộp trừ đơn đang hoàn + đã hoàn", () => {
  // 100 (delivered) + 30 (canceled) + 50 (other) = 180; bỏ 20 (returning) + 10 (returned)
  assert.equal(F.srcRevenueNet("TEST"), 180);
});

test("thêm cột sau hoàn KHÔNG đụng cột gộp", () => {
  assert.equal(F.srcRevenue("TEST"), 210, "doanh thu gộp phải giữ nguyên mọi trạng thái");
  assert.equal(F.srcCogs("TEST"), 250, "giá vốn gộp phải giữ nguyên mọi trạng thái");
});

test("srcCogsNet không tính giá vốn hàng hoàn (hàng quay lại kho)", () => {
  // Noma 911: 2 cái delivered × 50 = 100 (bỏ 1 cái returned)
  // D1: (1 delivered + 1 canceled + 2 other) × 20 = 80 (bỏ 1 cái returning)
  assert.equal(F.srcCogsNet("TEST"), 180);
});

test("LN sau hoàn = DT sau hoàn − chi phí QC − giá vốn sau hoàn", () => {
  const spend = 60;
  assert.equal(F.srcRevenueNet("TEST") - spend - F.srcCogsNet("TEST"), 180 - 60 - 180);
});

// Việc tách brand giờ do brandSplit đảm nhiệm (chia tỉ lệ về giá trị đơn thật, không còn
// công thức phần dư kẹp 0) — kiểm ở tests/brand-split-reconcile.test.mjs.

test("brand: giá vốn sau hoàn tách Noma/Doscom, cộng lại bằng tổng", () => {
  assert.equal(F.srcCogsNetBrand("TEST", true), 100, "Noma 911: 2 cái × 50");
  assert.equal(F.srcCogsNetBrand("TEST", false), 80, "D1: 4 cái × 20");
  assert.equal(
    F.srcCogsNetBrand("TEST", true) + F.srcCogsNetBrand("TEST", false),
    F.srcCogsNet("TEST"),
    "tách brand xong cộng lại phải bằng giá vốn sau hoàn của nguồn"
  );
});

test("cột sau hoàn chỉ cộng ngày trong khoảng lọc", () => {
  const D2 = JSON.parse(JSON.stringify(D));
  D2.revenue.source_groups.TEST.order_revenue_by_status_by_date.delivered["2026-08-01"] = 999;
  const { srcRevenueNet } = build(D2, range);
  assert.equal(srcRevenueNet("TEST"), 180, "ngày ngoài khoảng không được cộng");
});

test("nguồn không tồn tại → 0, không nổ", () => {
  assert.equal(F.srcRevenueNet("KHONG_CO"), 0);
  assert.equal(F.srcCogsNet("KHONG_CO"), 0);
  assert.equal(F.srcCogsNetBrand("KHONG_CO", true), 0);
});
