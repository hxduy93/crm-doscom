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

// QUYẾT 2026-07-31: doanh thu = GIÁ TRỊ ĐƠN THẬT, không cộng từng dòng sản phẩm.
// Cộng theo dòng lấy giá niêm yết nên cao hơn số khách thật trả (tháng 7 lệch 41,3tr ≈ 3,6%).
test("doanh thu lấy từ order_revenue_by_status_by_date, KHÔNG cộng dòng sản phẩm", () => {
  assert.match(src, /order_revenue_by_status_by_date/, "doanh thu phải là giá trị đơn thật");
  assert.doesNotMatch(
    src,
    /\(D\.revenue\|\|\{\}\)\.products\b(?!_by_status)/,
    "dùng lại revenue.products là quay về lãi gộp — sai quyết định 31/07"
  );
  assert.doesNotMatch(src, /mrev\[m\]=\(mrev\[m\]\|\|0\)\+[^;]*by_date\[d\]\)\|\|0\);\s*\}\s*\}\s*var ud/,
    "không được cộng doanh thu từ dòng sản phẩm nữa");
});

test("loại đơn hoàn khỏi CẢ doanh thu lẫn giá vốn", () => {
  assert.match(src, /isRet\s*=\s*!!EXCL_RET\[st\]/, "doanh thu: nhận diện trạng thái hoàn qua EXCL_RET");
  assert.match(src, /if\(!isRet\)\s*mrev\[m\]/, "doanh thu phải bỏ đơn hoàn");
  assert.match(src, /if\(EXCL_RET\[st2\]\)\s*continue;/, "giá vốn phải bỏ hàng hoàn (hàng về lại kho)");
});

test("giá vốn vẫn đi per-SP vì giá nhập gắn theo từng sản phẩm", () => {
  assert.match(src, /products_by_status/, "giá vốn cần products_by_status");
  assert.match(src, /gia_nhap_vnd/, "giá vốn = số lượng × giá nhập kho");
});

// QUYẾT 2026-07-31: bảng này là LỢI NHUẬN TRƯỚC VAT.
// Chủ dự án không xác định được VAT thực phải nộp (đầu ra trừ đầu vào tuỳ hoá đơn), nên KHÔNG
// trừ VAT ước lượng 10% — trừ một con số bịa sẽ tạo cảm giác chính xác giả.
test("LN trước VAT = DT sau hoàn − chi phí QC − phụ phí agency − giá vốn, KHÔNG trừ VAT", () => {
  assert.match(src, /pf=r-ad-fee-cogs/, "công thức phải là r-ad-fee-cogs");
  assert.doesNotMatch(src, /vat=r\*0\.10/, "không được tính lại VAT 10% trên doanh thu");
  assert.doesNotMatch(src, /pf=[^;]*-vat/, "không được trừ VAT vào lợi nhuận");
  // Lưu ý: chuỗi "VAT 8%" vẫn còn hợp lệ — đó là VAT trong PHỤ PHÍ AGENCY ở tooltip,
  // khác hoàn toàn với VAT đầu ra 10% mà quyết định này loại bỏ.
  assert.match(src, /AGENCY_FEE\.vat/, "tooltip phụ phí agency vẫn phải tách được VAT 8%");
});

test("bảng không còn cột VAT (7 cột)", () => {
  const head = html.match(/<thead><tr><th>Tháng<\/th>[\s\S]*?<\/tr><\/thead>/)[0];
  assert.doesNotMatch(head, /VAT 10%/, "cột VAT 10% phải bị bỏ");
  assert.equal([...head.matchAll(/<th[ >]/g)].length, 7);
  const cs = html.match(/getElementById\('profit-rows'\)\.innerHTML=rows\|\|'<tr><td colspan="(\d+)"/);
  assert.equal(cs[1], "7", "colspan hàng rỗng phải khớp số cột");
});

test("tiêu đề nói rõ là chưa VAT", () => {
  assert.match(html, /Bảng lợi nhuận theo tháng \(chưa VAT\)/);
  assert.match(html, /Lợi nhuận trước VAT<\/th>/);
  assert.match(html, /Chưa trừ VAT phải nộp và thuế TNDN/);
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
  assert.match(html, /Bảng này là lợi nhuận SAU HOÀN/);
});

test("mô phỏng: doanh thu theo đơn thật, giá vốn theo SP, cả hai bỏ đơn hoàn", () => {
  const EXCL_RET = { returning: 1, returned: 1 };
  // Giá trị ĐƠN thật: đã giao 190 (chiết khấu 10 so với giá niêm yết 200), hoàn 100
  const ordRev = { delivered: { "2026-07-05": 190 }, returned: { "2026-07-06": 100 } };
  // Dòng SP: 2 cái đã giao, 1 cái hoàn — giá niêm yết 100/cái, giá nhập 30/cái
  const pbs = {
    delivered: { X: { by_date: { "2026-07-05": 200 }, units_by_date: { "2026-07-05": 2 } } },
    returned: { X: { by_date: { "2026-07-06": 100 }, units_by_date: { "2026-07-06": 1 } } },
  };
  const pc = { X: { gia_nhap_vnd: 30 } };

  let rev = 0, revG = 0;
  for (const st in ordRev) { const isRet = !!EXCL_RET[st];
    for (const d in ordRev[st]) { revG += ordRev[st][d]; if (!isRet) rev += ordRev[st][d]; } }
  let cogs = 0;
  for (const st in pbs) { if (EXCL_RET[st]) continue;
    for (const p in pbs[st]) for (const d in pbs[st][p].units_by_date) cogs += pbs[st][p].units_by_date[d] * pc[p].gia_nhap_vnd; }

  assert.equal(revG, 290, "gộp theo đơn thật = 190 + 100");
  assert.equal(rev, 190, "sau hoàn = 190, KHÔNG phải 200 của dòng SP — chiết khấu 10 đã phản ánh");
  assert.equal(cogs, 60, "2 cái × 30; hàng hoàn về kho không tính giá vốn");
  const ad = 50, fee = ad * 0.15;
  assert.equal(rev - ad - fee - cogs, 190 - 50 - 7.5 - 60, "LN trước VAT không trừ VAT");
});
