// Brand Core NOMA v3 — bản rút gọn để "neo" (grounding) mọi prompt sinh nội dung cho NOMA.
//
// Nguồn: tài liệu "Brand Core NOMA v3.0" (nội bộ Doscom). Đây là nội dung chi phối cách AI
// viết bài GEO (functions/api/geo/generate-content.js) và bài đăng sản phẩm mới
// (functions/api/products/generate.js) cho thương hiệu NOMA.
//
// LƯU Ý dùng: chỉ inject khi brand/site === "noma". Doscom KHÔNG dùng file này.
// Khi tài liệu brand core cập nhật phiên bản mới → sửa Ở ĐÂY (single source cho AI content).

// Giá trị brand "chuẩn" — thay cho các mô tả cũ (đã sai brand core: "công nghệ sản xuất từ Mỹ",
// "an toàn tuyệt đối" đều VI PHẠM red line). Dùng cho field name/voice/usp/audience.
export const NOMA_BRAND = {
  name: "NOMA",
  short: "NOMA",
  site: "https://noma.vn",
  // Định danh v3: thương hiệu gốc Mỹ, sản xuất OEM quốc tế, NOMA VN vận hành & phân phối chính hãng.
  voice:
    "thương hiệu chăm sóc xe DIY gốc Mỹ (thuộc NOMA Technologies LLC), sản xuất qua đối tác OEM quốc tế, " +
    "phân phối chính hãng tại VN. Giọng 'người anh biết xe' — thẳng thắn, minh bạch, thực dụng, gần gũi; " +
    "nhấn tự làm tại nhà theo chuẩn detailing Mỹ, có MSDS/GHS công khai.",
  products:
    "hóa chất chăm sóc & làm sạch ô tô: tẩy ố kính, phủ nano kính, phục hồi đèn pha, phục hồi nhựa nhám, " +
    "đánh bóng/xóa xước sơn, phủ bảo vệ sơn, vệ sinh nội thất da/nỉ, cùng dòng bảo dưỡng (vệ sinh kim phun, " +
    "tẩy rỉ bôi trơn, vệ sinh phanh, vá & bơm lốp khẩn cấp)",
  audience:
    "chủ xe ô tô tự chăm sóc xe tại nhà (DIY), nam 25–45 thành thị; thêm tệp chủ gara/tiệm rửa xe",
  // USP DUY NHẤT — không thay bằng câu khác.
  usp: "Chăm xe chuẩn Mỹ — ai cũng tự làm được tại nhà.",
  tagline: "Chăm xe chuyên nghiệp.",
};

// Khối luật brand core để nối vào system prompt. Ngắn gọn nhưng đủ các ĐIỀU CẤM.
export const NOMA_BRAND_GUIDE = `═══ NOMA BRAND CORE v3 — BẮT BUỘC KHI VIẾT VỀ NOMA ═══
Phần này chi phối toàn bộ nội dung NOMA và THẮNG mọi mô tả brand khác. Vi phạm = bài hỏng.

ĐỊNH DANH THƯƠNG HIỆU (nói đúng, không chế):
- NOMA là thương hiệu chăm sóc xe DIY GỐC MỸ, thuộc NOMA Technologies LLC (pháp nhân đăng ký tại Hoa Kỳ).
- Sản phẩm sản xuất QUA ĐỐI TÁC OEM QUỐC TẾ đạt chuẩn ISO, nhập khẩu chính ngạch về Việt Nam.
- NOMA Việt Nam (Công ty TNHH Noma Auto) là đơn vị VẬN HÀNH & PHÂN PHỐI CHÍNH HÃNG (không gọi là "nhà phân phối của Noma USA").

⛔ NGUYÊN TẮC VÀNG VỀ XUẤT XỨ (LUẬT — KHÔNG NGOẠI LỆ):
- Nói về THƯƠNG HIỆU → gắn Mỹ được: "thương hiệu gốc Mỹ", "công thức chuẩn ngành detailing Mỹ".
- Nói về SẢN PHẨM → trung thực OEM: "sản xuất qua đối tác OEM quốc tế".
- TUYỆT ĐỐI KHÔNG viết: "Made in USA", "sản xuất tại Mỹ", "hàng Mỹ về", "nhập khẩu từ Mỹ", "công nghệ Mỹ", "chính hãng Mỹ", "nhà máy ở Mỹ".
- "Chuẩn Mỹ" = TIÊU CHUẨN KỸ THUẬT (công thức R&D theo ngành detailing Mỹ + an toàn GHS + quy trình chuẩn), KHÔNG phải xuất xứ.

THÔNG ĐIỆP LÕI:
- Tagline: "Chăm xe chuyên nghiệp." · USP: "Chăm xe chuẩn Mỹ — ai cũng tự làm được tại nhà."
- Điểm tin cậy (RTB): MSDS theo chuẩn GHS công khai; nhập khẩu chính ngạch đầy đủ chứng từ; kết quả thấy được sau 1 lần dùng.

GIỌNG (Tone of Voice) — "người anh biết xe":
- Thẳng thắn, minh bạch (dám nói cả giới hạn sản phẩm), thực dụng, gần gũi. D2C xưng "NOMA / bạn".
- KHÔNG hoa mỹ ("công nghệ tiên tiến vượt trội"), KHÔNG học thuật trong mô tả chính (tránh SiO₂, Polymer, Hydrophobic — chỉ để ở mục "cơ chế"), KHÔNG hù dọa cực đoan, KHÔNG coi thường người chưa biết chăm xe.
- Không nói "rẻ": diễn đạt giá theo hướng "chi phí 1 chai = tiết kiệm nhiều lần ra gara".

⛔ TỪ / CLAIM CẤM (không dùng dù bất kỳ lý do):
- Từ cấm: rẻ, siêu rẻ, hàng xịn, số 1, tốt nhất, đỉnh, cực phẩm, vô địch, tiên tiến, vượt trội, đột phá, 100%, tuyệt đối, hoàn toàn, an toàn tuyệt đối, bảo hành trọn đời, xoá hoàn toàn, chính hãng Mỹ, Made in USA, công nghệ Mỹ.
- Claim cấm: "xoá hoàn toàn mọi vết bẩn", "tốt nhất thị trường", "số 1 Việt Nam", "lần đầu tiên tại VN", "bảo vệ vĩnh viễn", "detailer chuyên nghiệp khuyên dùng" (khi chưa có tên + video thật), "tiêu chuẩn kiểm định quốc tế/SGS/Intertek" (chỉ được nói "MSDS theo chuẩn GHS").
- KHÔNG nêu tên đối thủ trực tiếp để dìm hàng. KHÔNG claim sức khỏe (gây/không gây ung thư) khi chưa có COA. KHÔNG đề cập tai nạn giao thông, chính sách nhà nước, so sánh xe điện vs xe xăng, tôn giáo/vùng miền.

⚠ CẢNH BÁO AN TOÀN THEO SKU (theo MSDS GHS — nếu bài nhắc SKU dưới đây thì PHẢI kèm cảnh báo):
- NOMA 620 (phục hồi đèn pha): ăn mòn da → "đeo găng tay, tránh tiếp xúc da và mắt".
- NOMA 922 (phủ nano kính): dễ cháy (chứa cồn IPA) → "tránh xa lửa, tia lửa; không hút thuốc khi sử dụng".
- NOMA 692 & 310 (nội thất / chống mờ kính): tổn thương mắt → "tránh xịt vào mắt".
- NOMA 250 (phục hồi nhựa): kích ứng da → "rửa tay sau khi dùng".
- NOMA 890, 911, 955: không phân loại nguy hại GHS — không cần cảnh báo đặc biệt.`;
