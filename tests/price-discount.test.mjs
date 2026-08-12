// Test ràng buộc 3 chiều giá gốc ↔ % giảm ↔ giá bán.
//
// Việc cần bảo vệ: đây là số TIỀN lên thẳng website. Sai một chiều tính là bán
// hớ hoặc treo giá gốc ảo. Đặc biệt canh chừng chuyện tính vòng: gõ % ra giá
// bán, rồi từ 2 giá đó tính ngược % phải ra đúng con số vừa gõ.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMoney, formatMoney, roundPrice, parsePercent, formatPercent,
  computePercent, saleFromOld, oldFromSale, applyPercent,
} from "../functions/lib/price-discount.js";

test("đọc số tiền từ chuỗi người dùng gõ", () => {
  assert.equal(parseMoney("1.234.000"), 1234000);
  assert.equal(parseMoney("219000đ"), 219000);
  assert.equal(parseMoney(438000), 438000);
  assert.equal(parseMoney(""), 0);
  assert.equal(parseMoney("abc"), 0);
  assert.equal(parseMoney(null), 0);
});

test("hiển thị số tiền có dấu chấm ngăn nghìn", () => {
  assert.equal(formatMoney(1234000), "1.234.000");
  assert.equal(formatMoney(999), "999");
  assert.equal(formatMoney(0), "0");
});

test("làm tròn tới bội số 1.000", () => {
  assert.equal(roundPrice(273750), 274000);
  assert.equal(roundPrice(219400), 219000);
  assert.equal(roundPrice(0), 0);
});

test("đọc %: nhận dấu phẩy, chặn giá trị vô nghĩa", () => {
  assert.equal(parsePercent("20"), 20);
  assert.equal(parsePercent("20%"), 20);
  assert.equal(parsePercent("20,5"), 20.5);
  assert.equal(parsePercent("0"), null, "giảm 0% thì không phải khuyến mãi");
  assert.equal(parsePercent("100"), null, "giảm 100% thì giá bán = 0");
  assert.equal(parsePercent("150"), null);
  assert.equal(parsePercent(""), null);
});

test("hiển thị % gọn, dùng dấu phẩy kiểu Việt", () => {
  assert.equal(formatPercent(20), "20");
  assert.equal(formatPercent(20.04), "20");
  assert.equal(formatPercent(20.5), "20,5");
  assert.equal(formatPercent(null), "");
});

test("gõ 2 giá → hiện % giảm", () => {
  assert.equal(formatPercent(computePercent(500000, 400000)), "20");
  assert.equal(formatPercent(computePercent(438000, 219000)), "50");
});

test("giá bán ≥ giá gốc thì KHÔNG có % giảm", () => {
  assert.equal(computePercent(400000, 400000), null);
  assert.equal(computePercent(400000, 500000), null);
  assert.equal(computePercent(0, 400000), null);
});

test("giá gốc + % → giá bán, đã làm tròn", () => {
  assert.equal(saleFromOld(500000, 20), 400000);
  assert.equal(saleFromOld(219000, 15), 186000);      // 186.150 → 186.000
  assert.equal(saleFromOld(0, 20), 0);
});

test("giá bán + % → giá gốc, đã làm tròn", () => {
  assert.equal(oldFromSale(400000, 20), 500000);
  assert.equal(oldFromSale(219000, 20), 274000);      // 273.750 → 274.000
});

test("gõ % khi chỉ có giá gốc → tính giá bán", () => {
  const r = applyPercent({ old: "500.000", sale: "", percent: "20" });
  assert.deepEqual(r, { old: 500000, sale: 400000, changed: "sale" });
});

test("gõ % khi chỉ có giá bán → tính ngược giá gốc", () => {
  const r = applyPercent({ old: "", sale: "400.000", percent: "20" });
  assert.deepEqual(r, { old: 500000, sale: 400000, changed: "old" });
});

test("có cả 2 giá: giữ ô vừa gõ, tính lại ô kia", () => {
  const giuGiaGoc = applyPercent({ old: "500.000", sale: "450.000", percent: "20", anchor: "old" });
  assert.deepEqual(giuGiaGoc, { old: 500000, sale: 400000, changed: "sale" });

  const giuGiaBan = applyPercent({ old: "500.000", sale: "400.000", percent: "50", anchor: "sale" });
  assert.deepEqual(giuGiaBan, { old: 800000, sale: 400000, changed: "old" });
});

test("% rỗng hoặc vô lý → không đụng vào giá nào", () => {
  for (const p of ["", "0", "100", "abc"]) {
    const r = applyPercent({ old: "500.000", sale: "400.000", percent: p });
    assert.equal(r.changed, null, `% = "${p}" không được sửa giá`);
    assert.equal(r.old, 500000);
    assert.equal(r.sale, 400000);
  }
});

test("chưa có giá nào mà gõ % → không bịa ra số", () => {
  const r = applyPercent({ old: "", sale: "", percent: "20" });
  assert.deepEqual(r, { old: 0, sale: 0, changed: null });
});

test("tính vòng: gốc + % → bán, rồi 2 giá đó phải ra lại đúng % vừa gõ", () => {
  for (const [goc, pct] of [[500000, 20], [219000, 10], [1290000, 35], [99000, 25]]) {
    const ban = saleFromOld(goc, pct);
    const lai = computePercent(goc, ban);
    assert.ok(Math.abs(lai - pct) < 1,
      `gốc ${goc} giảm ${pct}% → bán ${ban} → tính lại ra ${lai.toFixed(2)}%`);
  }
});

// ── Nối vào trang: 3 ô phải có mặt và file logic phải được deploy ──
// Trang nạp js/price-discount.js dạng module. Quên copy file đó vào dist là
// production 404 → toàn bộ phần tính % chết lặng, giao diện vẫn hiện đủ 3 ô.
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../product-publisher.html", import.meta.url), "utf8");
const buildSh = readFileSync(new URL("../scripts/build-dist.sh", import.meta.url), "utf8");

test("trang Đăng sản phẩm có đủ ô giá bán, % giảm, giá gốc", () => {
  assert.match(page, /id="priceInp"/, "thiếu ô giá bán");
  assert.match(page, /id="discInp"/, "thiếu ô % giảm");
  assert.match(page, /id="oldInp"/, "thiếu ô giá gốc");
  // thứ tự hiển thị: giá bán → % giảm → giá gốc
  assert.ok(page.indexOf('id="priceInp"') < page.indexOf('id="discInp"'));
  assert.ok(page.indexOf('id="discInp"') < page.indexOf('id="oldInp"'));
});

test("trang nạp đúng file logic dùng chung, không chép lại công thức", () => {
  assert.match(page, /import \* as PD from "\.\/js\/price-discount\.js"/);
  assert.ok(!/function saleFromOld/.test(page), "công thức phải nằm ở lib, không chép vào HTML");
});

test("build-dist.sh có copy price-discount.js vào dist", () => {
  assert.match(buildSh, /cp functions\/lib\/price-discount\.js dist\/js\//,
    "quên copy thì production 404, phần tính % chết lặng");
});
