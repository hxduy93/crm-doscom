import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Tên nguồn đơn Pancake → sản phẩm (bảng "SP × nhân sự"). 05/10/2026: nguồn đặt ĐÚNG quy ước
   "DUY - NOMA 880" / "DUY - NOMA 998" / "DUY - DR4 PRO" vẫn rơi "Nguồn khác" vì regex thiếu mã.
   Chạy hàm thật cắt từ index.html. */
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const i = html.indexOf("function productFromSource(");
let k = html.indexOf("{", i), d = 0, end = -1;
for (; k < html.length; k++) { if (html[k] === "{") d++; else if (html[k] === "}" && --d === 0) { end = k; break; } }
const productFromSource = new Function(html.slice(i, end + 1) + " return productFromSource;")();

test("nhận đủ các nguồn đang có đơn thật", () => {
  const cases = {
    "DUY - NOMA 911": "Noma 911",
    "DUY - NOMA 911 MESSENGER": "Noma 911",
    "PHƯƠNG NAM - NOMA911": "Noma 911",
    "DUY - NOMA 880": "Noma 880",
    "PHƯƠNG NAM - NOMA 880": "Noma 880",
    "DUY - NOMA 998": "Noma 998",
    "DUY - NOMA 130": "Noma 130",
    "DUY - DR4 PRO": "DR4 Pro",
    "DUY - DR1": "DR1",
    "PHƯƠNG NAM - D1": "D1",
    "DUY - D2 PRO": "D2",
    "PHƯƠNG NAM - D2 PRO": "D2",
    "PHƯƠNG NAM - DA8.1": "DA8.1",
  };
  for (const [src, want] of Object.entries(cases)) assert.equal(productFromSource(src), want, src);
});

test("nguồn không suy được vẫn trả null (về hàng Nguồn khác, không bỏ rơi)", () => {
  assert.equal(productFromSource("Bài của sale"), null);
  assert.equal(productFromSource(""), null);
});
