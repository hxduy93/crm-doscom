// KIỂM TRA CẤU TRÚC BÀI ADS — chạy trên MỌI bài, bất kể model nào viết.
//
// Vì sao có file này (24/09/2026): viết content giờ có chuỗi dự phòng Claude →
// Gemini → OpenAI → Workers AI. Model dự phòng yếu hơn, hay lệch khuôn. Chủ dự án
// yêu cầu "content phải đúng cấu trúc như đã duyệt" — nên cấu trúc được kiểm bằng
// CODE chứ không tin vào lời hứa của model. Bài không qua thì model được sửa 1 lần,
// vẫn không qua thì chuyển model khác; không model nào qua thì báo lỗi, KHÔNG trả bài sai.
//
// Ngưỡng hiệu chỉnh trên 22 bài chủ dự án chấm Đạt (ad-approved-examples.js):
// cả 22 bài phải qua — test bắt buộc điều đó, siết luật mà làm rớt bài đã duyệt là sai.

import { CONG_THUC_SAN_PHAM } from "./ad-formula.js";

// Thân bài 22 bài đạt dài 756-964 ký tự; nới 2 đầu để không đánh rớt bài tốt.
export const THAN_BAI_MIN = 550;
export const THAN_BAI_MAX = 1150;

// Cụm cấm áp cho mọi SP (đều từng xuất hiện trong bài AI viết và bị chê).
const CUM_CAM = [
  { re: /Đó là lý do|được thiết kế để|Tình huống quen thuộc|Bạn có bao giờ|Hãy tưởng tượng/i, msg: "câu chuyển mùi AI" },
  { re: /\bDIY\b|detailing|video call|non-chlorinated/i, msg: "trộn tiếng Anh" },
  { re: /\d{1,3}\.\d{3}(\.\d{3})? (người|chủ xe|khách|doanh nhân)|hàng triệu (người|chủ xe)/i, msg: "số người mua tự bịa" },
  { re: /xước xoáy|mạng nhện/i, msg: "thuật ngữ tự đặt" },
];
const CUM_CAM_NOMA = [
  { re: /(^|[^\p{L}])rẻ(?![\p{L}])/iu, msg: "từ cấm NOMA “rẻ”" },
  { re: /tin dùng/i, msg: "“tin dùng” chưa có bằng chứng" },
];

/** Tên ngắn nhận diện SP trong bài: "Noma 911" → "911", "DA8.1" → "DA8.1". */
function tenNgan(productKey) {
  return String(productKey).split(/\s+/).pop();
}

/** Cắt footer (từ dòng "━" đầu tiên) — footer do server gắn, không để model tự chép. */
export function tachThanBai(text) {
  const s = String(text || "");
  const i = s.indexOf("━");
  return (i >= 0 ? s.slice(0, i) : s).trim();
}

/** Ghép thân bài + footer đúng thương hiệu. Dùng thay cho footer model tự viết. */
export function ganFooter(text, footer) {
  return `${tachThanBai(text)}\n\n${footer}`;
}

/**
 * Kiểm 1 bài. Trả về danh sách lỗi (rỗng = đạt).
 * @param {object} v        { headline, primary_text, description }
 * @param {object} o
 * @param {string} o.productKey  mã SP trong catalog ("Noma 911")
 * @param {object} o.product     entry catalog (để biết SP có bảo hành không)
 */
export function kiemTraBai(v, { productKey, product }) {
  const loi = [];
  const headline = String(v.headline || "").trim();
  const desc = String(v.description || "").trim();
  const body = tachThanBai(v.primary_text);
  const lines = body.split("\n").map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);

  if (!headline) loi.push("thiếu headline");
  if (!desc) loi.push("thiếu description");
  if (body.length < THAN_BAI_MIN) loi.push(`thân bài quá ngắn (${body.length} ký tự, cần ≥ ${THAN_BAI_MIN})`);
  if (body.length > THAN_BAI_MAX) loi.push(`thân bài quá dài (${body.length} ký tự, cần ≤ ${THAN_BAI_MAX})`);

  // Bước 1-3: mở bài 1 dòng; tên SP phải xuất hiện trong 3 đoạn đầu (dòng mở bài →
  // vấn đề → giải pháp). Khuôn A nêu ngay dòng đầu; khuôn B có bài đạt nêu ở đoạn 3.
  if (nonEmpty[0] && Array.from(nonEmpty[0]).length > 160) loi.push("dòng mở bài dài quá (1 dòng, ~100 ký tự)");
  const doanDau = body.split(/\n\s*\n/).slice(0, 3).join("\n");
  const ten = tenNgan(productKey);
  if (ten && !doanDau.toLowerCase().includes(ten.toLowerCase())) {
    loi.push(`tên sản phẩm (${ten}) chưa xuất hiện trong 3 đoạn đầu — nêu vấn đề xong phải giới thiệu SP ngay`);
  }

  // Bước 4: 3-6 bullet ✅ (22 bài đạt có 4-5).
  const bullets = nonEmpty.filter((l) => l.startsWith("✅")).length;
  if (bullets < 3 || bullets > 6) loi.push(`cần 3-5 dòng ✅ tính năng (đang có ${bullets})`);

  // Bước 5: phù hợp cho + CTA có link.
  if (!/💼\s*Phù hợp cho/i.test(body)) loi.push("thiếu dòng “💼 Phù hợp cho: …”");
  if (!/(👉|➡)[^\n]*(\{\{\s*URL\s*\}\}|https?:\/\/)/i.test(body)) loi.push("thiếu dòng CTA 👉 kèm link/{{URL}}");

  // Bảo hành: SP có chính sách thì phải có, hàng tiêu dùng (guarantee: null) thì cấm bịa.
  if (product && product.guarantee === null && /bảo hành|1 đổi 1|hoàn tiền/i.test(body)) {
    loi.push("hàng tiêu dùng không có bảo hành — không được tự thêm dòng bảo hành/đổi trả");
  }
  if (product && product.guarantee !== null && !/bảo hành/i.test(body)) loi.push("thiếu dòng bảo hành");

  // Cụm cấm.
  const text = `${headline}\n${body}\n${desc}`;
  const cam = [...CUM_CAM, ...(product && product.brand === "NOMA" ? CUM_CAM_NOMA : [])];
  for (const c of cam) if (c.re.test(text)) loi.push(`dính ${c.msg}`);

  // Câu bắt buộc riêng của SP (an toàn / giới hạn).
  for (const b of (CONG_THUC_SAN_PHAM[productKey]?.batBuoc || [])) {
    if (!new RegExp(b.re, "iu").test(body)) loi.push(`thiếu câu bắt buộc: ${b.msg}`);
  }
  return loi;
}
