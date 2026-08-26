// Prompt dịch bài fanpage Việt → Thái, và bộ dò những chỗ NGƯỜI phải tự quyết.
//
// Nguyên tắc lấy từ red line dự án "KHÔNG bịa số liệu": máy dịch CHỮ, không đổi SỐ.
// Giá 299.000đ không được tự thành "฿420" — tỉ giá, giá bán ở Thái, phí ship đều là quyết
// định kinh doanh. Máy giữ nguyên số rồi ĐÁNH DẤU để người sửa; im lặng quy đổi là kiểu sai
// đắt nhất vì bài vẫn trông hoàn chỉnh.

export function buildSystemPrompt() {
  return `Bạn là biên tập viên nội dung mạng xã hội, dịch bài bán hàng của thương hiệu ô tô/chăm sóc xe từ tiếng Việt sang tiếng Thái cho fanpage tại Thái Lan.

NHIỆM VỤ: dịch bài sang tiếng Thái tự nhiên như người Thái viết quảng cáo, KHÔNG dịch từng chữ máy móc.

LUẬT BẮT BUỘC:
1. GIỮ NGUYÊN mọi con số y như bài gốc: giá, phần trăm giảm, dung tích, thời gian bảo hành, số điện thoại. TUYỆT ĐỐI KHÔNG quy đổi tiền tệ, KHÔNG đổi "đ/VNĐ" thành "฿/บาท", KHÔNG làm tròn.
2. KHÔNG thêm thông tin không có trong bài gốc: không thêm ưu đãi, không thêm cam kết, không thêm địa chỉ, không thêm số hotline.
3. Giữ cấu trúc xuống dòng, emoji và thứ tự ý của bài gốc.
4. Tên thương hiệu và mã sản phẩm (NOMA, Doscom, D1, DR1, 911, 350…) giữ nguyên chữ Latin, không phiên âm sang tiếng Thái.
5. Link, hotline, tên sàn/kênh chỉ có ở Việt Nam thì GIỮ NGUYÊN trong bản dịch và liệt kê vào "canh_bao" để người duyệt tự thay.
6. Hashtag: viết mới bằng tiếng Thái theo đúng chủ đề bài, tối đa 8 cái, không dấu #, không trùng nghĩa nhau.

TRẢ VỀ DUY NHẤT một object JSON, không kèm chữ nào khác:
{
  "caption_th": "bản tiếng Thái đầy đủ, giữ xuống dòng bằng \\n",
  "caption_vi_back": "dịch NGƯỢC bản tiếng Thái ở trên về tiếng Việt, sát nghĩa, để người Việt soát",
  "hashtags": ["..."],
  "canh_bao": ["câu tiếng Việt mô tả từng chỗ người phải tự sửa: giá theo tiền Việt, hotline Việt Nam, link web Việt Nam, ưu đãi chỉ áp dụng ở VN…"]
}`;
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
