import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QUYẾT 2026-07-31 (chủ dự án): BẢNG LỢI NHUẬN THEO THÁNG phải là lợi nhuận SAU HOÀN.
// Trước đó bảng dùng revenue.products (gộp mọi trạng thái) nên lãi bị thổi lên — tháng 7/2026
// chênh 84,2tr (247,3tr gộp so với 163,1tr sau hoàn).
// Test này canh: bảng KHÔNG được quay lại dùng revenue.products, và phải loại đúng
// returning + returned khỏi CẢ doanh thu lẫn giá vốn.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const profitFn = html.match(/function renderProfit\(\)\{[\s\S]*?\n  \}/);
assert.ok(profitFn, "không trích được renderProfit từ index.html");
const src = profitFn[0];

test("renderProfit đi qua products_by_status, KHÔNG dùng revenue.products gộp", () => {
  assert.match(src, /products_by_status/, "phải đọc products_by_status để tách được trạng thái");
  assert.doesNotMatch(
    src,
    /\(D\.revenue\|\|\{\}\)\.products\b(?!_by_status)/,
    "dùng lại revenue.products là quay về lãi gộp — sai quyết định 31/07"
  );
});

test("loại đơn hoàn khỏi CẢ doanh thu lẫn giá vốn", () => {
  assert.match(src, /isRet\s*=\s*!!EXCL_RET\[st\]/, "phải nhận diện trạng thái hoàn qua EXCL_RET");
  assert.match(src, /if\(!isRet\)\s*mrev\[m\]/, "doanh thu phải bỏ đơn hoàn");
  assert.match(src, /if\(!isRet\)\s*mcogs\[m2\]/, "giá vốn phải bỏ hàng hoàn (hàng về lại kho)");
});

test("công thức LN trừ đủ 4 khoản", () => {
  assert.match(src, /pf=r-vat-ad-fee-cogs/, "LN = DT sau hoàn − VAT − chi phí QC − phụ phí agency − giá vốn");
});

// QUYẾT 2026-07-31: hai bảng CỐ Ý dùng hai mức lợi nhuận khác nhau.
// Bảng nhân sự = lãi gộp (không VAT, không phụ phí) để so hiệu quả nhân sự.
// Bảng lợi nhuận tháng = lãi cuối (trừ đủ). Ai đó "đồng bộ" hai bên là phá quyết định này.
test("bảng nhân sự giữ công thức đơn thuần DT − CP − GV", () => {
  const staff = html.match(/var ln=([^;]+);/);
  assert.ok(staff, "không trích được công thức LN của bảng nhân sự");
  assert.equal(staff[1].trim(), "rv-sp-cg, lnN=rvN-sp-cgN", "bảng nhân sự KHÔNG được trừ VAT/phụ phí");
  assert.doesNotMatch(staff[1], /vat|fee|agencyFee/i, "lọt VAT hoặc phụ phí vào bảng nhân sự là sai quyết định");
});

test("có ghi chú cảnh báo hai bảng lệch nhau là bình thường", () => {
  assert.match(html, /CHƯA trừ VAT 10% và phụ phí agency/, "thiếu ghi chú dưới bảng nhân sự");
  assert.match(html, /KHÔNG phải lãi cuối/, "phải nói rõ đây không phải lãi cuối");
});

test("vẫn giữ bản gộp để đối chiếu Pancake, nhưng KHÔNG đưa vào công thức", () => {
  assert.match(src, /mrevG/, "phải cộng song song doanh thu gộp cho tooltip");
  assert.match(src, /Doanh thu gộp \(khớp Pancake\)/, "thiếu tooltip đối chiếu");
  // biến gộp không được lọt vào phép tính lợi nhuận
  assert.doesNotMatch(src, /pf=[^;]*mrevG/, "mrevG không được tham gia tính LN");
  assert.doesNotMatch(src, /pf=[^;]*mcogsG/, "mcogsG không được tham gia tính LN");
});

test("lấy danh sách tháng từ bản gộp — tháng chỉ có đơn hoàn vẫn phải hiện", () => {
  assert.match(src, /var months=Object\.keys\(mrevG\)\.sort\(\)/, "lấy từ mrev sẽ làm mất tháng");
});

test("tiêu đề cột và ghi chú nói rõ là sau hoàn", () => {
  assert.match(html, /<th class="num col-net"[^>]*>Doanh thu sau hoàn<\/th>/);
  assert.match(html, /Giá vốn sau hoàn<\/th>/);
  assert.match(html, /Lợi nhuận sau hoàn<\/th>/);
  assert.match(html, /Bảng này là lợi nhuận SAU HOÀN/);
});

test("mô phỏng: đơn hoàn bị loại khỏi cả DT và giá vốn", () => {
  // 2 đơn giao (200) + 1 đơn hoàn (100); giá nhập 30/cái
  const pbs = {
    delivered: { X: { by_date: { "2026-07-05": 200 }, units_by_date: { "2026-07-05": 2 } } },
    returned: { X: { by_date: { "2026-07-06": 100 }, units_by_date: { "2026-07-06": 1 } } },
  };
  const EXCL_RET = { returning: 1, returned: 1 };
  const pc = { X: { gia_nhap_vnd: 30 } };
  let rev = 0, cogs = 0, revG = 0, cogsG = 0;
  for (const st in pbs) {
    const isRet = !!EXCL_RET[st];
    for (const p in pbs[st]) {
      const o = pbs[st][p], cost = pc[p].gia_nhap_vnd;
      for (const d in o.by_date) { revG += o.by_date[d]; if (!isRet) rev += o.by_date[d]; }
      for (const d in o.units_by_date) { const c = o.units_by_date[d] * cost; cogsG += c; if (!isRet) cogs += c; }
    }
  }
  assert.equal(revG, 300, "gộp = 200 + 100");
  assert.equal(rev, 200, "sau hoàn chỉ còn đơn đã giao");
  assert.equal(cogsG, 90, "gộp = 3 cái × 30");
  assert.equal(cogs, 60, "sau hoàn = 2 cái × 30, hàng hoàn về kho không tính");
  const ad = 50, fee = ad * 0.15;
  assert.equal(rev - rev * 0.1 - ad - fee - cogs, 200 - 20 - 50 - 7.5 - 60);
});
