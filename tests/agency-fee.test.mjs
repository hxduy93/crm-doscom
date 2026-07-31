import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// PHỤ PHÍ AGENCY (thêm 2026-07-31): agency nạp tiền QC hộ, thu VAT 8% + phí dịch vụ 7%.
// LUẬT: hai phí CỘNG THẲNG trên chi phí gốc, KHÔNG lũy kế.
// Các số dưới đây là MỐC THAM CHIẾU CÔNG THỨC lấy từ file đối soát của agency — chúng KHÔNG
// phải dữ liệu sản xuất và không cần khớp tài khoản FB nào; giữ lại vì đây là bằng chứng
// duy nhất phân biệt được cộng thẳng (đúng) với lũy kế (sai), lệch nhau 51.646đ:
//   chi phí gốc 9.222.521 → đã gồm phí 10.605.899
//   khách chuyển 30.000.000 → ngân sách QC dùng được 26.086.957
// Phạm vi áp phí: TOÀN BỘ 6 tài khoản FB trong CRM (chủ dự án chốt 2026-07-31).
// Google Ads chi trực tiếp nên rate = 0.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function grabLine(re, name) {
  const m = html.match(re);
  if (!m) throw new Error("Không trích được " + name + " từ index.html (cấu trúc đổi?)");
  return m[0].trim();
}

const src = [
  grabLine(/^[ \t]*var AGENCY_FEE=\{[^}]*\};/m, "AGENCY_FEE"),
  grabLine(/^[ \t]*function agencyFee\(fbSpend,ggSpend\)\{.*\}$/m, "agencyFee"),
].join("\n");
const { AGENCY_FEE, agencyFee } = new Function(`${src}\nreturn { AGENCY_FEE, agencyFee };`)();

// Mốc chuẩn lấy thẳng từ file top-up của agency.
const SHEET_SPEND = 9222521;
const SHEET_WITH_FEE = 10605899;
const SHEET_TRANSFER = 30000000;
const SHEET_TOPUP = 26086957;

test("tỉ lệ đúng hợp đồng: VAT 8% + dịch vụ 7% = 15% cho FB, Google 0%", () => {
  assert.equal(AGENCY_FEE.vat, 0.08);
  assert.equal(AGENCY_FEE.service, 0.07);
  assert.equal(AGENCY_FEE.fb, 0.15, "FB = 8% + 7%, cộng thẳng chứ không lũy kế");
  // CHỐT 2026-07-31 bởi chủ dự án: Google Ads KHÔNG tính phí agency. Ai đổi số này là đổi
  // một quyết định kinh doanh, phải hỏi lại — không phải chỉnh tham số cho tiện.
  assert.equal(AGENCY_FEE.google, 0, "Google Ads chi trực tiếp, KHÔNG chịu phí agency");
  // 0.08+0.07 = 0.15000000000000002 trong JS nên so sánh có dung sai, không so bằng tuyệt đối.
  assert.ok(
    Math.abs(AGENCY_FEE.fb - (AGENCY_FEE.vat + AGENCY_FEE.service)) < 1e-9,
    "fb phải luôn = vat + service; đổi 1 số mà quên số kia là sai"
  );
});

test("khớp ĐÚNG file top-up của agency, không sai 1 đồng", () => {
  const fee = agencyFee(SHEET_SPEND, 0);
  assert.equal(Math.round(SHEET_SPEND + fee), SHEET_WITH_FEE);
});

test("KHÔNG được tính lũy kế (×1,08×1,07)", () => {
  const luyKe = Math.round(SHEET_SPEND * 1.08 * 1.07); // = 10.657.545
  assert.notEqual(Math.round(SHEET_SPEND + agencyFee(SHEET_SPEND, 0)), luyKe);
  assert.equal(luyKe - SHEET_WITH_FEE, 51646, "chênh 51.646đ — bằng chứng công thức lũy kế sai");
});

test("tách được VAT và phí dịch vụ để hiện tooltip", () => {
  assert.equal(Math.round(SHEET_SPEND * AGENCY_FEE.vat), 737802);
  assert.equal(Math.round(SHEET_SPEND * AGENCY_FEE.service), 645576);
  assert.equal(
    Math.round(SHEET_SPEND * AGENCY_FEE.vat) + Math.round(SHEET_SPEND * AGENCY_FEE.service),
    Math.round(agencyFee(SHEET_SPEND, 0))
  );
});

test("truy ngược: tiền khách chuyển ÷ 1,15 = ngân sách QC dùng được", () => {
  assert.equal(Math.round(SHEET_TRANSFER / (1 + AGENCY_FEE.fb)), SHEET_TOPUP);
  // Và ngược lại: topup + phí của nó = số tiền đã chuyển. Sai 1đ là do bản thân 26.086.957
  // đã được làm tròn từ 26.086.956,52 (sheet cũng ghi số tròn này), không phải lỗi công thức.
  assert.ok(
    Math.abs(SHEET_TOPUP + agencyFee(SHEET_TOPUP, 0) - SHEET_TRANSFER) <= 1,
    "quay ngược lại phải ra đúng tiền đã chuyển (cho phép lệch 1đ do làm tròn)"
  );
});

test("chi tiêu Google KHÔNG bị cộng phí", () => {
  assert.equal(agencyFee(0, 157175000), 0);
  assert.equal(agencyFee(1000000, 999999999), 150000, "chỉ phần FB mới sinh phí");
});

test("đầu vào rỗng/hỏng → 0, không ra NaN", () => {
  assert.equal(agencyFee(0, 0), 0);
  assert.equal(agencyFee(undefined, null), 0);
  assert.equal(agencyFee("", "abc"), 0);
});

test("bảng lợi nhuận đã trừ phụ phí agency vào công thức LN", () => {
  assert.match(html, /pf=r-vat-ad-fee-cogs/, "công thức LN phải trừ fee");
  assert.match(html, /<th class="num" title="[^"]*"[^>]*>Phụ phí agency<\/th>/, "thiếu cột Phụ phí agency");
  // Hàng "không có dữ liệu" của riêng bảng lợi nhuận (bám getElementById để không bắt nhầm bảng khác)
  const colspan = html.match(/getElementById\('profit-rows'\)\.innerHTML=rows\|\|'<tr><td colspan="(\d+)"/);
  assert.ok(colspan, "không tìm thấy hàng rỗng của profit-rows");
  assert.equal(colspan[1], "8", "thêm 1 cột thì colspan hàng rỗng phải là 8");
  // Số <th> của thead bảng lợi nhuận phải bằng số <td> mỗi hàng (8 cột)
  const thead = html.match(/<thead><tr><th>Tháng<\/th>[\s\S]*?<\/tr><\/thead>/)[0];
  assert.equal([...thead.matchAll(/<th[ >]/g)].length, 8, "thead bảng lợi nhuận phải có đúng 8 cột");
});
