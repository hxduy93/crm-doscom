// Helper THUẦN (không mạng) cho menu "Sửa ảnh hỏng" — tách riêng để unit test được.
//
// Bối cảnh: noma.vn đã nạp lại thư viện media (ảnh chuyển sang /uploads/2026/03/…) nhưng mô tả
// sản phẩm còn trỏ đường dẫn cũ (/uploads/2025/10|11|12/…) → ảnh 404, bài viết mất ảnh.
// Cách sửa: dò ảnh chết trong mô tả → tìm file CÙNG TÊN còn sống trong thư viện → thay chuỗi URL.
//
// Nguyên tắc an toàn (giống applyFixes của brandcore): CHỈ thay chuỗi URL nguyên văn,
// KHÔNG viết lại HTML → không dời ảnh, không mất thẻ, không đụng chữ.

// Lấy mọi URL ảnh trong HTML (src / data-src / href tới file ảnh / srcset).
export function extractImageUrls(html) {
  const out = [];
  const re = /(?:src|data-src|data-lazy-src|href)\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) {
    const u = m[1];
    if (/^https?:\/\//i.test(u) && /\.(webp|jpe?g|png|gif)(\?|$)/i.test(u)) out.push(u);
  }
  // srcset: "url1 600w, url2 1024w"
  const rs = /srcset\s*=\s*"([^"]+)"/gi;
  while ((m = rs.exec(String(html || ""))) !== null) {
    for (const part of m[1].split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (/^https?:\/\//i.test(u) && /\.(webp|jpe?g|png|gif)$/i.test(u)) out.push(u);
    }
  }
  return [...new Set(out)];
}

// Tên file (không đuôi, bỏ hậu tố kích thước -600x600) — dùng để đối chiếu 2 thư viện media.
export function mediaStem(url) {
  const file = String(url || "").split("?")[0].split("/").pop() || "";
  return file
    .replace(/\.(webp|jpe?g|png|gif)$/i, "")
    .replace(/-\d+x\d+$/, "")
    .toLowerCase();
}

// Chọn ảnh thay thế cho 1 URL chết, dò trong index media còn sống (Map: stem → url).
// CHỈ nhận 2 kiểu khớp CHẮC CHẮN (không đoán mò, không fuzzy — đoán sai = chèn nhầm ảnh):
//   - "exact"  : trùng y hệt tên file (khác mỗi thư mục/tháng).
//   - "suffix" : trùng tên + hậu tố "-1" do WordPress tự thêm khi trùng tên lúc upload lại.
// Không khớp → { match: "none" } → tool BỎ QUA ảnh đó và báo lại để người dùng tự up.
export function pickReplacement(deadUrl, index) {
  const s = mediaStem(deadUrl);
  if (!s) return { match: "none", url: null };
  const exact = index.get(s);
  if (exact) return { match: "exact", url: exact };
  for (let i = 1; i <= 3; i++) {
    const dedupe = index.get(`${s}-${i}`);
    if (dedupe) return { match: "suffix", url: dedupe };
  }
  return { match: "none", url: null };
}

// Dựng index stem → source_url từ danh sách media WP. Ảnh gốc (không có -WxH) được ưu tiên;
// mục xuất hiện trước (media mới nhất) thắng để không lấy nhầm bản cũ trùng tên.
export function buildMediaIndex(items) {
  const idx = new Map();
  for (const it of items || []) {
    const u = it && (it.source_url || it.url);
    if (!u) continue;
    const s = mediaStem(u);
    if (s && !idx.has(s)) idx.set(s, u);
  }
  return idx;
}

// Thay các URL ảnh chết trong HTML. `pairs` = [{ from, to }] — thay CHUỖI NGUYÊN VĂN.
// Trả { html, replaced: [from...] }. Cặp nào không tìm thấy chuỗi gốc → bỏ qua (an toàn).
export function replaceImageUrls(html, pairs) {
  let out = String(html || "");
  const replaced = [];
  for (const p of pairs || []) {
    const from = p && p.from;
    const to = p && p.to;
    if (!from || !to || from === to) continue;
    if (out.includes(from)) {
      out = out.split(from).join(to);
      replaced.push(from);
    }
  }
  return { html: out, replaced };
}
