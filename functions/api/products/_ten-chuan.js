/* Tên chuẩn của sản phẩm NOMA — NGUỒN DUY NHẤT cho cả tên trong danh mục bán hàng và
   tiêu đề bài hướng dẫn sử dụng, trên cả web tiếng Việt lẫn nomaauto.us.

   Tách riêng khỏi brandcore-scan.js vì cùng một luật đặt tên giờ có BA chỗ dùng (tên SP,
   tiêu đề bài, soát tiêu đề toàn site) × hai ngôn ngữ — để rải trong file quét là mỗi
   chỗ lệch một kiểu, đúng thứ bệnh mà phần này sinh ra để chữa.

   ── LUẬT VIẾT HOA (chốt 26/08/2026) ────────────────────────────────────────────
   Chủ dự án: "Tên chỉ viết hoa tên sản phẩm và đầu câu hoặc sau dấu -, chứ không viết
   hoa viết thường loạn cả lên."
   Chính HỒ SƠ cũng đang loạn: "NOMA 350 - Dung Dịch Vệ Sinh Đĩa Phanh" (hoa mọi chữ),
   "Noma 998 – Dung Dịch Vá & Bơm Lốp Khẩn Cấp" (hoa mọi chữ + gạch dài + "Noma"),
   "NOMA 230 - Chai xịt làm mới nội ngoại thất  &  Nhựa Nhám" (nửa nọ nửa kia + thừa dấu
   cách). Lấy nguyên văn hồ sơ làm tên chuẩn là bê nguyên đống lộn xộn đó lên web, nên
   tên chuẩn = tên hồ sơ ĐÃ CHUẨN HOÁ, không phải tên hồ sơ thô.

   Tiếng Anh KHÁC: nomaauto.us bán cho khách Mỹ, tên hàng ở Mỹ viết Title Case
   ("Nano Glass Coating"), viết kiểu câu tiếng Việt sang đó là trông như lỗi dịch máy.
   Nên `en: true` → Title Case (trừ mấy từ nối: of, for, and…), `en: false` → kiểu câu.
   ────────────────────────────────────────────────────────────────────────────── */

/* Viết hoa cả cụm dù nằm giữa câu: viết tắt và tên chất liệu. Danh sách CỐ Ý NGẮN —
   thêm bừa một từ tiếng Việt vào đây là nó bị hoa ở mọi tên, sai kiểu khó thấy. */
const GIU_HOA = new Set([
  "NOMA", "UV", "PU", "PVC", "PPF", "TPU", "LED", "DIY", "ABS", "SUV", "OEM", "PPE",
  "MSDS", "USA", "PH",
]);

/* Từ nối trong tiêu đề tiếng Anh — Title Case của Mỹ để thường khi nằm giữa cụm
   ("Lubricant for Car Windows and Rubber Seals"), vẫn hoa khi đứng đầu cụm. */
const TU_NOI_EN = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor", "of", "on",
  "or", "the", "to", "via", "vs", "with",
]);

// Dấu mở đầu một cụm mới: đầu câu và SAU DẤU GẠCH (chốt của chủ dự án) + dấu câu kết.
const MOC_CUM = /[-–—:;.!?]/;

const hoaDauTu = (s) => (s ? s[0].toLocaleUpperCase("vi") + s.slice(1) : s);

function bienDoiTu(tu, dauCum, titleCase) {
  // Có chữ số → mã/thông số ("5W", "3M", "SUV7"): giữ nguyên, đừng đụng vào.
  if (/\d/.test(tu)) return tu;
  const hoa = tu.toLocaleUpperCase("vi");
  if (GIU_HOA.has(hoa)) return hoa;
  const thuong = tu.toLocaleLowerCase("vi");
  if (dauCum) return hoaDauTu(thuong);
  if (titleCase) return TU_NOI_EN.has(thuong) ? thuong : hoaDauTu(thuong);
  return thuong;
}

/* Chuẩn hoá hoa/thường cho một đoạn chữ. Duyệt theo CỤM CHỮ chứ không theo "từ tách bởi
   dấu cách": "sơn xe-xoá xước" phải hoa chữ sau dấu gạch dù dính liền không có khoảng
   trắng. */
export function chuanHoaHoaThuong(raw, { titleCase = false } = {}) {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  let dauCum = true;
  let out = "";
  for (const m of s.matchAll(/([\p{L}\p{M}][\p{L}\p{M}\p{N}'’]*)|([^\p{L}\p{M}]+)/gu)) {
    if (m[1] !== undefined) {
      out += bienDoiTu(m[1], dauCum, titleCase);
      dauCum = false;
    } else {
      out += m[2];
      if (MOC_CUM.test(m[2])) dauCum = true;
    }
  }
  return out;
}

/* Tên chuẩn từ một tên thô bất kỳ (hồ sơ, hoặc tên đang có trên web).
   Khuôn: "NOMA <mã> - <mô tả>". Hồ sơ viết lẫn "Noma 620 -", "NOMA 998 –", "NOMA 130  -"
   nên phần đầu bị ép về một dạng trước, phần mô tả mới đem chuẩn hoá hoa/thường
   (ép cả phần đầu qua hàm kia thì "NOMA" thành "Noma"). */
export function chuanHoaTen(raw, { en = false } = {}) {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const m = s.match(/^noma\s*(\d{2,4})\s*[-–—:]*\s*/i);
  if (!m) return chuanHoaHoaThuong(s, { titleCase: en });
  const duoi = chuanHoaHoaThuong(s.slice(m[0].length), { titleCase: en });
  return duoi ? `NOMA ${m[1]} - ${duoi}` : `NOMA ${m[1]}`;
}

// Tên chuẩn TIẾNG VIỆT của một mã SKU — cột "Tên sản phẩm" của hồ sơ, đã chuẩn hoá.
export function tenChuanSku(code, specs) {
  const s = specs && specs[code];
  const raw = String((s && (s.ten || s.ma)) || "").trim();
  return raw ? chuanHoaTen(raw) : null;
}

/* Tên chuẩn TIẾNG ANH — lấy từ bảng tên EN (KV), KHÔNG dịch tại chỗ.
   Vì sao phải có bảng: dịch lại mỗi lần quét thì cùng một sản phẩm mỗi lần ra một tên
   khác, công cụ sẽ rủ đổi tên mãi không hết và tên trên web không bao giờ đứng yên. */
export function tenChuanSkuEN(code, namesEn) {
  const raw = String((namesEn && namesEn[code]) || "").trim();
  return raw ? chuanHoaTen(raw, { en: true }) : null;
}

export const TIEN_TO_HDSD = "Hướng dẫn sử dụng ";
/* "How to Use" chứ không phải "Usage Guide": đó là cách người Mỹ gõ vào Google, và
   14/18 bài hướng dẫn trên nomaauto.us đã mang khuôn này (26/08/2026) — chọn khuôn
   thiểu số là đi đổi tên 14 bài đang chạy để lấy 4. */
export const TIEN_TO_HDSD_EN = "How to Use ";

export function tieuDeChuanHdsd(code, { specs, namesEn, en = false }) {
  const t = en ? tenChuanSkuEN(code, namesEn) : tenChuanSku(code, specs);
  return t ? (en ? TIEN_TO_HDSD_EN : TIEN_TO_HDSD) + t : null;
}

/* KHỚP TỪNG KÝ TỰ với tên chuẩn — hoa/thường và dấu câu đều tính.

   Cố ý CHẶT (chốt 25/08/2026: "thay thế đúng theo như tên đặt trong brandcore"): tên
   trên web đang mỗi nơi một kiểu chữ — "NOMA 922 – DUNG DỊCH PHỦ NANO KÍNH" viết hoa
   toàn bộ với gạch dài, "NOMA 130  - …" thừa dấu cách. Bỏ qua mấy khác biệt đó thì tên
   hiển thị vẫn lộn xộn, mà đây đúng là thứ khách nhìn thấy.
   Chỉ chuẩn hoá Unicode NFC trước khi so: cùng một chữ gõ ở hai dạng tổ hợp trông y hệt
   nhau, báo lệch là bắt người duyệt đi sửa thứ không ai nhìn ra. */
export const giongTieuDe = (a, b) =>
  String(a || "").normalize("NFC").trim() === String(b || "").normalize("NFC").trim();
