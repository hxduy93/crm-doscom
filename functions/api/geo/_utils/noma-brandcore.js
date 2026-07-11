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

// ── Bộ QUÉT VI PHẠM (regex, không tốn AI) — dùng cho menu "Sửa brandcore" ──
// Phát hiện nhanh bài NOMA đã đăng có cụm vi phạm brand core để đưa vào diện cần sửa.
// Match trên bản đã BỎ DẤU (foldVi) để không phải viết class Unicode dễ sai; mỗi mục có nhãn `type`.
// Mỗi mục: `type` (nhãn), `re` (regex trên bản bỏ dấu), `fix` (chuỗi thay thế mặc định —
// dùng để tạo cặp sửa DETERMINISTIC, không phụ thuộc AI, đảm bảo cụm cấm luôn bị thay).
export const NOMA_FORBIDDEN = [
  // Xuất xứ sai (nặng nhất — trái nguyên tắc vàng)
  { type: "xuất xứ: Made in USA", re: /made in usa/, fix: "thương hiệu gốc Mỹ" },
  { type: "xuất xứ: sản xuất tại Mỹ", re: /san xuat (tai|o) my\b/, fix: "sản xuất qua đối tác OEM quốc tế" },
  { type: "xuất xứ: hàng Mỹ về", re: /hang my ve\b/, fix: "nhập khẩu chính ngạch" },
  { type: "xuất xứ: nhập khẩu từ Mỹ", re: /nhap ?(khau ?)?(truc tiep ?)?tu my\b/, fix: "nhập khẩu chính ngạch" },
  { type: "xuất xứ: công nghệ Mỹ", re: /cong nghe my\b/, fix: "công thức chuẩn Mỹ" },
  { type: "xuất xứ: chính hãng Mỹ", re: /chinh hang my\b/, fix: "chính hãng" },
  { type: "xuất xứ: nhà máy ở Mỹ", re: /nha may o my\b/, fix: "nhà máy đạt chuẩn ISO" },
  { type: "xuất xứ: nhà phân phối của Noma USA", re: /nha phan phoi.{0,20}noma usa/, fix: "đơn vị vận hành và phân phối chính hãng" },
  { type: "xuất xứ: Noma USA", re: /noma usa/, fix: "NOMA" },
  // Claim tuyệt đối / vĩnh viễn
  { type: "claim: an toàn tuyệt đối", re: /(an toan tuyet doi|tuyet doi an toan)/, fix: "an toàn" },
  { type: "claim: 100%", re: /100 ?%/, fix: "" },
  { type: "claim: bảo hành trọn đời", re: /bao hanh tron doi/, fix: "bảo hành theo chính sách" },
  { type: "claim: vĩnh viễn", re: /vinh vien/, fix: "lâu dài" },
  { type: "claim: xoá hoàn toàn", re: /xo?a hoan toan/, fix: "làm sạch" },
  // Từ ngữ cấm
  { type: "từ cấm: số 1", re: /so (1|mot)\b/, fix: "hàng đầu" },
  { type: "từ cấm: tốt nhất", re: /tot nhat/, fix: "cao" },
  { type: "từ cấm: vô địch", re: /vo dich/, fix: "hàng đầu" },
  { type: "từ cấm: cực phẩm", re: /cuc pham/, fix: "chất lượng cao" },
  { type: "từ cấm: vượt trội", re: /vuot troi/, fix: "hiệu quả" },
  { type: "từ cấm: đột phá", re: /dot pha/, fix: "hiện đại" },
  { type: "từ cấm: tiên tiến", re: /tien tien/, fix: "hiện đại" },
  { type: "từ cấm: giá rẻ / siêu rẻ", re: /(sieu re|gia re|re nhat)/, fix: "giá hợp lý" },
  // Claim chứng nhận vượt quá MSDS/GHS (brand core: chỉ được nói "MSDS theo chuẩn GHS").
  // KHÔNG bắt "chuẩn quốc tế" (là giá trị brand core hợp lệ) — chỉ bắt "tiêu chuẩn/kiểm định quốc tế", SGS, Intertek.
  { type: "claim: kiểm định/tiêu chuẩn quốc tế (chỉ có MSDS)", re: /(kiem dinh quoc te|tieu chuan quoc te|\bsgs\b|intertek)/, fix: "MSDS theo chuẩn GHS" },
];

// Bộ từ cấm TIẾNG ANH — cho nomaauto.us (bản EN). Áp dụng cùng nguyên tắc brand core.
export const NOMA_FORBIDDEN_EN = [
  // Origin (nặng nhất)
  { type: "origin: Made in USA", re: /made in( the)? usa/, fix: "US-origin brand" },
  { type: "origin: manufactured in USA", re: /manufactured in( the)? usa/, fix: "manufactured through international OEM partners" },
  { type: "origin: American-made", re: /american[- ]made/, fix: "US-origin" },
  { type: "origin: US/American technology", re: /(us|american) technology/, fix: "US-standard formula" },
  { type: "origin: imported from USA", re: /imported (directly )?from( the)? usa/, fix: "officially imported" },
  // Absolute / lifetime claims
  { type: "claim: absolutely/100% safe", re: /(absolutely safe|100% safe|completely safe)/, fix: "safe when used as directed" },
  { type: "claim: 100%", re: /100 ?%/, fix: "" },
  { type: "claim: lifetime warranty", re: /lifetime (warranty|guarantee)/, fix: "warranty per policy" },
  { type: "claim: forever/permanent", re: /(protects? forever|lasts? forever|permanent protection)/, fix: "long-lasting protection" },
  { type: "claim: completely removes", re: /(completely remove|remove(s)? completely|removes everything)/, fix: "effectively cleans" },
  // Superlatives
  { type: "superlative: best / no.1", re: /(the best|no\.? ?1\b|number one|#1|world'?s best)/, fix: "leading" },
  { type: "superlative: superior/outstanding", re: /(superior|outstanding|unbeatable|unmatched)/, fix: "effective" },
  { type: "superlative: revolutionary/breakthrough", re: /(revolutionary|breakthrough|cutting[- ]edge|state[- ]of[- ]the[- ]art|most advanced)/, fix: "modern" },
  { type: "price: cheapest", re: /(cheapest|lowest price)/, fix: "cost-effective" },
  // Certification beyond MSDS/GHS
  { type: "cert: SGS/Intertek", re: /(\bsgs\b|intertek)/, fix: "GHS-compliant MSDS" },
];

// Bản brand core rút gọn TIẾNG ANH — nối vào system prompt khi rà/viết nội dung EN (nomaauto.us).
export const NOMA_BRAND_GUIDE_EN = `═══ NOMA BRAND CORE v3 — MANDATORY FOR ENGLISH CONTENT (nomaauto.us) ═══
This governs all NOMA content and overrides any other brand description. Violations = broken content.

BRAND IDENTITY (state correctly, do not invent):
- NOMA is a US-origin DIY car-care brand under NOMA Technologies LLC (a legal entity registered in the USA).
- Products are manufactured through international OEM partners (ISO-certified), then imported through official channels.
- NOMA Vietnam operates & distributes officially in Vietnam (NOT "a distributor of Noma USA").

⛔ GOLDEN RULE ON ORIGIN (LAW — no exceptions):
- Talking about the BRAND → "US-origin brand", "formulated to US detailing standards" is allowed.
- Talking about the PRODUCT → be honest about OEM: "manufactured through international OEM partners".
- NEVER write: "Made in USA", "manufactured in the USA", "American-made", "US technology", "imported from the USA", "genuine US-made".
- "US standard / American detailing standard" = a TECHNICAL standard (formula + GHS safety + method), NOT country of manufacture.

CORE MESSAGES:
- Tagline: "Professional car care." · USP: "US-standard car care — anyone can do it at home."
- Trust points (RTB): full GHS-compliant MSDS published; officially imported with full documents.

TONE: straightforward, transparent (state limits too), practical, friendly. No hype ("advanced/superior/cutting-edge"), no fear-mongering, no talking down to beginners.

⛔ BANNED WORDS / CLAIMS (never use):
- "Made in USA", "American-made", "US technology", "absolutely/100% safe", "lifetime warranty", "permanent/forever protection", "completely removes", "the best", "No.1 / number one", "superior", "outstanding", "unbeatable", "revolutionary", "breakthrough", "cutting-edge", "cheapest".
- Do NOT claim "international certification / tested to international standards / SGS / Intertek" — only "MSDS to GHS standard".
- Do NOT name competitors to disparage. No health claims (causes/doesn't cause cancer) without a COA.

⚠ SAFETY WARNINGS: do NOT touch — do not add/edit/remove safety warnings; leave as-is.`;

// Bỏ dấu tiếng Việt + hạ thường (đ→d). Giữ độ dài 1:1 theo ký tự gốc NFC (để lấy quote đúng vị trí).
export function foldVi(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "d")
    .toLowerCase();
}

// Tạo cặp sửa DETERMINISTIC cho mọi cụm regex bắt được (không cần AI): {type, original=quote, fixed=fix}.
// original = cụm chữ gốc CHÍNH XÁC (từ scanForbidden) → applyFixes chắc chắn khớp và thay được.
export function deterministicFixes(text, list = NOMA_FORBIDDEN) {
  const fixByType = new Map(list.map((f) => [f.type, typeof f.fix === "string" ? f.fix : ""]));
  return scanForbidden(text, list).map((f) => ({
    type: f.type,
    original: f.quote,
    fixed: fixByType.get(f.type) ?? "",
    reason: "vi phạm brand core (dò tự động)",
  }));
}

// Áp các cặp sửa {original -> fixed} vào HTML bằng THAY CHUỖI NGUYÊN VĂN.
// Giữ nguyên 100% cấu trúc/thẻ/ảnh/xuống dòng — KHÔNG viết lại HTML nên không gộp đoạn,
// không dời ảnh, không mất <br>/<li>. Cặp nào không tìm thấy chuỗi gốc → bỏ qua (skipped),
// không đụng gì (an toàn hơn là đoán). Trả { fixed, applied[], skipped[] }.
//
// CHỈ thay trong phần CHỮ, KHÔNG thay bên trong thẻ HTML (src/style/alt/class).
// Lý do: cặp sửa "100%" → "" (rỗng) từng có thể ăn vào style ảnh `max-width:100%` mà tool đăng bài
// tự chèn → hỏng ảnh. Vi phạm brand core luôn nằm ở chữ người đọc thấy, nên không cần đụng thẻ.
export function applyFixes(html, violations) {
  // Tách xen kẽ: phần tử chỉ số CHẴN = chữ, LẺ = thẻ HTML (giữ nguyên tuyệt đối).
  const parts = String(html || "").split(/(<[^>]*>)/);
  const applied = [];
  const skipped = [];
  for (const v of (Array.isArray(violations) ? violations : [])) {
    const o = v && typeof v.original === "string" ? v.original : "";
    const f = v && typeof v.fixed === "string" ? v.fixed : "";
    const label = (v && v.type) || o;
    if (!o || o === f) continue;
    let hit = false;
    for (let i = 0; i < parts.length; i += 2) {
      if (parts[i].includes(o)) { parts[i] = parts[i].split(o).join(f); hit = true; }
    }
    if (hit) applied.push(label);
    else skipped.push(label);
  }
  return { fixed: parts.join(""), applied, skipped };
}

// Quét text tìm cụm vi phạm brand core. Trả [{type, quote}] — quote = đoạn khớp lấy từ text GỐC.
// Bỏ thẻ HTML trước khi quét để không dính vào tên class/thuộc tính.
export function scanForbidden(text, list = NOMA_FORBIDDEN) {
  const orig = String(text || "").replace(/<[^>]+>/g, " ");
  const folded = foldVi(orig);
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const m = folded.match(f.re);
    if (m && !seen.has(f.type)) {
      seen.add(f.type);
      out.push({ type: f.type, quote: orig.slice(m.index, m.index + m[0].length).trim() });
    }
  }
  return out;
}
