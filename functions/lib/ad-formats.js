// Thư viện DẠNG BÀI quảng cáo + cách xoay vòng dạng.
//
// VÌ SAO CÓ FILE NÀY: trước đây prompt ép MỌI bài đi đúng 1 khung 8 bước
// (hook USP → agitate → 5-7 bullet ✅ → 💼 phù hợp cho → 🎁 bảo hành → 👉 CTA),
// và cả 3 variant đều bắt buộc "USP-first, chỉ khác nhau ở bước Agitate". Kết quả:
// mọi video, mọi sản phẩm ra bài nhìn như nhau. Người xem lướt Facebook thấy 5 ad
// cùng một khung thì mù quảng cáo, CTR tụt.
//
// Nay khung bài là BIẾN, không phải hằng: mỗi variant được giao 1 dạng khác nhau.
// Phần KHÔNG được đổi (brandcore sản phẩm, bảo hành, footer, luật Facebook, cấm
// bịa khuyến mãi) nằm ở SYSTEM_PROMPT trong ad-prompts.js và áp cho mọi dạng.

/**
 * Mỗi dạng gồm:
 *  - key        : mã gửi/nhận qua API
 *  - label      : tên hiển thị cho người dùng
 *  - bestFor    : khi nào dạng này ăn (để AI tự liệu, và để người chọn tay)
 *  - skeleton   : KHUNG BÀI cụ thể — đây mới là thứ tạo ra khác biệt thật
 *  - headline   : kiểu headline hợp với dạng
 *  - guard      : (tùy chọn) rủi ro policy riêng của dạng, nhắc AI tránh
 */
export const AD_FORMATS = [
  {
    key: "usp_bullet",
    label: "USP + gạch đầu dòng",
    bestFor: "Bài chủ lực, an toàn nhất. Hợp khách mua lần đầu cần thấy đủ tính năng.",
    headline: "USP ngắn hoặc Benefit có số",
    skeleton: `1. HOOK: 1-2 dòng, emoji đầu dòng, nêu thẳng USP ấn tượng nhất + tên SP.
2. AGITATE: 2-4 câu ngắn dồn dập, vẽ tình huống thực tế khách đang gặp.
3. CHUYỂN: 1 dòng ("👉 Đó là lý do…" / "Giải pháp gọn nhẹ:") giới thiệu SP như lời đáp.
4. TÍNH NĂNG: 5-7 bullet ✅, mỗi bullet = "Tính năng cụ thể – Lợi ích nói bằng ngôn ngữ khách". Có số liệu thật.
5. ĐỐI TƯỢNG: 1 dòng "💼 Phù hợp cho: [3-5 nhóm cụ thể]".
6. CAM KẾT (chỉ khi SP có; + khuyến mãi nếu có).
7. CTA + {{URL}}.`,
  },
  {
    key: "cau_chuyen",
    label: "Kể chuyện một tình huống",
    bestFor: "Sản phẩm giải quyết nỗi lo có thật, khách cần đồng cảm trước khi cần thông số.",
    headline: "Benefit hoặc câu kết của chuyện",
    skeleton: `KHÔNG dùng block bullet dày. Tối đa 3 bullet, và chỉ ở cuối.
1. MỞ: đặt người đọc vào MỘT tình huống cụ thể có thời gian - địa điểm - nhân vật ("Chiều thứ Sáu, đang họp với đối tác…"). Không nêu tên SP ở dòng đầu.
2. CAO TRÀO: chuyện xấu đi. 2-3 câu, viết như kể lại, không như quảng cáo.
3. BƯỚC NGOẶT: SP xuất hiện tự nhiên trong mạch chuyện, kèm chi tiết cụ thể (con số, thao tác).
4. KẾT: chuyện kết thúc tốt. Rút ra 1 câu bài học ngắn.
5. Tối đa 3 bullet ✅ tóm điều SP làm được.
6. CAM KẾT (chỉ khi SP có; + khuyến mãi nếu có). 7. CTA + {{URL}}.`,
    guard: "Chuyện phải hợp lý, đời thường. KHÔNG bịa tình huống nguy hiểm/giật gân, KHÔNG kể chuyện xâm phạm người khác.",
  },
  {
    key: "truoc_sau",
    label: "Trước / Sau (đối lập)",
    bestFor: "Sản phẩm có kết quả nhìn thấy được: tẩy ố kính, camera, chất lượng ghi âm.",
    headline: "Benefit có mốc thời gian (\"Kính sáng lại sau 5 phút\")",
    skeleton: `Bài dựng trên phép đối lập 2 khối, KHÔNG phải danh sách tính năng.
1. HOOK: 1 dòng nêu kết quả cuối cùng + emoji.
2. KHỐI "TRƯỚC": 3-4 dòng bắt đầu bằng ❌, mô tả đúng cảnh khách đang sống chung.
3. KHỐI "SAU": 3-4 dòng bắt đầu bằng 🟢, mô tả cảnh sau khi dùng SP. Mỗi dòng SAU phải trả lời đúng 1 dòng TRƯỚC theo thứ tự.
4. CƠ CHẾ: 2-3 câu giải thích VÌ SAO làm được (thành phần/công nghệ/thông số) — để không giống lời hứa suông.
5. ĐỐI TƯỢNG: 1 dòng 💼.
6. CAM KẾT (chỉ khi SP có; + khuyến mãi nếu có). 7. CTA + {{URL}}.`,
    guard: "KHÔNG khẳng định tuyệt đối (100%, sạch hoàn toàn). Dùng 'hiệu quả lên đến', 'rõ ngay lần đầu'.",
  },
  {
    key: "hoi_dap",
    label: "Hỏi - Đáp",
    bestFor: "Sản phẩm khách hay phân vân, nhiều câu hỏi trước khi chốt (giá, bảo hành, dùng có khó không).",
    headline: "USP ngắn hoặc câu trả lời cho thắc mắc lớn nhất",
    skeleton: `1. HOOK: 1 dòng USP + 1 câu dẫn "Dưới đây là 4 câu được hỏi nhiều nhất về [SP]:".
2. THÂN: 4 cặp Hỏi - Đáp. Định dạng:
   ❓ [Câu hỏi thật, viết đúng giọng khách hỏi]
   ✅ [Trả lời thẳng, 1-2 câu, có số liệu, không vòng vo]
   Câu hỏi phải là thắc mắc THẬT (dùng có khó không, pin bao lâu, có hợp xe/nhà mình không, bảo hành thế nào) — không phải câu hỏi mồi tự khen.
3. 1 câu chốt sau phần hỏi đáp.
4. CAM KẾT (chỉ khi SP có; + khuyến mãi nếu có). 5. CTA + {{URL}}.
KHÔNG dùng block bullet ✅ tính năng riêng — tính năng phải nằm trong câu trả lời.`,
  },
  {
    key: "checklist",
    label: "Dấu hiệu / trường hợp bạn cần",
    bestFor: "Khách chưa biết mình có nhu cầu. Giúp họ tự nhận ra mình thuộc nhóm nên mua.",
    headline: "Số + nhóm đối tượng (\"5 trường hợp nên có máy dò\")",
    skeleton: `1. HOOK: "[Số] dấu hiệu cho thấy bạn nên có [SP]" + emoji. 1 câu dẫn.
2. THÂN: 5 mục đánh số. Mỗi mục:
   [số]️⃣ [Tình huống cụ thể khách tự soi thấy mình]
   → [SP xử lý tình huống đó thế nào, 1 câu, có chi tiết kỹ thuật]
   Tình huống phải cụ thể (đi công tác ở khách sạn lạ, xe đỗ ngoài trời cả mùa mưa…), không chung chung.
3. 1 câu chốt: "Nếu bạn thấy mình ở 2/5 tình huống trên…".
4. CAM KẾT (chỉ khi SP có; + khuyến mãi nếu có). 5. CTA + {{URL}}.`,
    guard: "Tình huống KHÔNG được tấn công thuộc tính cá nhân, KHÔNG hù dọa quá đà. Viết ở thể 'nhiều người', tình huống trung tính.",
  },
  {
    key: "sai_lam",
    label: "Sai lầm thường gặp",
    bestFor: "Khách đang tự xử lý bằng cách sai/kém hiệu quả, cần chỉ ra rồi mới bán.",
    headline: "Số + chủ đề (\"3 sai lầm khi tự tẩy ố kính\")",
    skeleton: `1. HOOK: "[Số] sai lầm khiến [việc khách đang làm] không hiệu quả" + emoji.
2. THÂN: 3 mục. Mỗi mục:
   ❌ Sai lầm [n]: [cách làm sai phổ biến]
   Vì sao hỏng: [1 câu giải thích cơ chế]
   🟢 Làm đúng: [cách đúng, dẫn tự nhiên tới SP]
3. 1 đoạn 2-3 câu chốt SP giải quyết cả 3 sai lầm ra sao.
4. ĐỐI TƯỢNG 💼 (1 dòng). 5. CAM KẾT (chỉ khi SP có; + khuyến mãi nếu có). 6. CTA + {{URL}}.`,
    guard: "Chê CÁCH LÀM, tuyệt đối không chê người đọc. Không nói xấu thương hiệu/đối thủ cụ thể. Không bịa số liệu so sánh giá.",
  },
  {
    key: "huong_dan",
    label: "Hướng dẫn dùng",
    bestFor: "Sản phẩm khách sợ 'mua về không biết dùng': dung dịch, thiết bị có thao tác.",
    headline: `TÊN SẢN PHẨM + VẤN ĐỀ được xử lý + CÁCH xử lý gọn. Công thức này đã
được duyệt: người đọc thấy ngay mình đang gặp vấn đề đó và có lối giải quyết.
✅ "Noma 911 – tự tẩy ố kính tại nhà"   ✅ "DR1 – ghi họp cả ngày không hết pin"
❌ "Tự tẩy ố kính tại nhà, 5 phút xong" — cụt, không biết sản phẩm nào.`,
    skeleton: `1. HOOK: 1 dòng nêu kết quả + thời gian bỏ ra.
2. GIỚI THIỆU SẢN PHẨM (BẮT BUỘC, 2-3 câu, đặt TRƯỚC các bước): đây là cái gì,
   xử lý được vấn đề gì, cơ chế nào làm được. Thiếu khối này thì bài chỉ là mẹo
   vặt, người đọc không biết đang mua gì — lỗi hay gặp nhất của dạng này.
3. CHUẨN BỊ: 1 dòng liệt kê thứ cần có.
4. CÁC BƯỚC: đánh số, bám ĐÚNG quy trình chính thức được cấp ở phần yêu cầu
   (nếu có). Mỗi bước 1-2 câu, thêm chi tiết thực tế (lượng dùng, thời gian chờ,
   chiều chà). Đây là phần dài nhất. TUYỆT ĐỐI không tự chế thao tác khác.
5. LƯU Ý: 2 dòng ⚠ mẹo tránh làm hỏng — thể hiện mình hiểu nghề.
6. KẾT QUẢ: 1-2 câu mô tả thành quả + định mức dùng được bao nhiêu lần/xe.
7. CAM KẾT (nếu SP có). 8. CTA + {{URL}}.
KHÔNG dùng block bullet ✅ tính năng — tính năng thể hiện qua các bước.`,
  },
  {
    key: "trai_nghiem_theo_moc",
    label: "Trải nghiệm theo mốc thời gian",
    bestFor: "Khách phân vân dùng lâu có xuống không, mua về rồi bỏ xó không.",
    headline: "Kết quả theo mốc thời gian, có tên sản phẩm",
    skeleton: `🚫 DẠNG NÀY KHÔNG DÙNG LỜI CHỨNG THỰC. Không dấu ngoặc kép lời khách,
không "— Anh T.D, chủ xe Camry", không "khách phản hồi", không "nhiều người kể".
Mọi câu viết ở thể KHẲNG ĐỊNH TRỰC TIẾP, chủ ngữ là hiện tượng hoặc sản phẩm.

1. MỞ (2-3 câu khẳng định): nêu hiện trạng khách đang gặp, rồi BẮT BUỘC chốt lại
   bằng một trong hai — không được giải thích xong bỏ lửng:
   (a) NHẤN MẠNH gây ấn tượng: hệ quả cụ thể nếu để nguyên, hoặc mức độ khó xử lý
       (càng để lâu càng bám chặt, cách thông thường không ăn thua…), HOẶC
   (b) GIẢI PHÁP: nói thẳng phải làm gì / sản phẩm làm được gì với cái đó.
   ❌ SAI — giải thích rồi quăng đó, người đọc không thấy lối ra và không thấy
      sản phẩm mạnh ở đâu:
      "Đó là cặn canxi từ nước mưa chứ không phải bụi bẩn, nên lau kiểu nào cũng
       không hết."
   ✅ ĐÚNG — cùng thông tin đó nhưng chốt được thành vấn đề có lời giải:
      "Đó là cặn canxi bám vào bề mặt kính. Khăn lau hay nước rửa thường không ăn
       thua, càng để lâu càng bám chặt. Phải có dung dịch bóc được lớp khoáng đó
       thì kính mới trong lại."
   Nguyên tắc: mỗi đoạn giải thích phải kết thúc bằng một điều người đọc RÚT RA
   ĐƯỢC — về mức nghiêm trọng, hoặc về việc sản phẩm xử lý được.
2. DẪN: 1-2 câu giới thiệu SP và cơ chế xử lý.
3. TRẢI NGHIỆM THEO MỐC — phần xương sống, 3 mốc:
   • Ngay sau khi dùng: [thứ thấy được ngay]
   • Sau vài tuần: [thứ chỉ dùng một thời gian mới nhận ra]
   • Về lâu dài: [định mức, độ bền, thói quen chăm xe mới]
   Mỗi mốc 1-2 câu, có chi tiết quan sát được, không tính từ chung chung.
4. CHỐT: 1-2 câu nói thẳng SP hợp với ai.
5. CAM KẾT (nếu SP có). 6. CTA + {{URL}}.`,
    guard: "Tuyệt đối không trích dẫn lời người dùng dưới mọi hình thức. Không gán câu nói cho nhân vật có thật hay hư cấu.",
  },
  // ĐÃ BỎ dạng "so_sanh_cach_lam" (So với cách làm cũ) — chủ dự án duyệt content
  // 2026-07-22: không dùng lối viết dựng bảng đối chiếu cách cũ / sản phẩm.
  // Đừng thêm lại nếu chưa hỏi.
  {
    key: "thong_so",
    label: "Thiên thông số kỹ thuật",
    bestFor: "Khách lý trí, đã hiểu nhu cầu, đang so kỹ trước khi chốt.",
    headline: `GỌI THẲNG người đang phân vân chọn mua và mời họ đọc — đừng liệt kê
thông số ở headline, đọc như bảng giá thì không mời được ai. Tối đa 40 ký tự.
✅ "Đang phân vân chọn tẩy ố kính?"  ✅ "Chọn máy ghi âm loại nào?"
❌ "100ml – 2-3 xe – 199.000đ"`,
    skeleton: `Giọng chuyên gia, tiết chế cảm xúc, gần như không dùng tính từ cảm thán.
1. HOOK — 2 dòng:
   Dòng 1: gọi đúng người đang phân vân và mời đọc, kiểu "Bạn nào đang phân vân
   chọn [loại sản phẩm] thì xem ngay bài này." Đây là câu kéo người đọc, KHÔNG
   được thay bằng dãy thông số.
   Dòng 2: mới nêu 2-3 thông số mạnh nhất, ngăn bằng dấu "–".
2. 1 câu nêu bài này dành cho ai đang so sánh kỹ.
3. THÔNG SỐ theo NHÓM (3 nhóm, mỗi nhóm 1 tiêu đề in đậm + 2-3 dòng):
   ví dụ nhóm "Thu âm", "Nguồn & bộ nhớ", "Kích thước & thao tác".
   Mỗi dòng: [thông số] – [nghĩa là gì với người dùng]. Chỉ dùng số liệu có trong dữ liệu sản phẩm, KHÔNG bịa thêm.
4. GIỚI HẠN: 1-2 dòng nói thẳng SP KHÔNG hợp với ai / không làm được gì. Đây là phần tạo uy tín, bắt buộc có.
5. CAM KẾT (chỉ khi SP có; + khuyến mãi nếu có). 6. CTA + {{URL}}.`,
    guard: "Chỉ dùng số liệu có trong USP/dữ liệu sản phẩm được cấp. Thiếu số thì mô tả định tính, TUYỆT ĐỐI không bịa thông số.",
  },
];

export const FORMAT_KEYS = AD_FORMATS.map((f) => f.key);
export const getFormat = (key) => AD_FORMATS.find((f) => f.key === key) || null;

// Băm chuỗi ổn định (FNV-1a 32-bit). Cùng chuỗi → cùng số, ở mọi máy, mọi lần chạy.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str == null ? "" : str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Chọn `count` dạng KHÁC NHAU, có tính lặp lại (deterministic).
 *
 * Cố ý KHÔNG dùng random: cùng một video luôn ra cùng một dạng, nên chạy lại lô
 * cũ không đẻ ra bài lạ, và lỗi tái hiện được. Biến thiên đến từ `rotate` —
 * người gọi truyền số thứ tự video trong lô, nên 10 video liên tiếp ăn 10 dạng
 * khác nhau thay vì cùng một dạng lặp 10 lần.
 *
 * @param {object} o
 * @param {string} o.seed    khoá ổn định (vd mã sản phẩm) — đổi seed thì đổi điểm bắt đầu
 * @param {number} o.rotate  số thứ tự trong lô (0,1,2…) — đẩy cửa sổ chọn đi
 * @param {number} o.count   số dạng cần lấy
 * @param {string[]} o.allowed  giới hạn trong các dạng này (bỏ trống = tất cả)
 */
export function pickFormats({ seed = "", rotate = 0, count = 3, allowed = null } = {}) {
  const pool = (Array.isArray(allowed) && allowed.length
    ? AD_FORMATS.filter((f) => allowed.includes(f.key))
    : AD_FORMATS);
  if (!pool.length) return [];

  const n = Math.max(1, Math.min(Number(count) || 1, pool.length));
  const start = (hashSeed(seed) + (Number(rotate) || 0) * n) % pool.length;
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[(start + i) % pool.length]);
  return out;
}
