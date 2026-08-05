import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// GỘP 2026-08-05 (chủ dự án): đơn đăng ký NOMA 911 và đơn đăng ký ba landing sản phẩm
// (680 · 350 · 230) phải nằm trong MỘT bảng, không tách hai module như trước.
// Test này canh hai thứ: (1) trang chỉ còn một khối đơn đăng ký, (2) hàm cộng tổng
// cộng đủ bốn sản phẩm và KHÔNG coi endpoint lỗi là "0 đơn".

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("chỉ còn MỘT khối đơn đăng ký trên trang", () => {
  assert.equal((html.match(/id="dk-body"/g) || []).length, 1, "phải có đúng 1 thân bảng đơn đăng ký");
  assert.doesNotMatch(html, /id="lp-body"|id="lp-mod"|id="noma-body"/,
    "còn sót module đơn đăng ký cũ — đã gộp thì không được tách lại hai bảng");
  assert.doesNotMatch(html, /function (renderNoma|renderLanding|loadNoma|loadLanding)\b/,
    "còn hàm vẽ của module cũ");
});

test("bảng gộp đủ bốn landing, mỗi landing hai nguồn", () => {
  const list = html.match(/var DK_LIST=\[[\s\S]*?\n  \];/);
  assert.ok(list, "không trích được DK_LIST từ index.html");
  for (const key of ["noma911", "noma680", "noma350", "noma230"]) {
    assert.match(list[0], new RegExp(`key:'${key}'`), `thiếu ${key} trong bảng gộp`);
  }
  for (const slug of ["nm911d", "911tpn", "nm680d", "nm680tpn", "nm350d", "nm350tpn", "nm230d", "nm230tpn"]) {
    assert.match(list[0], new RegExp(slug), `thiếu landing ${slug}`);
  }
});

// Trích thẳng hai hàm tính từ index.html để đổi công thức là test đỏ ngay.
const tongFn = html.match(/function dkTong\(\)\{[\s\S]*?\n  \}/);
const comboFn = html.match(/function dkLaCombo\(c\)\{[^\n]*\}/);
assert.ok(tongFn && comboFn, "không trích được dkTong / dkLaCombo từ index.html");

const dung = new Function(`
  var DK_LIST = arguments[0], DK_DATA = arguments[1];
  ${comboFn[0]}
  ${tongFn[0]}
  return dkTong();
`);

const LIST = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];
const sp = (orders, khach, dt, giao, combos) => ({
  summary: { orders, unique_customers: khach, revenue: dt },
  actual: { orders_delivered: giao },
  by_combo: combos,
});

test("cộng tổng đủ bốn sản phẩm", () => {
  const t = dung(LIST, {
    a: sp(10, 9, 1000, 4, [{ combo: "le-911", orders: 6 }, { combo: "combo-2x911", orders: 4 }]),
    b: sp(5, 5, 500, 1, [{ combo: "combo-2x680", orders: 5 }]),
    c: sp(2, 2, 200, 0, [{ combo: "le-350", orders: 2 }]),
    d: sp(3, 3, 300, 2, [{ combo: "combo-230-680", orders: 3 }]),
  });
  assert.equal(t.don, 20);
  assert.equal(t.khach, 19);
  assert.equal(t.dt, 2000);
  assert.equal(t.giao, 7);
  assert.equal(t.comboDon, 12, "combo = mọi phương án trừ mã 'le-…'");
  assert.equal(t.ok, 4);
  assert.equal(t.loi, 0);
});

test("endpoint lỗi KHÔNG bị tính thành 0 đơn — chỉ đếm vào loi", () => {
  const t = dung(LIST, {
    a: sp(10, 9, 1000, 4, [{ combo: "le-911", orders: 10 }]),
    b: { __failed: true },
    c: { __loading: true },
    d: sp(3, 3, 300, 1, [{ combo: "combo-230-680", orders: 3 }]),
  });
  assert.equal(t.don, 13, "chỉ cộng sản phẩm đọc được");
  assert.equal(t.ok, 2);
  assert.equal(t.loi, 1, "sản phẩm lỗi phải được đếm riêng để bảng cảnh báo thiếu số");
  assert.equal(t.dangTai, 1);
});
