import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 26/10/2026: bảng "brand × nhân sự" tách NOMA/DOSCOM theo mã SP trong đơn → D2 Pro (mã
// D-013 chưa map) của Duy bị dồn hết về NOMA, lệch bảng "SP × nhân sự". Nay tách theo TÊN
// NGUỒN trước (dùng chung productFromSource), phần dư mới chia theo dòng SP.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("productFromSource ở phạm vi chung, dùng cho cả hai bảng", () => {
  assert.match(html, /\n  function productFromSource\(name\)\{/, "phải ở cấp ngoài, không lồng trong renderProductStaff");
  const bs = html.match(/function brandSplit\(key,excl\)\{[\s\S]*?\n    \}/)[0];
  assert.match(bs, /productFromSource\(name\)/, "brandSplit phải đọc tên nguồn");
  assert.match(bs, /var rest=ord-noma-doscom/, "phần dư = nguồn không đọc được tên");
});

test("brandSplit: nguồn D2 PRO vào DOSCOM, tổng vẫn bằng giá trị đơn thật", () => {
  const pfs = html.match(/function productFromSource\(name\)\{[\s\S]*?\n  \}/)[0];
  const bs = html.match(/function brandSplit\(key,excl\)\{[\s\S]*?\n    \}/)[0];
  const D = { revenue: { source_groups: { DUY: {
    order_revenue_by_status_by_date: { delivered: { "2026-10-01": 1000 } },
    sources: {
      "DUY - NOMA 911": { revenue_by_status_by_date: { delivered: { "2026-10-01": 600 } } },
      "DUY - D2 PRO":   { revenue_by_status_by_date: { delivered: { "2026-10-01": 300 } } },
      "Khác lạ":        { revenue_by_status_by_date: { delivered: { "2026-10-01": 100 } } },
    },
    products_by_status: { delivered: { "Noma 911": { by_date: { "2026-10-01": 600 } } } },
  } } } };
  const f = new Function("D", `
    var EXCL={}; function sumByDate(o){var s=0;for(var d in o)s+=o[d];return s;}
    var isNomaP=function(p){return /^\s*noma/i.test(p||'');};
    ${pfs}\n${bs}\n return brandSplit('DUY',{});`);
  const r = f(D);
  assert.equal(r.doscom, 300);
  assert.equal(r.noma, 700, "NOMA 911 600 + phần dư 100 (chỉ có dòng SP Noma)");
});
