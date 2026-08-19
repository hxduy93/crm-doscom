import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Bảng "Chi phí QC Facebook & doanh thu theo sản phẩm × nhân sự" (thêm 19/08/2026).
// Trích thẳng renderProductStaff() từ index.html rồi chạy trên dữ liệu giả — đổi công
// thức hay đổi nguồn số là đỏ ngay, cùng cách làm với revenue-after-returns.test.mjs.

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
    getElementById: (id) => (id === "product-staff-rows" ? { set innerHTML(v) { out = v; }, get innerHTML() { return out; } } : null),
  };
  const build = new Function("D", "range", "document", `${deps}\n${fnSrc}\nrenderProductStaff();`);
  build(D, { start: "2026-07-01", end: "2026-07-31" }, document);
  return out;
}

const D = {
  ad_spend_by_staff: {
    DUY: {
      P1: { by_date: { "2026-07-05": 1_000_000 } },
      // Có chạy QC ở kỳ khác, kỳ này không chi đồng nào
      P3: { by_date: { "2026-06-01": 900_000 } },
    },
    PHUONG_NAM: {
      P1: { by_date: { "2026-07-05": 500_000 } },
      P2: { by_date: { "2026-07-05": 2_000_000 } },
    },
  },
  revenue: {
    source_groups: {
      DUY: {
        products_by_status: {
          delivered: {
            P1: { by_date: { "2026-07-05": 4_000_000 } },
            P3: { by_date: { "2026-07-05": 300_000 } },
            P9: { by_date: { "2026-07-05": 700_000 } },
          },
          returned: { P1: { by_date: { "2026-07-06": 0 } } },
        },
      },
      PHUONG_NAM: {
        products_by_status: {
          delivered: {
            P1: { by_date: { "2026-07-05": 2_000_000 } },
            P2: { by_date: { "2026-07-05": 1_000_000 } },
          },
        },
      },
    },
  },
};

test("chi phí lấy từ ad_spend_by_staff, doanh thu lấy từ dòng SP của chính nguồn đó", () => {
  const rows = run(D).split("</tr>");
  const p1 = rows.find((r) => r.includes("<b>P1</b>"));
  assert.ok(p1, "thiếu hàng P1");
  // Duy: 1tr chi / 4tr doanh thu = 25%; PN: 0,5tr / 2tr = 25%; tổng 1,5tr / 6tr = 25%
  assert.match(p1, /1\.000\.000đ/);
  assert.match(p1, /4\.000\.000đ/);
  assert.match(p1, /500\.000đ/);
  assert.match(p1, /2\.000\.000đ/);
  assert.match(p1, /1\.500\.000đ/);
  assert.match(p1, /6\.000\.000đ/);
  assert.equal((p1.match(/>25%</g) || []).length, 3, "cả 3 cột CIR của P1 phải là 25%");
});

test("SP chỉ một nhân sự chạy: nhân sự kia để gạch ngang, CIR>100% tô đỏ", () => {
  const p2 = run(D).split("</tr>").find((r) => r.includes("<b>P2</b>"));
  assert.ok(p2, "thiếu hàng P2");
  assert.match(p2, /2\.000\.000đ/);
  assert.match(p2, /1\.000\.000đ/);
  assert.match(p2, /color:#E5484D;font-weight:800">200%/, "CIR 200% phải đỏ");
});

test("hàng SP khác gom doanh thu của SP không có campaign FB gắn tên", () => {
  const oth = run(D).split("</tr>").find((r) => r.includes("SP khác"));
  assert.ok(oth, "thiếu hàng SP khác");
  assert.match(oth, /700\.000đ/, "P9 (không chạy QC) phải rơi vào hàng này");
});

test("hàng Tổng cộng đủ cả SP có chạy QC lẫn SP khác", () => {
  const tot = run(D).split("</tr>").find((r) => r.includes('class="tot"'));
  assert.ok(tot, "thiếu hàng Tổng");
  // Duy: chi 1tr, DT 4tr (P1) + 0,3tr (P3) + 0,7tr (SP khác) = 5tr
  // PN: chi 0,5tr + 2tr = 2,5tr, DT 2tr + 1tr = 3tr · Tổng: 3,5tr chi / 8tr DT
  assert.match(tot, /1\.000\.000đ/);
  assert.match(tot, /5\.000\.000đ/);
  assert.match(tot, /2\.500\.000đ/);
  assert.match(tot, /3\.000\.000đ/);
  assert.match(tot, /3\.500\.000đ/);
  assert.match(tot, /8\.000\.000đ/);
});

test("kỳ không có chi tiêu FB nào thì báo rõ, không vẽ bảng rỗng", () => {
  const out = run({ ad_spend_by_staff: {}, revenue: { source_groups: {} } });
  assert.match(out, /Không có chi tiêu Facebook theo sản phẩm trong kỳ/);
});

test("kỳ này không chi đồng nào mà vẫn có doanh thu → CIR để gạch ngang, KHÔNG in 0%", () => {
  const p3 = run(D).split("</tr>").find((r) => r.includes("<b>P3</b>"));
  assert.ok(p3, "thiếu hàng P3");
  assert.match(p3, /300\.000đ/);
  assert.doesNotMatch(p3, />0%</, "chi phí 0 mà in CIR 0% là đọc sai thành quảng cáo siêu rẻ");
});
