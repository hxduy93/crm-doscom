// Prompt viết caption fanpage tiếng Thái.
//
// KHÔNG tái dùng products/_translate.js: file đó cứng cho Việt→Anh và cho sản phẩm
// WooCommerce (long_html, seo_title, primary_keyword). Caption fanpage cần thứ khác hẳn —
// ngắn, có hook, có CTA, emoji tiết chế, tiếng Thái tự nhiên chứ không phải dịch máy.
//
// Chống bịa: mọi công dụng/thông số phải lấy từ khối THÔNG SỐ CHUẨN truyền vào (nguồn là
// hồ sơ 17 SKU). Giá chỉ được nhắc khi truyền vào — thiếu thì bỏ hẳn phần giá.

import { NOMA_BRAND_GUIDE } from "../geo/_utils/noma-brandcore.js";
import { POSTER_LIMITS as LIMITS } from "./_poster.js";

// Deterministic theo red line dự án: model KHÔNG được tự nghĩ emoji.
const EMOJI_ALLOWED = "🧼 💧 ✨ 🚗 🔍 ☔ 📦 ⚡ ✅";

export const ANGLES = {
  combo:    "Combo tiết kiệm — nhấn vào việc mua cặp lợi hơn mua lẻ",
  howto:    "Hướng dẫn dùng tại nhà — các bước ngắn, ai cũng làm được",
  ba:       "Trước / sau khi dùng — nhấn vào thay đổi nhìn thấy được",
  vs_shop:  "So sánh với mang ra tiệm — nhấn vào tiết kiệm tiền và thời gian",
};

export function buildSystemPrompt() {
  return [
    "Bạn là người viết nội dung bán hàng cho fanpage Facebook tại THÁI LAN của thương hiệu NOMA.",
    "",
    "NGÔN NGỮ: viết caption bằng TIẾNG THÁI tự nhiên như người Thái viết, KHÔNG dịch máy từ tiếng Việt.",
    "Dùng đại từ và cách xưng hô đời thường của người bán hàng online Thái.",
    "",
    "ĐỘ DÀI: 60–120 từ. Mở đầu bằng một câu hook chạm đúng vấn đề người dùng gặp.",
    "Xuống dòng thành 3–4 khối ngắn, dễ đọc trên điện thoại. Kết bằng CTA đặt hàng.",
    "",
    `EMOJI: chỉ được dùng trong tập này, tối đa 3 cái cho cả bài: ${EMOJI_ALLOWED}`,
    "KHÔNG tự nghĩ emoji khác. KHÔNG rải emoji mỗi dòng.",
    "",
    "TUYỆT ĐỐI KHÔNG BỊA:",
    "- Mọi công dụng, thành phần, thời gian hiệu lực phải lấy từ khối THÔNG SỐ CHUẨN.",
    "- KHÔNG thêm con số nào (phần trăm, số ngày, số lần) mà khối đó không có.",
    "- Chỉ nhắc giá khi đề bài có dòng GIÁ. Không có thì bỏ hẳn phần giá, đừng viết 'giá rẻ'.",
    "",
    NOMA_BRAND_GUIDE,
    "",
    "CHỮ TRÊN ẢNH — ngắn hơn caption rất nhiều, đọc lướt trên điện thoại là hiểu:",
    `  - poster_title_th: tiêu đề, TỐI ĐA ${LIMITS.title} ký tự. Một ý duy nhất, đúng góc bán hàng.`,
    `  - poster_sub_th: một dòng nội dung đỡ cho tiêu đề, TỐI ĐA ${LIMITS.sub} ký tự.`,
    "  - KHÔNG viết giá, KHÔNG viết lời kêu gọi kiểu 'สั่งเลย'/'ทักแชท' — chỗ đó dành cho caption.",
    "  - KHÔNG nhắc lại tên thương hiệu; nhãn chai trong ảnh đã có sẵn.",
    "",
    "TRẢ VỀ: đúng MỘT object JSON hợp lệ, không markdown, không giải thích, gồm các khoá:",
    '  "caption_th"      — caption tiếng Thái, giữ nguyên ký tự xuống dòng',
    '  "caption_vi"      — dịch NGƯỢC caption đó sang tiếng Việt, sát nghĩa, để người Việt duyệt',
    '  "hashtags"        — mảng 3–6 hashtag tiếng Thái/Anh, không có dấu #',
    '  "poster_title_th" — tiêu đề in TRÊN ẢNH, tiếng Thái',
    '  "poster_sub_th"   — dòng nội dung in TRÊN ẢNH, tiếng Thái',
    '  "poster_title_vi" — dịch tiêu đề trên ảnh sang tiếng Việt',
    '  "poster_sub_vi"   — dịch dòng nội dung trên ảnh sang tiếng Việt',
    '  "scene_prompt"    — NỀN ĐỒ HOẠ cho ảnh, bằng TIẾNG ANH. Tả như designer dựng poster:',
    "                     khối màu, panel, dải màu, hoạ tiết hình học — KHÔNG phải ảnh chụp.",
    "                     Nền SÁNG, chừa nửa trái trống để đặt chữ.",
    "                     KHÔNG chai, KHÔNG chữ, KHÔNG người, KHÔNG xe.",
  ].join("\n");
}

/* caption_vi là bản dịch ngược. Chủ dự án chốt 24/08/2026 là CẦN: người duyệt không đọc
   được tiếng Thái, không có nó thì bước "duyệt" chỉ là bấm nút cho có. Xin luôn trong
   cùng một lượt gọi thay vì gọi lần hai — rẻ hơn và không lệch giữa hai bản. */

export function buildUserPrompt({ mainBlock, mainName, addonBlock, addonName, angle, thbMain, thbAddon }) {
  const lines = [];
  lines.push(`SẢN PHẨM CHÍNH: ${mainName}`);
  lines.push(mainBlock);
  if (addonBlock) {
    lines.push("");
    lines.push(`SẢN PHẨM BÁN KÈM: ${addonName}`);
    lines.push(addonBlock);
    lines.push("Bài phải nhắc CẢ HAI sản phẩm, sản phẩm chính là trọng tâm.");
  } else {
    lines.push("");
    lines.push("Bài chỉ nói về MỘT sản phẩm ở trên.");
  }

  const priceBits = [];
  if (thbMain) priceBits.push(`${mainName}: ${thbMain} บาท`);
  if (addonBlock && thbAddon) priceBits.push(`${addonName}: ${thbAddon} บาท`);
  if (priceBits.length) {
    lines.push("");
    lines.push(`GIÁ (บาท, chỉ dùng đúng con số này): ${priceBits.join(" · ")}`);
  }

  lines.push("");
  lines.push(`GÓC BÁN HÀNG: ${ANGLES[angle] || ANGLES.combo}`);
  lines.push("");
  lines.push("Viết caption theo đúng yêu cầu ở system prompt và trả JSON.");
  return lines.join("\n");
}

/* Dựng prompt ảnh cho Flux. Chỉ dùng khi SKU CHƯA có ảnh thật trong thư viện.
   Cố ý yêu cầu KHÔNG vẽ chữ: Flux viết chữ trên nhãn luôn sai, mà nhãn sai trên fanpage
   thật thì tệ hơn là không có ảnh. */
export function buildImagePrompt(scene) {
  return [
    String(scene || "clean automotive care product scene").trim(),
    "professional product photography, soft studio lighting, clean background,",
    "no text, no letters, no logo, no watermark, no label writing",
  ].join(" ");
}
