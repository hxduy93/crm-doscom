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

test("số cột thead khớp số ô mỗi hàng (10 cột)", () => {
  const head = html.match(/<thead><tr><th>Nhân sự \/ Nguồn<\/th>[\s\S]*?<\/tr><\/thead>/)[0];
  const cols = [...head.matchAll(/<th[ >]/g)].length;
  assert.equal(cols, 10, "Nhân sự, Chi phí, DT, DT sau hoàn, Giá vốn, CIR, Lead, Đơn, LN, LN sau hoàn");
});

test("thứ tự cột đúng yêu cầu", () => {
  const head = html.match(/<thead><tr><th>Nhân sự \/ Nguồn<\/th>[\s\S]*?<\/tr><\/thead>/)[0];
  const labels = [...head.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  assert.deepEqual(labels.slice(1), [
    "Chi phí QC", "Doanh thu", "DT sau hoàn", "Giá vốn", "CIR", "Lead", "Đơn",
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
