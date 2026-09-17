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

// 2026-08-14: thêm NOMA 120 thành landing thứ NĂM. Test này canh việc đăng ký — quên
// thêm dòng vào DK_LIST là đơn 120 chảy về D1 mà dashboard không hiện, im lặng không báo.
test("bảng gộp đủ năm landing, mỗi landing hai nguồn", () => {
  const list = html.match(/var DK_LIST=\[[\s\S]*?\n  \];/);
  assert.ok(list, "không trích được DK_LIST từ index.html");
  for (const key of ["noma911", "noma680", "noma350", "noma230", "noma120"]) {
    assert.match(list[0], new RegExp(`key:'${key}'`), `thiếu ${key} trong bảng gộp`);
  }
  // Canh ĐẦY ĐỦ đường dẫn chứ không chỉ phần đuôi. 2026-08-14: landing 120 gắn tên miền
  // riêng và đổi sang đường rút gọn /d + /tpn — nếu chỉ canh đuôi thì "d" và "tpn" khớp
  // với gần như mọi chuỗi, test xanh cả khi link sai hoàn toàn.
  for (const link of [
    "noma.io.vn/nm911d", "noma.io.vn/911tpn",
    "nomaautocares.cloud/nm680d", "nomaautocares.cloud/nm680tpn",
    "noma890.click/nm350d", "noma890.click/nm350tpn",
    "noma620.click/nm230d", "noma620.click/nm230tpn",
    "noma120.asia/d", "noma120.asia/tpn",
  ]) {
    assert.ok(list[0].includes(link), `thiếu hoặc sai link landing: ${link}`);
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

// 17/09/2026 (chủ dự án): bỏ thẻ KPI "Tỉ lệ đơn combo" gộp cả 5 sản phẩm, thay bằng cột
// "% đơn SP" trong khối chi tiết — tỉ trọng của TỪNG phương án trên tổng đơn của CHÍNH
// sản phẩm đó. Hai test dưới canh đúng chỗ dễ sai lại: phân loại combo/lẻ và MẪU SỐ.
test("dkLaCombo: chỉ mã 'le-…' là mua lẻ", () => {
  const laCombo = new Function(`${comboFn[0]}
    return dkLaCombo;`)();
  for (const ma of ["le-911", "le-680", "le-350", "le-230", "le-120"]) {
    assert.equal(laCombo(ma), false, `${ma} phải là mua lẻ`);
  }
  for (const ma of ["combo-2x911", "combo-911-922", "combo-230-680", "combo-120-130"]) {
    assert.equal(laCombo(ma), true, `${ma} phải là combo`);
  }
});

test("% đơn SP lấy mẫu số là tổng đơn CỦA SẢN PHẨM, mỗi khối cộng lại 100%", () => {
  const fn = html.match(/function dkChiTietCombo\(\)\{[\s\S]*?\n  \}/);
  assert.ok(fn, "không trích được dkChiTietCombo từ index.html");
  assert.match(fn[0], /var tongSP=N\.summary\.orders\|\|0;/,
    "mẫu số phải là tổng đơn của chính sản phẩm, KHÔNG phải tổng đơn cả bảng");
  assert.match(fn[0], /c\.orders\/tongSP\*100/, "công thức % đơn SP sai mẫu số");
  // Chỉ canh THẺ KPI của bảng đơn đăng ký (noKpi). Báo cáo tuần ở mục "3. Noma911 —
  // Tỉ lệ combo" vẫn có chữ này một cách hợp lệ, không được bắt nhầm.
  assert.doesNotMatch(html, /noKpi\('Tỉ lệ đơn combo'/, "thẻ KPI gộp 5 sản phẩm đã bỏ, không được dựng lại");

  // Cộng tay theo đúng công thức: 3 phương án của một sản phẩm 20 đơn phải ra 100%.
  const combos = [{ orders: 10 }, { orders: 6 }, { orders: 4 }];
  const tongSP = 20;
  const tong = combos.reduce((t, c) => t + Math.round(c.orders / tongSP * 1000) / 10, 0);
  assert.equal(tong, 100);
});
