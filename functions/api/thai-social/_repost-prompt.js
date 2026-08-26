// Prompt dịch bài fanpage Việt → Thái, và bộ dò những chỗ NGƯỜI phải tự quyết.
//
// Nguyên tắc lấy từ red line dự án "KHÔNG bịa số liệu": máy dịch CHỮ, không đổi SỐ.
// Giá 299.000đ không được tự thành "฿420" — tỉ giá, giá bán ở Thái, phí ship đều là quyết
// định kinh doanh. Máy giữ nguyên số rồi ĐÁNH DẤU để người sửa; im lặng quy đổi là kiểu sai
// đắt nhất vì bài vẫn trông hoàn chỉnh.

/* LUẬT TÊN THƯƠNG HIỆU — nhắc ở MỌI prompt đụng tới chữ (caption, chữ trên ảnh, vẽ lại ảnh).

   Chủ dự án chốt 26/08/2026: NOMA và Doscom là tên thương hiệu, PHẢI giữ chữ Latin. Model
   dịch rất hay phiên âm thành โนม่า / ดอสคอม vì nghe như từ thường. Nhắc trong prompt là
   chưa đủ — có thêm fixBrandNames() sửa lại bằng tay ở dưới, vì prompt thì model quên được
   còn phép thay chuỗi thì không. */
export const BRAND_RULE =
`TÊN THƯƠNG HIỆU — TUYỆT ĐỐI KHÔNG PHIÊN ÂM:
- "NOMA" phải giữ nguyên chữ NOMA. SAI: โนมา, โนม่า, โนหม่า.
- "Doscom" phải giữ nguyên chữ Doscom. SAI: ดอสคอม, ดอซคอม, โดสคอม.
- Mã sản phẩm (D1, DR1, 911, 350, 680, 120, 230, 998…) giữ nguyên chữ số Latin.
- Kể cả trong hashtag cũng viết Latin: #NOMA #Doscom, không phải #โนม่า.`;

export function buildSystemPrompt() {
  return `Bạn là biên tập viên nội dung mạng xã hội, dịch bài bán hàng của thương hiệu ô tô/chăm sóc xe từ tiếng Việt sang tiếng Thái cho fanpage tại Thái Lan.

NHIỆM VỤ: dịch bài sang tiếng Thái tự nhiên như người Thái viết quảng cáo, KHÔNG dịch từng chữ máy móc.

LUẬT BẮT BUỘC:
1. GIỮ NGUYÊN mọi con số y như bài gốc: giá, phần trăm giảm, dung tích, thời gian bảo hành, số điện thoại. TUYỆT ĐỐI KHÔNG quy đổi tiền tệ, KHÔNG đổi "đ/VNĐ" thành "฿/บาท", KHÔNG làm tròn.
2. KHÔNG thêm thông tin không có trong bài gốc: không thêm ưu đãi, không thêm cam kết, không thêm địa chỉ, không thêm số hotline.
3. Giữ cấu trúc xuống dòng, emoji và thứ tự ý của bài gốc.
4. ${BRAND_RULE}
5. Link, hotline, tên sàn/kênh chỉ có ở Việt Nam thì GIỮ NGUYÊN trong bản dịch và liệt kê vào "canh_bao" để người duyệt tự thay.
6. Hashtag: viết mới bằng tiếng Thái theo đúng chủ đề bài, tối đa 8 cái, không dấu #, không trùng nghĩa nhau.

TRẢ VỀ DUY NHẤT một object JSON, không kèm chữ nào khác:
{
  "caption_th": "bản tiếng Thái đầy đủ, giữ xuống dòng bằng \\n",
  "hashtags": ["..."],
  "canh_bao": ["câu tiếng Việt mô tả từng chỗ người phải tự sửa: giá theo tiền Việt, hotline Việt Nam, link web Việt Nam, ưu đãi chỉ áp dụng ở VN…"]
}`;
}

/* Dịch NGƯỢC về tiếng Việt — gọi RIÊNG một lượt, không gộp vào lượt trên.

   Vì sao tách (sự cố 26/08/2026): bài gốc 1.918 ký tự, bắt model trả một lượt cả bản Thái
   LẪN bản dịch ngược là vượt max_tokens → JSON bị cắt giữa chừng → "AI trả về không đúng
   khuôn", mất trắng cả bài dù bản dịch đã gần xong. Tách ra thì lượt bắt buộc (caption
   tiếng Thái) luôn đủ chỗ, còn bản dịch ngược hỏng thì chỉ mất phần soát, không mất bài. */
export function buildBackSystemPrompt() {
  return `Bạn dịch một bài đăng quảng cáo tiếng Thái sang tiếng Việt, sát nghĩa, để người Việt soát nội dung trước khi đăng.
Giữ nguyên xuống dòng, emoji, con số và mọi tên thương hiệu viết bằng chữ Latin.
Không tóm tắt, không bình luận, không thêm ý.

TRẢ VỀ DUY NHẤT một object JSON: {"caption_vi_back": "bản tiếng Việt"}`;
}

export function buildBackUserPrompt(captionTh) {
  return `Dịch bài tiếng Thái sau sang tiếng Việt:
"""
${String(captionTh || "").slice(0, 8000)}
"""`;
}

/* Trần token cho một lượt dịch. Tiếng Thái tốn token hơn tiếng Việt kha khá, cộng thêm
   hashtag + cảnh báo, nên cứ theo độ dài bài gốc mà nới ra. Con số cũ 3.000 cứng là thứ đã
   làm hỏng bài 1.918 ký tự. */
export function tokenBudget(text, { floor = 2000, ceil = 8000, perChar = 1.6, extra = 900 } = {}) {
  const n = String(text || "").length;
  return Math.min(ceil, Math.max(floor, Math.ceil(n * perChar) + extra));
}

/* ── Sửa lại tên thương hiệu bị phiên âm ─────────────────────────────────────
   Danh sách chữ ĐÚNG NGUYÊN VĂN, không dùng regex thông minh: "ดอทคอม" là "dot com" chứ
   không phải Doscom, bắt nhầm là sửa hỏng bài. Thà sót còn hơn sửa bậy. */
const BRAND_FIX = [
  { latin: "NOMA", wrong: ["โนม่า", "โนมา", "โนหม่า", "โนมะ", "โนม่าร์", "โนม้า"] },
  { latin: "Doscom", wrong: ["ดอสคอม", "ดอซคอม", "โดสคอม", "ดอสคม", "ดอสก้อม", "ด็อสคอม"] },
];

/* Trả { text, fixed: ["NOMA", …] }. `fixed` để đưa vào cảnh báo: model đã phiên âm một chỗ
   thì rất có thể còn phiên âm chỗ khác theo kiểu mình chưa liệt kê. */
export function fixBrandNames(input) {
  let text = String(input == null ? "" : input);
  const fixed = [];
  for (const b of BRAND_FIX) {
    for (const w of b.wrong) {
      if (text.includes(w)) {
        text = text.split(w).join(b.latin);
        if (!fixed.includes(b.latin)) fixed.push(b.latin);
      }
    }
  }
  return { text, fixed };
}

/* Thương hiệu có trong bài gốc mà biến mất khỏi bản dịch → cảnh báo. Bắt được cả kiểu
   phiên âm lạ chưa nằm trong BRAND_FIX, lẫn kiểu model bỏ quên hẳn tên thương hiệu. */
export function brandWarnings(source, out) {
  const src = String(source || "");
  const th = String(out || "");
  const warn = [];
  for (const b of BRAND_FIX) {
    const re = new RegExp(b.latin, "i");
    if (re.test(src) && !re.test(th)) {
      warn.push(`Bài gốc có tên thương hiệu "${b.latin}" nhưng bản tiếng Thái không còn — nhiều khả năng bị phiên âm sang chữ Thái. Soát lại và viết lại cho đúng.`);
    }
  }
  return warn;
}

export function buildUserPrompt({ message, pageName, imageTexts = [] }) {
  const imgBlock = imageTexts.length
    ? `\n\nCHỮ ĐANG NẰM TRÊN ẢNH của bài (đã dịch riêng, chỉ đưa để bạn hiểu ngữ cảnh, ĐỪNG chép vào caption):\n`
      + imageTexts.map((t, i) => `- Ảnh ${i + 1}: ${t}`).join("\n")
    : "";
  return `Fanpage gốc: ${pageName || "(không rõ)"}

NỘI DUNG BÀI GỐC (tiếng Việt), dịch nguyên bài này:
"""
${String(message || "").slice(0, 6000)}
"""${imgBlock}`;
}

/* Dò trước bằng regex những thứ chắc chắn phải người quyết. Chạy ĐỘC LẬP với AI: model có
   thể quên liệt kê, còn cái này thì không. Hai nguồn cộng lại rồi khử trùng. */
const SNIFFERS = [
  { re: /(\d[\d.,]*)\s*(?:đ|vnđ|vnd|k\b|nghìn|triệu)/gi,
    say: (m) => `Giá theo tiền Việt còn nguyên trong bài: "${m.trim()}" — đổi sang baht (฿) hoặc bỏ đi trước khi đăng.` },
  { re: /(?:0|\+84)\d[\d.\s-]{7,12}/g,
    say: (m) => `Số điện thoại Việt Nam "${m.trim()}" — người Thái gọi không được.` },
  { re: /https?:\/\/[^\s)]+/gi,
    say: (m) => `Link "${m.trim()}" — kiểm xem có bản cho thị trường Thái chưa.` },
  { re: /\b(?:shopee|lazada|tiki|sendo)\.vn\b/gi,
    say: (m) => `Kênh bán "${m.trim()}" là sàn Việt Nam.` },
  { re: /\b(?:ship\s*cod|giao hàng toàn quốc|freeship toàn quốc)\b/gi,
    say: (m) => `Cam kết giao hàng "${m.trim()}" áp cho Việt Nam — soát lại chính sách ở Thái.` },
];

export function sniffWarnings(text) {
  const src = String(text || "");
  const out = [];
  for (const s of SNIFFERS) {
    const seen = new Set();
    for (const m of src.matchAll(s.re)) {
      const hit = m[0];
      if (seen.has(hit)) continue;
      seen.add(hit);
      out.push(s.say(hit));
      if (seen.size >= 3) break;   // ba ví dụ là đủ để người hiểu, liệt kê hết chỉ làm rối
    }
  }
  return out;
}

// Gộp cảnh báo của AI và của regex, bỏ trùng, cắt còn 12 dòng cho UI đọc được.
export function mergeWarnings(aiList, sniffList) {
  const out = [];
  const seen = new Set();
  for (const w of [...(sniffList || []), ...(aiList || [])]) {
    const s = String(w || "").trim();
    if (!s) continue;
    const k = s.toLowerCase().slice(0, 60);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s.slice(0, 300));
    if (out.length >= 12) break;
  }
  return out;
}
