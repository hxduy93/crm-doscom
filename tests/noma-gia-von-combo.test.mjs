import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 17/09/2026 (chủ dự án): cập nhật giá vốn đầy đủ + giá niêm yết cho 17 mã NOMA để tính
// lãi lỗ theo sản phẩm. Trước đó chỉ 4 mã (911/922/250/310) được gán doanh thu; 13 mã còn
// lại cùng mọi combo NOMA rơi vào data/pancake-unmapped.json (~500tr/90 ngày không thuộc SP nào).

const ext = JSON.parse(readFileSync(new URL("../data/cost-source/skus-extended.json", import.meta.url), "utf8"));
const py = readFileSync(new URL("../scripts/fetch_pancake_revenue.py", import.meta.url), "utf8");

const BANG_GIA = {
  "Noma 350": [21883, 119000], "Noma 998": [28565, 119000], "Noma 110": [23751, 169000],
  "Noma 230": [18751, 99000], "Noma 120": [20627, 149000], "Noma 680": [18751, 99000],
  "Noma 130": [21876, 179000], "Noma 880": [89040, 399000], "Noma 686": [67200, 390000],
  "Noma 911": [43129, 219000], "Noma 250": [23851, 99000], "Noma 310": [36197, 199000],
  "Noma 922": [38989, 219000], "Noma 620": [33989, 179000], "Noma 890": [42117, 249000],
  "Noma 955": [35096, 200000], "Noma 692": [29705, 209000],
};

test("đủ 17 mã NOMA với đúng giá vốn và giá niêm yết đã chốt", () => {
  for (const [sp, [von, niemYet]] of Object.entries(BANG_GIA)) {
    assert.equal(ext.price_overrides_vnd[sp], von, `giá vốn ${sp}`);
    assert.equal(ext.sale_price_overrides_vnd[sp], niemYet, `giá niêm yết ${sp}`);
  }
});

test("mỗi mã NOMA đều được gán doanh thu (base hoặc extended_skus)", () => {
  const base = ["Noma 911", "Noma 922", "Noma 250"];
  const ext13 = ext.extended_skus.map((s) => s.label);
  for (const sp of Object.keys(BANG_GIA)) {
    assert.ok(base.includes(sp) || ext13.includes(sp), `${sp} không có trong danh sách SP → doanh thu rơi vào unmapped`);
  }
  // NOMA 998 trên Pancake mang mã A001, NOMA 880 mang mã NOMA880 (không cách) — dễ quên.
  assert.equal(ext.extended_skus.find((s) => s.label === "Noma 998").cost_key, "a001");
  assert.ok(ext.combo_codes["noma880"], "thiếu map mã NOMA880 → Noma 880");
});

test("combo TẶNG: đúng MỘT món quà, là mã ghi sau chữ TẶNG", () => {
  const coQua = {
    "combo-178": "Noma 230", "combo-209": "Noma 680", "combo-182": "Noma 998",
    "combo-190": "Noma 120", "combo-202": "Noma 680", "copmbo-186": "Noma 230",
  };
  for (const [ma, qua] of Object.entries(coQua)) {
    const tp = ext.combo_codes[ma];
    assert.ok(tp, `thiếu ${ma}`);
    const gifts = tp.filter((x) => x[2]);
    assert.equal(gifts.length, 1, `${ma} phải có đúng 1 quà`);
    assert.equal(gifts[0][0], qua, `${ma}: quà sai`);
  }
  // 2 CHAI 230 TẶNG 680: 230 là hàng BÁN (2 chai), không được đánh dấu quà
  assert.deepEqual(ext.combo_codes["combo-209"].find((x) => x[0] === "Noma 230"), ["Noma 230", 2, false]);
  // combo không có chữ TẶNG thì không có quà
  for (const ma of ["combo-131", "combo-141", "combo-103", "combo-168"]) {
    assert.ok(ext.combo_codes[ma].every((x) => !x[2]), `${ma} không được có quà`);
  }
});

test("chia doanh thu combo: quà có trọng số 0 nhưng vẫn cộng số lượng", () => {
  assert.match(py, /0\.0 if is_gift else RETAIL_PRICES\.get\(product, 0\.0\) \* qty_per_unit/,
    "quà tặng phải có trọng số doanh thu = 0");
  assert.match(py, /if not is_gift:\s+# quà tặng không tính là 1 đơn/, "quà không được đếm thành đơn của SP");

  // Mô phỏng đúng công thức: COMBO (680+130) TẶNG 230 giá 278.000đ.
  const niemYet = ext.sale_price_overrides_vnd;
  const tp = ext.combo_codes["combo-179"];
  const w = tp.map(([sp, sl, qua]) => (qua ? 0 : niemYet[sp] * sl));
  const tong = w.reduce((a, b) => a + b, 0);
  const dt = Object.fromEntries(tp.map(([sp], i) => [sp, Math.round(278000 * w[i] / tong)]));
  assert.equal(dt["Noma 230"], 0, "chai 230 tặng không được ăn doanh thu");
  assert.equal(dt["Noma 680"] + dt["Noma 130"], 278000, "doanh thu combo phải chia hết cho hàng bán");
  assert.equal(dt["Noma 680"], Math.round(278000 * 99000 / (99000 + 179000)));
});
