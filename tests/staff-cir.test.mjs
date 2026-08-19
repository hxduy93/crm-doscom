import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QUYẾT 2026-07-31 (chủ dự án): bảng "Chi phí & doanh thu theo nhân sự" bỏ ROAS, thay bằng CIR.
// CIR = Chi phí QC ÷ Doanh thu (thấp = tốt) — CÙNG định nghĩa với bảng brand × nhân sự,
// tính trên doanh thu GỘP để hai bảng so được với nhau; CIR sau hoàn để ở tooltip.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("đã bỏ hẳn ROAS khỏi bảng nhân sự", () => {
  const head = html.match(/<thead><tr><th>Nhân sự \/ Nguồn<\/th>[\s\S]*?<\/tr><\/thead>/)[0];
  assert.doesNotMatch(head, />ROAS</, "tiêu đề cột vẫn còn ROAS");
  assert.match(head, />CIR</, "thiếu cột CIR");
  assert.doesNotMatch(html, /\btRoas\b/, "còn sót biến tRoas");
});

test("số cột thead khớp số ô mỗi hàng (11 cột)", () => {
  const head = html.match(/<thead><tr><th>Nhân sự \/ Nguồn<\/th>[\s\S]*?<\/tr><\/thead>/)[0];
  const cols = [...head.matchAll(/<th[ >]/g)].length;
  assert.equal(cols, 11, "Nhân sự, Chi phí, DT, DT sau hoàn, Giá vốn, GV sau hoàn, CIR, Lead, Đơn, LN, LN sau hoàn");
});

test("thứ tự cột đúng yêu cầu", () => {
  const head = html.match(/<thead><tr><th>Nhân sự \/ Nguồn<\/th>[\s\S]*?<\/tr><\/thead>/)[0];
  const labels = [...head.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  assert.deepEqual(labels.slice(1), [
    // "GV sau hoàn" thêm 19/08/2026: cột LN sau hoàn trừ giá vốn SAU HOÀN, không phải
    // cột "Giá vốn" (gộp) bên trái — thiếu cột này thì nhìn hàng không cộng ra được số.
    "Chi phí QC", "Doanh thu", "DT sau hoàn", "Giá vốn", "GV sau hoàn", "CIR", "Lead", "Đơn",
    "Lợi nhuận tạm tính (DT−CP−GV)", "LN sau hoàn",
  ]);
});

test("công thức lợi nhuận vẫn là DT − CP − GV, cả trước và sau hoàn", () => {
  const m = html.match(/var ln=([^;]+);/);
  assert.ok(m, "không trích được công thức LN");
  assert.equal(m[1].trim(), "rv-sp-cg, lnN=rvN-sp-cgN");
});

// Trích hàm cirCell thật từ index.html rồi chạy để kiểm hành vi
const cirSrc = html.match(/^[ \t]*var cirCell=function\(cost,rev,revNet\)\{[\s\S]*?\n[ \t]*\};/m);
assert.ok(cirSrc, "không trích được cirCell của bảng nhân sự");
const cirCell = new Function("vnd", `${cirSrc[0]}\nreturn cirCell;`)(
  (n) => (Math.round(n / 1000) * 1000).toLocaleString("vi-VN") + "đ"
);

test("CIR = chi phí ÷ doanh thu gộp, làm tròn phần trăm", () => {
  assert.match(cirCell(50, 100, 90), />50%</);
  assert.match(cirCell(0, 100, 90), />0%</, "không chi đồng nào → 0%");
  assert.match(cirCell(120, 100, 90), />120%</, "chi nhiều hơn thu");
});

test("màu cảnh báo: >100% đỏ, ≤50% xanh, giữa cam", () => {
  assert.match(cirCell(120, 100, 90), /#E5484D/);
  assert.match(cirCell(40, 100, 90), /#16A34A/);
  assert.match(cirCell(70, 100, 90), /#E08600/);
});

test("không có doanh thu → hiện gạch ngang, không chia cho 0", () => {
  const out = cirCell(50, 0, 0);
  assert.match(out, />—</);
  assert.doesNotMatch(out, /NaN|Infinity/);
});

test("tooltip hiện CIR sau hoàn — luôn cao hơn CIR gộp", () => {
  const out = cirCell(50, 100, 80);
  assert.match(out, /CIR sau hoàn = 63%/, "50 ÷ 80 = 62,5% → làm tròn 63%");
  assert.match(out, />50%</, "ô vẫn hiện CIR gộp");
});

// Thêm 19/08/2026 — chủ dự án hỏi "cột LN sau hoàn dùng đúng công thức chưa".
// Công thức vẫn đúng (DT sau hoàn − CP QC − GV sau hoàn), nhưng bảng chỉ hiện giá vốn
// GỘP nên lấy 3 ô nhìn thấy trừ nhau ra số khác (tháng 7/2026 lệch 38tr). Bổ sung cột
// "GV sau hoàn" + tooltip ghi rõ phép trừ. Test này canh cả hai khỏi bị gỡ mất.
test("hàng nhân sự hiện giá vốn sau hoàn — đúng số dùng trong LN sau hoàn", () => {
  assert.match(html, /<td class="num tnum col-net">'\+\(cgN>0\?vnd\(cgN\):'—'\)/,
    "thiếu ô GV sau hoàn ở hàng nhân sự");
  assert.match(html, /<td class="num tnum col-net">'\+vnd\(tCogsN\)/,
    "thiếu ô GV sau hoàn ở hàng Tổng");
});

test("ô LN sau hoàn có tooltip ghi rõ phép trừ, dùng đúng 3 số hạng", () => {
  const tip = html.match(/^[ \t]*var lnNTip=function\(revNet,cost,cogsNet\)\{[\s\S]*?\n[ \t]*\};/m);
  assert.ok(tip, "không tìm thấy lnNTip");
  const fn = new Function("vnd", tip[0] + "\nreturn lnNTip;")((n) => String(n));
  assert.equal(fn(100, 30, 20), "DT sau hoàn 100 − CP quảng cáo 30 − GV sau hoàn 20 = 50");
  assert.match(html, /title="'\+lnNTip\(rvN,sp,cgN\)\+'"/, "hàng nhân sự chưa gắn tooltip");
  assert.match(html, /title="'\+lnNTip\(tRevN,tSp,tCogsN\)\+'"/, "hàng Tổng chưa gắn tooltip");
});

// Chênh lệch giữa cột "Chi phí QC" hàng Tổng và KPI đầu trang KHÔNG phải tiền thất lạc:
// đúng bằng phần chạy hộ team content đã cố ý loại (QUYẾT 31/07/2026). Tooltip phải nói ra
// điều đó, nếu không lần sau lại có người đi truy "thiếu mấy triệu".
test("tooltip chi phí hàng Tổng đối chiếu được với KPI đầu trang", () => {
  assert.match(html, /KPI Chi phí đầu trang \('\+vnd\(tSp\+tUnas\)\+'\)/,
    "tooltip Tổng chưa đối chiếu với KPI");
});
