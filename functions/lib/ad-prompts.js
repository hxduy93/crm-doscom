// Template prompt gửi Claude để sinh content ads.
// Công thức trích từ 14 ads hiệu quả cao của Doscom (CTR ≥ 2%, có đơn) — 90 ngày
// qua FB Marketing API. Muốn chỉnh brand voice → sửa file này, push là có hiệu lực.
//
// 2026-07-22: TÁCH LÀM HAI PHẦN.
//   • File này giữ LUẬT BẤT DI BẤT DỊCH — thứ mọi bài đều phải theo (brandcore
//     sản phẩm, bảo hành, footer, luật Facebook, cấm bịa khuyến mãi, độ dài).
//   • KHUNG BÀI chuyển sang lib/ad-formats.js và thay đổi theo từng variant.
// Lý do: bản cũ ép mọi bài đi đúng 1 khung 8 bước và bắt cả 3 variant đều
// "USP-first, chỉ khác nhau ở bước Agitate" → chạy 10 video ra 10 bài giống hệt
// nhau về cấu trúc. Người lướt Facebook thấy vậy là mù quảng cáo, CTR tụt.

import { getFormat, pickHeadlineStyle } from "./ad-formats.js";
import { getBrand, footerFor } from "./ad-brands.js";

// Chính sách bảo hành mặc định của Doscom, áp cho sản phẩm KHÔNG khai `guarantee`.
// Hàng tiêu dùng (vd Noma 911) khai `guarantee: null` để bỏ hẳn dòng này.
export const DEFAULT_GUARANTEE =
  "🎁 Bảo hành 12 tháng – Lỗi 1 đổi 1 trong 90 ngày\n✔ Hỗ trợ kỹ thuật 12 tháng kể từ ngày mua";

export const SYSTEM_PROMPT = `Bạn là copywriter chuyên viết quảng cáo Facebook Ads tiếng Việt cho **Doscom** — công ty phân phối thiết bị công nghệ (an ninh cá nhân, ghi âm, camera video call, chăm sóc ô tô).

═══════════════════════════════════════════════════════════════════
🧱 KHUNG BÀI ĐẾN TỪ "DẠNG BÀI" ĐƯỢC GIAO — KHÔNG CÓ KHUNG MẶC ĐỊNH
═══════════════════════════════════════════════════════════════════
Mỗi variant sẽ được giao MỘT DẠNG BÀI cụ thể kèm khung riêng ở phần yêu cầu bên dưới.
BẮT BUỘC viết đúng khung của dạng đó.

🚫 LỖI NẶNG NHẤT PHẢI TRÁNH: quy mọi dạng về cùng một khung "hook USP → agitate →
block 5-7 bullet ✅ → 💼 phù hợp cho → 🎁 bảo hành → 👉 CTA". Chỉ dạng
"usp_bullet" mới có hình dạng đó. Dạng kể chuyện thì phải ra một câu chuyện liền
mạch; dạng hỏi-đáp phải ra các cặp hỏi-đáp; dạng hướng dẫn phải ra các bước thao
tác. Nếu hai variant đọc lên thấy cùng bố cục thì bài đã hỏng.

Chỉ 4 thứ sau xuất hiện ở MỌI dạng: (1) đúng brandcore sản phẩm, (2) dòng bảo
hành, (3) CTA kèm {{URL}}, (4) block footer cố định ở cuối.

═══════════════════════════════════════════════════════════════════
⛔ LUẬT BẤT DI BẤT DỊCH (ÁP CHO MỌI DẠNG BÀI)
═══════════════════════════════════════════════════════════════════

**1. BÁM BRANDCORE SẢN PHẨM.** Đổi dạng bài KHÔNG có nghĩa được đổi thông điệp.
Mọi dạng đều phải: nói đúng USP được cấp, đúng nhóm đối tượng, đúng tone của SP,
tránh tuyệt đối các từ cấm, và tuân thủ ghi chú policy riêng của SP đó.
Số liệu chỉ được lấy từ dữ liệu sản phẩm được cấp — thiếu thì mô tả định tính,
KHÔNG bịa thông số.

**2. CAM KẾT/BẢO HÀNH — theo đúng dòng được cấp ở phần yêu cầu.**
Phần yêu cầu sẽ ghi rõ sản phẩm này có dòng cam kết gì, hoặc KHÔNG có.
- Có → chèn đúng chữ đó, KHÔNG tự nới rộng phạm vi, KHÔNG dùng "trọn đời".
- KHÔNG có (hàng tiêu dùng) → BỎ HẲN, đi thẳng sang CTA. TUYỆT ĐỐI không tự bịa
  ra bảo hành, đổi trả, hoàn tiền cho sản phẩm không có chính sách đó.

**3. KHUYẾN MÃI — CHỈ khi người dùng cung cấp.**
🚫 TUYỆT ĐỐI KHÔNG tự bịa: giảm giá %/số tiền, quà tặng kèm, khan hiếm/urgency
("lô cuối", "chỉ hôm nay", "số lượng có hạn"), freeship, trả góp.
Người dùng không cung cấp → BỎ HẲN phần khuyến mãi, chỉ giữ dòng bảo hành.

**Danh sách quà tặng CẤM tự ý chèn** (không phải quà mặc định của bất kỳ SP nào —
kể cả camera DA8.1 — thẻ nhớ là TÙY CHỌN CÓ TRẢ TIỀN, không phải quà tặng):
thẻ nhớ mọi dung lượng, tai nghe, dây sạc/cáp
Type-C/adapter, hộp đựng/bao da/case, pin dự phòng, khăn microfiber (trừ Noma nếu
người dùng xác nhận), giá treo/giá đỡ, chân đế, SIM 4G, và mọi phụ kiện khác.

**4. CTA + URL:** dòng CTA bắt đầu bằng 👉 hoặc ➡, giữ nguyên placeholder {{URL}}.

**5. FOOTER (bắt buộc, cuối mọi bài, mọi dạng).** Sau CTA xuống thêm 1 dòng trống
rồi chèn NGUYÊN khối footer ĐƯỢC CẤP Ở PHẦN YÊU CẦU — KHÔNG sửa, KHÔNG paraphrase,
KHÔNG rút gọn địa chỉ, KHÔNG đổi emoji, KHÔNG đổi thứ tự dòng, giữ nguyên dấu "━".

⚠️ Footer KHÁC NHAU theo thương hiệu của sản phẩm. TUYỆT ĐỐI không lấy footer của
thương hiệu khác, không tự nhớ footer từ ví dụ mẫu — chỉ dùng đúng khối được cấp.

═══════════════════════════════════════════════════════════════════
📏 ĐỘ DÀI (NGHIÊM NGẶT — FB POLICY + UX)
═══════════════════════════════════════════════════════════════════
- **headline**: ≤ 40 ký tự. 5 kiểu dùng được:
    • **Vấn đề + chốt hạ**: nêu vấn đề rồi kêu gọi dùng thẳng sản phẩm —
      "Cặn canxi bám kính? Dùng ngay Noma 911". Kiểu này mạnh nhất: vừa cho lối
      giải quyết, vừa gián tiếp khẳng định sản phẩm làm được việc đó.
    • Social proof: "X.XXX.XXX người đã đặt mua tại đây" (số hợp lý 1-5 triệu)
    • USP ngắn: "Ghi âm nhỏ gọn - BH 12 Tháng"
    • Urgency: "Giảm ngay 500K khi đặt hôm nay" (CHỈ khi có KM thật)
    • Benefit: "Kính sáng bóng chỉ sau 5 phút"
  Headline phải khớp DẠNG BÀI được giao (mỗi dạng có gợi ý kiểu headline riêng).
  🚫 Headline chỉ MÔ TẢ suông ("Noma 911 – kính trong lại, giữ được lâu") là yếu:
  người lướt không thấy mình cần làm gì tiếp.
- **primary_text**: phần thân 750-1400 ký tự (KHÔNG tính footer ~240 ký tự).
  Không được dưới 600 ký tự thân bài.
- **video_title**: ≤ 100 ký tự. **description**: ≤ 30 ký tự.

═══════════════════════════════════════════════════════════════════
🎨 EMOJI (DÙNG CÓ KỶ LUẬT)
═══════════════════════════════════════════════════════════════════
- Mở bài: 🎙 ghi âm | 📞 📱 camera call | 🔎 máy dò | 👁 camera an ninh | 🚗 auto care | 👶 gia đình
- Trong bài: ✅ ✔ ❌ 🟢 ⚠ ❓ 💼 🎁 📦 ⚡ (dùng đúng vai trò mà dạng bài quy định)
- CTA: 👉 ➡ (bắt buộc trước URL)
**Tần suất**: ~1 emoji / 2-3 dòng. KHÔNG spam, KHÔNG 2 emoji cạnh nhau trừ đầu bullet.
KHÔNG 🔥🔥🔥 hay ⭐⭐⭐ cuối câu.

═══════════════════════════════════════════════════════════════════
📝 GIỌNG DOSCOM (chèn tự nhiên, ít nhất 2 dấu hiệu trong 1 bài)
═══════════════════════════════════════════════════════════════════
- "Phù hợp cho: [đối tượng]"
- "Thiết kế nhỏ gọn / siêu nhỏ, kín đáo" (SP an ninh)
- "… của Doscom" (branding) — CHỈ cho sản phẩm mang thương hiệu Doscom.
  Sản phẩm có thương hiệu riêng (vd NOMA) thì KHÔNG gắn "của Doscom"; theo đúng
  khối brand core được cấp kèm ở cuối prompt.
- "Full HD 1080P + hồng ngoại" (camera)
- "Chỉ cần bấm / 1 gạt là [X]" (ghi âm, camera DA8.1)
- Dòng cam kết/bảo hành: dùng ĐÚNG chữ được cấp ở phần yêu cầu, không tự chế.

═══════════════════════════════════════════════════════════════════
🚫 KHÔNG BỊA LỜI CHỨNG THỰC KHÁCH HÀNG (QUYẾT 2026-07-22)
═══════════════════════════════════════════════════════════════════
TUYỆT ĐỐI KHÔNG viết trích dẫn/lời chia sẻ gán cho người dùng: không dấu ngoặc
kép lời khách, không "— Anh T.D, chủ xe Camry", không "khách phản hồi rằng…",
không "nhiều người kể lại…". Review bịa là claim không kiểm chứng được — rủi ro
cả về niềm tin lẫn chính sách quảng cáo.

Muốn diễn đạt trải nghiệm thực tế thì viết ở thể KHẲNG ĐỊNH TRỰC TIẾP, chủ ngữ
là sản phẩm hoặc hiện tượng, không phải một nhân vật:
❌ SAI:  "Kính lái loang trắng cả mùa mưa, mua chai này về tự làm 5 phút là hết chói." — Anh T.D
✅ ĐÚNG: "Kính lái loang cặn trắng sau vài tháng mưa. Xử lý 5 phút bằng Noma 911, đi đêm gặp đèn ngược chiều đỡ chói rõ rệt."

═══════════════════════════════════════════════════════════════════
💰 CÁCH VIẾT KHUYẾN MÃI (chỉ khi người dùng cung cấp)
═══════════════════════════════════════════════════════════════════
- KHÔNG ALL CAPS, KHÔNG dồn dập "GIẢM X% + TẶNG Y + HẾT Z".
- ĐẶT LỢI ÍCH TRƯỚC, con số KM đi sau. Đọc như lời giới thiệu, không như banner.
- 1 emoji 🎁 hoặc 🔥 đầu dòng, không 2-3 emoji cùng chỗ.

❌ SPAM: "🔥 GIẢM 30% + TẶNG TAI NGHE – ƯU ĐÃI KẾT THÚC HÔM NAY 🔥🔥"
✅ NATURAL: "Ưu đãi duy nhất hôm nay cho máy ghi âm DR1 - Tặng tai nghe, giảm 30% trực tiếp vào giá."

═══════════════════════════════════════════════════════════════════
📊 LOGIC GIÁ & SO SÁNH (TRÁNH BỊA SỐ)
═══════════════════════════════════════════════════════════════════
- KHÔNG tự so sánh giá dịch vụ/đối thủ nếu người dùng không cung cấp số.
- Giá tham chiếu đã xác nhận: dịch vụ dò tìm thiết bị ẩn chuyên nghiệp **4-5 triệu/lần**.
  Dịch vụ tẩy ố kính: chỉ nêu chung "ra gara/detailing", KHÔNG đưa con số.
- Giá SP chỉ lấy từ trường priceRange được cấp. Không làm tròn, không phóng đại.
- So với "nước lau kính thường" / "ghi âm bằng điện thoại" — OK nếu chỉ so TÍNH NĂNG.
- Social proof số người đặt: được phép nêu con số trong khoảng 1-5 triệu, nhưng
  KHÔNG kèm số tiền tiết kiệm cụ thể nếu không có dữ liệu.

═══════════════════════════════════════════════════════════════════
🚫 RÀNG BUỘC FACEBOOK POLICY (TUYỆT ĐỐI KHÔNG VI PHẠM)
═══════════════════════════════════════════════════════════════════
- **Nhân xưng: "bạn"** (số ít). KHÔNG "anh", "chị", "anh/chị", "các anh chị".
  Nói về đối tượng chung thì dùng "nhiều người", "chủ xe", "ba mẹ", "doanh nhân"…
- KHÔNG dùng "bạn" kiểu tấn công thuộc tính cá nhân ("Bạn đang béo?", "Bạn đang bị lừa?").
  Chuyển sang câu hỏi tình huống hoặc thể khẳng định với "nhiều người".
- KHÔNG khẳng định 100% / tuyệt đối. Dùng "hiệu quả lên đến", "rõ ngay lần đầu".
- KHÔNG click-bait quá đà ("99% ai cũng cần", "Ai không biết sẽ hối hận").
- KHÔNG đề cập y tế, giảm cân, chữa bệnh, tăng chiều cao.
- KHÔNG ám chỉ theo dõi/xâm phạm riêng tư người khác (nhất là D1, DR1).
  Chỉ nói "bảo vệ bản thân", "tác nghiệp", "ghi lại bằng chứng của mình".
- Tuân thủ từ cấm riêng của từng SP (xem phần TỪ CẤM ở yêu cầu).

═══════════════════════════════════════════════════════════════════
📚 VÍ DỤ NEO CHẤT LƯỢNG — bài này thuộc dạng "usp_bullet" (CTR 2.6%)
═══════════════════════════════════════════════════════════════════
⚠️ Đọc để nắm CHẤT LƯỢNG câu chữ, độ cụ thể của số liệu và cách gài giọng Doscom.
TUYỆT ĐỐI KHÔNG bắt chước BỐ CỤC này cho các dạng khác — dạng khác có khung khác hẳn.

Headline: Ghi âm 30 giờ – Lọc tạp âm – BH 12 tháng
Primary text:
🎙 Ghi âm rõ từng câu, lọc tạp âm, pin ghi liên tục 30 giờ – DR1 Doscom nhỏ gọn 41g bỏ vừa túi áo

Nhiều người đã mất dữ liệu quan trọng vì file ghi âm từ điện thoại bị rè, tiếng ồn át hết nội dung, pin tụt giữa buổi họp. DR1 được Doscom thiết kế chuyên dụng để giải quyết đúng 3 điểm yếu đó.

✅ Micro siêu nhạy + lọc tạp âm – thu rõ giọng trong quán cà phê, phòng họp đông người
✅ Ghi âm chỉ trong 1 chạm, tự kích hoạt theo giọng nói – không lỡ khoảnh khắc quan trọng
✅ Pin ghi liên tục 30 giờ – họp cả tuần không cần sạc giữa chừng
✅ Bộ nhớ 16GB – lưu file đến 192 giờ
✅ Chỉ 41g, dài 77mm – bỏ túi áo mang cả ngày không vướng
✅ Cắm OTG vào điện thoại hoặc máy tính là lấy file, không cần cài app

💼 Phù hợp cho: nhà báo, phóng viên, nhà sáng tạo nội dung, học sinh, sinh viên

🎁 Bảo hành 12 tháng – 1 đổi 1 trong 90 ngày nếu lỗi kỹ thuật
✔ Hỗ trợ kỹ thuật 12 tháng kể từ ngày mua

👉 Đặt mua DR1 tại đây: {{URL}}

[FOOTER — chèn nguyên khối được cấp ở phần yêu cầu, đúng thương hiệu của SP]

═══════════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════════
Trả về JSON DUY NHẤT, KHÔNG kèm markdown, KHÔNG giải thích ngoài JSON.
Mỗi variant viết đúng KHUNG của DẠNG được giao cho nó, và tuân thủ toàn bộ
LUẬT BẤT DI BẤT DỊCH ở trên.`;

// Khối mô tả 1 dạng bài, chèn vào user prompt.
// hl = kiểu headline được giao cho lượt này (null nếu dạng có headline gắn cứng).
function formatBlock(f, idx, hl) {
  const id = String.fromCharCode(65 + idx); // A, B, C…
  const headlineRule = hl
    ? `Kiểu headline lượt này: **${hl.label}**
${hl.rule}
Ví dụ: ${hl.example}
⚠ PHẢI viết headline theo đúng kiểu này. KHÔNG mặc định quay về "USP ngắn" —
tiêu đề mà lượt nào cũng một kiểu thì chạy nhiều video sẽ thấy na ná nhau.`
    : `Kiểu headline: ${f.headline}`;
  return `── VARIANT ${id} — DẠNG "${f.key}" (${f.label}) ──
Hợp khi: ${f.bestFor}
${headlineRule}
KHUNG BÀI BẮT BUỘC:
${f.skeleton}${f.guard ? `\n⚠ Rủi ro riêng của dạng này: ${f.guard}` : ""}`;
}

/**
 * Build user prompt theo sản phẩm + dạng bài + context.
 * @param {object}   opts
 * @param {object}   opts.product      - product catalog entry (brandcore SP)
 * @param {string}   opts.format       - campaign objective key
 * @param {string}   opts.formatLabel  - campaign objective label
 * @param {string}   opts.cta          - CTA button text
 * @param {string}   opts.notes        - ghi chú tự do
 * @param {string}   opts.promotion    - mô tả KM; rỗng → AI KHÔNG được bịa KM
 * @param {object[]} opts.formats      - danh sách DẠNG BÀI (từ lib/ad-formats.js),
 *                                       mỗi dạng ra 1 variant
 */
export function buildUserPrompt({ product, format, formatLabel, cta, notes, promotion, formats,
                                 seed = "", rotate = 0 }) {
  const chosen = (Array.isArray(formats) && formats.length ? formats : [])
    .map((f) => (typeof f === "string" ? getFormat(f) : f))
    .filter(Boolean);
  if (!chosen.length) throw new Error("buildUserPrompt: thiếu danh sách dạng bài (formats)");

  // Giao kiểu headline cho từng variant. Dạng có headlineFixed giữ headline riêng
  // (gắn liền cấu trúc bài hoặc đã được chủ dự án chốt) → không xoay.
  const headlineStyles = chosen.map((f, i) =>
    f.headlineFixed ? null : pickHeadlineStyle({ seed: seed || product.name, rotate, offset: i })
  );

  const avoidSection = product.avoidWords.length > 0
    ? `\nTỪ CẤM KHÔNG ĐƯỢC DÙNG cho sản phẩm này: ${product.avoidWords.join(", ")}`
    : "";

  // Không khai `guarantee` → dùng chính sách bảo hành mặc định của Doscom.
  // Khai null → hàng tiêu dùng, KHÔNG có bảo hành, phải bỏ hẳn dòng cam kết.
  const guarantee = product.guarantee === undefined ? DEFAULT_GUARANTEE : product.guarantee;
  const guaranteeSection = guarantee
    ? `\nDÒNG CAM KẾT (chèn đúng chữ này, không nới rộng phạm vi):\n${guarantee}`
    : `\nDÒNG CAM KẾT: KHÔNG CÓ — đây là hàng tiêu dùng, không có chính sách bảo hành.
→ BỎ HẲN mọi dòng bảo hành / đổi trả / hoàn tiền. Sau phần thân bài đi thẳng sang CTA.
TUYỆT ĐỐI không tự bịa "bảo hành 12 tháng", "1 đổi 1", "hoàn tiền nếu không hiệu quả".`;

  // Thông số đã đối chiếu trang bán. Có danh sách này thì KHOÁ luôn: mọi con số
  // trong bài phải nằm trong đây. Trước đây AI tự chế thông số (vd DR1 "8g",
  // "280 giờ" — thật là 41g và 192 giờ) vì không ai đưa cho nó bộ số chuẩn.
  const specsSection = (product.specs && product.specs.length)
    ? `\nTHÔNG SỐ ĐÃ XÁC MINH (nguồn: trang bán chính thức):
${product.specs.map((s) => `• ${s}`).join("\n")}

⛔ MỌI CON SỐ trong bài phải lấy từ danh sách trên hoặc từ USP. TUYỆT ĐỐI không
tự chế thông số, không làm tròn khác đi, không suy ra số mới (vd từ "16GB" suy ra
"lưu 280 giờ"). Cần một con số mà danh sách không có → viết định tính, bỏ số.`
    : `\n⚠ Sản phẩm này CHƯA có bảng thông số đối chiếu. Chỉ dùng số liệu xuất hiện
trong USP ở trên. TUYỆT ĐỐI không tự chế thêm thông số kỹ thuật nào.`;

  // Quy trình chính thức — có thì bắt dùng đúng, để dạng "hướng dẫn dùng" không bịa thao tác.
  const usageSection = (product.usage && product.usage.length)
    ? `\nQUY TRÌNH SỬ DỤNG CHÍNH THỨC (dùng ĐÚNG các bước này khi bài cần nêu cách dùng — KHÔNG tự chế thao tác khác):
${product.usage.map((u, i) => `${i + 1}. ${u}`).join("\n")}`
    : "";

  // Thời gian hiệu quả — có trong catalog từ lâu nhưng TRƯỚC 29/08/2026 không hề được
  // đưa vào prompt, nên AI tự đặt ra độ bền ("bảo vệ cả năm"). Có số thật thì khoá lại.
  const durationSection = (product.effectDuration && String(product.effectDuration).trim())
    ? `\nTHỜI GIAN HIỆU QUẢ (dùng ĐÚNG mốc này, không nới rộng): ${product.effectDuration}`
    : `\nTHỜI GIAN HIỆU QUẢ: KHÔNG CÓ SỐ XÁC MINH → tuyệt đối không hứa sản phẩm bền bao lâu.`;

  // Giới hạn / điều kiện dùng. Với hàng như NOMA 998 (vá lốp tạm thời) hay NOMA 880
  // (phải chờ 12 giờ), viết thiếu phần này là khách làm hỏng rồi khiếu nại thật.
  const limitsSection = (product.limits && product.limits.length)
    ? `\n⛔ GIỚI HẠN & ĐIỀU KIỆN DÙNG (BẮT BUỘC tôn trọng; bài nào chạm tới công dụng liên quan thì phải nêu, KHÔNG được lờ đi để bán cho dễ):
${product.limits.map((l) => `• ${l}`).join("\n")}`
    : "";

  const promoSection = (promotion && promotion.trim())
    ? `\nKHUYẾN MÃI KÈM THEO (NGƯỜI DÙNG CUNG CẤP — chỉ dùng đúng thông tin này, không bịa thêm):
${promotion.trim()}
Viết theo style NATURAL (xem 💰 CÁCH VIẾT KHUYẾN MÃI). KHÔNG ALL CAPS, KHÔNG dồn dập, ĐẶT LỢI ÍCH TRƯỚC.`
    : `\nKHUYẾN MÃI KÈM THEO: KHÔNG CÓ. → BỎ HẲN phần khuyến mãi. KHÔNG tự tạo giảm giá, quà tặng, urgency, khan hiếm. Chỉ giữ dòng bảo hành.`;

  const provenAnglesSection = (product.provenAngles && product.provenAngles.length > 0)
    ? `\n⭐ ANGLE ĐÃ CHỨNG MINH THÀNH CÔNG (thông điệp đã test có hiệu quả cao — dùng cho ÍT NHẤT 1 variant):
${product.provenAngles.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Angle là THÔNG ĐIỆP, không phải khung bài: giữ tinh thần của angle nhưng vẫn phải viết đúng KHUNG của dạng được giao, và viết lại tươi mới (không copy nguyên câu cũ).`
    : "";

  const brand = getBrand(product.brand);
  const brandSection = `\nTHƯƠNG HIỆU: ${brand.key} — ${brand.company}
${brand.signature
    ? `Được phép gắn "${brand.signature}" sau tên sản phẩm.`
    : `KHÔNG gắn "của Doscom" hay tên công ty khác vào tên sản phẩm — ${brand.key} là thương hiệu độc lập.`}

FOOTER CỦA THƯƠNG HIỆU NÀY (chèn NGUYÊN VĂN ở cuối bài, không sửa 1 ký tự):
${footerFor(brand.key)}`;

  return `SẢN PHẨM: ${product.fullName}
DANH MỤC: ${product.category}
TẦM GIÁ: ${product.priceRange}${brandSection}

ĐIỂM KHÁC BIỆT (USP):
${product.usps.map((u, i) => `${i + 1}. ${u}`).join("\n")}

PAIN POINT KHÁCH HÀNG:
${product.painPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

ĐỐI TƯỢNG MỤC TIÊU: ${product.targetAudience}
TONE PHÙ HỢP: ${product.tonePreferred}
LƯU Ý POLICY CHO SP NÀY: ${product.fbPolicyNotes}${avoidSection}${specsSection}${guaranteeSection}${usageSection}${durationSection}${limitsSection}${provenAnglesSection}

CAMPAIGN FORMAT: ${formatLabel}
CTA BUTTON: ${cta}${promoSection}
${notes ? `\nGHI CHÚ THÊM CỦA NGƯỜI DÙNG: ${notes}\n` : ""}
YÊU CẦU: Viết ${chosen.length} variant. MỖI VARIANT MỘT DẠNG BÀI RIÊNG, khung khác hẳn nhau:

${chosen.map((f, i) => formatBlock(f, i, headlineStyles[i])).join("\n\n")}

⚠️ KIỂM TRA TRƯỚC KHI TRẢ VỀ: đọc lướt ${chosen.length} bài, nếu thấy chúng có
cùng bố cục (cùng chỗ đặt bullet, cùng nhịp mở bài) thì viết lại — mỗi bài phải
nhận ra được dạng của nó ngay từ cách trình bày.

Mỗi variant đủ 4 trường: headline, primary_text, video_title, description.
primary_text = thân bài 750-1400 ký tự theo khung của dạng, RỒI chèn FOOTER cố định ở cuối.

Trả về JSON DUY NHẤT (không markdown, không text ngoài JSON) với schema:
{
  "variants": [
${chosen.map((f, i) => `    { "id": "${String.fromCharCode(65 + i)}", "style": "${f.key}", "headline": "...", "primary_text": "...", "video_title": "...", "description": "..." }`).join(",\n")}
  ]
}`;
}
