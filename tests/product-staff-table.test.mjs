import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Bảng "Chi phí QC Facebook & doanh thu theo sản phẩm × nhân sự".

   19/08/2026 đổi nguồn số của cột doanh thu: trước cộng DÒNG SẢN PHẨM trong đơn, nay lọc
   theo NGUỒN ĐƠN Pancake ("DUY - NOMA 230"). Lý do: dòng SP lấy giá niêm yết nên tổng cao
   hơn tiền khách trả ~3,6%, và SKU ngoài danh mục POS (NOMA 120/230/350/680) không có dòng
   nào để cộng — nhìn như chi quảng cáo mà không ra doanh thu.

   Trích thẳng renderProductStaff() từ index.html rồi chạy trên dữ liệu giả. */

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function grab(re, name) {
  const m = html.match(re);
  if (!m) throw new Error("Không trích được " + name + " từ index.html (cấu trúc đổi?)");
  return m[0].trim();
}

const start = html.indexOf("  function renderProductStaff(){");
const end = html.indexOf("  function renderBrandCost(){");
if (start < 0 || end < 0 || end < start) throw new Error("Không tìm thấy renderProductStaff/renderBrandCost");
const fnSrc = html.slice(start, end).trim();

const deps = [
  grab(/^[ \t]*var EXCL=\{[^}]*\};/m, "EXCL"),
  grab(/^[ \t]*function inR\(d\)\{.*\}$/m, "inR"),
  grab(/^[ \t]*function sumByDate\(obj\)\{.*\}$/m, "sumByDate"),
  grab(/^[ \t]*function vnd\(n\)\{.*\}$/m, "vnd"),
].join("\n");

function run(D) {
  let out = "";
  const document = {
    getElementById: (id) => (id === "product-staff-rows" ? { set innerHTML(v) { out = v; } } : null),
  };
  const build = new Function("D", "range", "document", `${deps}\n${fnSrc}\nrenderProductStaff();`);
  build(D, { start: "2026-07-01", end: "2026-07-31" }, document);
  return out;
}

const day = "2026-07-05";
const src = (amount) => ({ revenue_by_status_by_date: { delivered: { [day]: amount } } });
const spend = (amount) => ({ by_date: { [day]: amount } });

const D = {
  ad_spend_by_staff: {
    DUY: {
      "Noma 911": spend(1_000_000),
      "Noma 230": spend(3_000_000),
      "(không đọc được link)": spend(700_000),
    },
    PHUONG_NAM: {
      "Noma 911": spend(500_000),
      DR1: spend(2_000_000),
    },
  },
  revenue: {
    source_groups: {
      DUY: {
        sources: {
          "DUY - NOMA 911": src(4_000_000),
          "DUY - NOMA 911 MESSENGER": src(1_000_000),   // hậu tố tự do, vẫn là Noma 911
          "DUY - NOMA 230": src(6_000_000),
          "DUY - NOMA 922": src(800_000),               // có doanh thu, không chạy QC
          "DUY - Khách cũ": src(900_000),               // ngoài quy ước → Nguồn khác
        },
      },
      PHUONG_NAM: {
        sources: {
          "PHƯƠNG NAM - NOMA911": src(2_000_000),       // viết liền, không có dấu cách
          "PHƯƠNG NAM - DR1": src(1_000_000),
        },
      },
    },
  },
};

const rowsOf = (D2) => run(D2).split("</tr>");
const rowOf = (D2, label) => rowsOf(D2).find((r) => r.includes(label));

test("doanh thu lấy theo NGUỒN ĐƠN, gộp mọi nguồn cùng sản phẩm", () => {
  const r = rowOf(D, "<b>Noma 911</b>");
  assert.ok(r, "thiếu hàng Noma 911");
  // Duy: 4tr + 1tr (MESSENGER) = 5tr, chi 1tr → CIR 20%
  assert.match(r, /5\.000\.000đ/);
  assert.match(r, /color:#16A34A;font-weight:800">20%/);
  // Phương Nam viết liền "NOMA911" vẫn về đúng hàng này: 2tr doanh thu / 0,5tr chi = 25%
  assert.match(r, /2\.000\.000đ/);
  assert.match(r, />25%</);
});

test("SKU ngoài danh mục POS vẫn có doanh thu nhờ nguồn đơn", () => {
  const r = rowOf(D, "<b>Noma 230</b>");
  assert.ok(r, "thiếu hàng Noma 230");
  assert.match(r, /3\.000\.000đ/);   // chi
  assert.match(r, /6\.000\.000đ/);   // thu
  assert.match(r, />50%</);
});

test("sản phẩm có doanh thu mà không chạy QC vẫn hiện, CIR để trống", () => {
  const r = rowOf(D, "<b>Noma 922</b>");
  assert.ok(r, "thiếu hàng Noma 922");
  assert.match(r, /800\.000đ/);
  assert.doesNotMatch(r, />\d+%</, "không có chi phí thì không được bịa ra CIR");
});

test("nguồn đặt tên ngoài quy ước không bị bỏ rơi — dồn vào hàng Nguồn khác", () => {
  const r = rowOf(D, "Nguồn khác");
  assert.ok(r, "thiếu hàng Nguồn khác");
  assert.match(r, /900\.000đ/);
});

test("chi phí không đọc được link vẫn tính, nhưng CIR để gạch ngang", () => {
  const r = rowOf(D, "Chưa đọc được link");
  assert.ok(r, "thiếu hàng chưa đọc được link");
  assert.match(r, /700\.000đ/);
  assert.doesNotMatch(r, /∞/, "hàng này bôi đỏ ∞ sẽ bị đọc nhầm là lỗ nặng");
});

test("hàng Tổng cộng đủ mọi nguồn — không được hụt so với doanh thu nhóm", () => {
  const r = rowOf(D, 'class="tot"');
  assert.ok(r, "thiếu hàng Tổng");
  // Duy: chi 1 + 3 + 0,7 = 4,7tr · thu 4 + 1 + 6 + 0,8 + 0,9 = 12,7tr
  assert.match(r, /4\.700\.000đ/);
  assert.match(r, /12\.700\.000đ/);
  // Phương Nam: chi 2,5tr · thu 3tr · Tổng hai người: 7,2tr chi / 15,7tr thu
  assert.match(r, /2\.500\.000đ/);
  assert.match(r, /3\.000\.000đ/);
  assert.match(r, /7\.200\.000đ/);
  assert.match(r, /15\.700\.000đ/);
});

test("kỳ không có chi tiêu FB nào thì báo rõ, không vẽ bảng rỗng", () => {
  const out = run({ ad_spend_by_staff: {}, revenue: { source_groups: {} } });
  assert.match(out, /Không có chi tiêu Facebook theo sản phẩm trong kỳ/);
});
