// POST /api/products/generate
// Claude vision (qua AI Gateway doscom-erp) đọc ảnh + ghi chú → viết bài sản phẩm WooCommerce.
//
// Body: {
//   site: "doscom" | "noma",
//   name: string, category_name?: string, note?: string,
//   images: [{ data: base64, media_type: "image/jpeg" }],  // ảnh đã downscale ở client
//   regenerate?: bool                                        // true = bỏ cache, viết mới
// }
// Trả: { ok, generated: { specs_read[], seo_title, short_description, long_html, tags[],
//                          meta_description, image_placements[] }, cost_usd }
//
// Chống bịa (red line): AI chỉ dùng thông số có trong ảnh + ghi chú, thiếu thì để trống.
// Cache KV (red line): cùng input trong ngày → không tốn credit; regenerate=true để bỏ qua.
import { callClaude } from "../geo/_utils/claude.js";
import { slugify, SITE_URL, deriveKeyword } from "./_wc.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const BRAND = {
  doscom: {
    name: "Doscom",
    voice: "thiết bị an ninh & giám sát cá nhân/gia đình (camera an ninh, máy dò camera ẩn - nghe lén, máy ghi âm, chống ghi âm, định vị GPS). Giọng tin cậy, nhấn mạnh bảo mật - an toàn - dễ dùng.",
  },
  noma: {
    name: "NOMA",
    voice: "sản phẩm chăm sóc & làm sạch ô tô công nghệ Mỹ, pH trung tính. Giọng thực tế, nhấn mạnh hiệu quả nhanh, an toàn cho xe và người dùng, tự làm tại nhà.",
  },
};

const SYSTEM_PROMPT = `Bạn là chuyên viên viết nội dung sản phẩm cho website WooCommerce tiếng Việt, tối ưu SEO (Rank Math ≥85) và thân thiện người mua.

QUY TẮC TUYỆT ĐỐI:
1. CHỐNG BỊA: chỉ dùng thông số/tính năng CÓ TRONG ẢNH hoặc trong ghi chú người dùng. Thiếu thông tin thì KHÔNG bịa số (dung lượng, pin, kích thước, giá...). Không chắc thì bỏ qua.
2. KHÔNG tự đặt giá bán.
3. Không dùng emoji. Trả về JSON HỢP LỆ DUY NHẤT, không thêm chữ ngoài JSON, không bọc markdown. Escape đúng mọi ký tự.
   ⚠️ TRONG HTML (long_html, short_description) BẮT BUỘC dùng nháy ĐƠN ' cho MỌI thuộc tính (href, style, class, src...). TUYỆT ĐỐI KHÔNG dùng nháy kép " bên trong HTML — vì sẽ làm hỏng JSON. Ví dụ: <a href='https://doscom.vn' style='color:blue'>.
4. Bài viết dùng HTML đơn giản: <h2>, <h3>, <p>, <ul><li>, <table>. Mỗi <p> tối đa ~80 từ.
5. SEO RANK MATH (BẮT BUỘC đủ tiêu chí — nếu thiếu là hỏng):
   - primary_keyword: cụm 2-4 từ tiếng Việt tự nhiên, KHÔNG dùng nguyên tên sản phẩm/model.
   - Keyword PHẢI xuất hiện ở: 40% ĐẦU của seo_title; trong meta_description; CÂU ĐẦU TIÊN của long_html (trong 100 từ đầu); ít nhất 1 thẻ <h2>; và đoạn kết.
   - Mật độ keyword ~1-1.5% (bài ~900 từ → keyword lặp 9-14 lần). Không nhồi quá 2%.
   - Có ít nhất 3 <h2>.
   - long_html PHẢI chứa 1-2 LIÊN KẾT NỘI BỘ dofollow trỏ về website (dùng ĐÚNG URL website được cung cấp) dạng <a href="URL">chữ neo có keyword</a>, VÀ ít nhất 1 liên kết NGOÀI dofollow tới nguồn uy tín.

CHÈN ẢNH: bạn sẽ nhận nhiều ảnh (Ảnh #0, #1, ...). Với MỖI ảnh, quyết định:
- 1 ảnh làm ảnh đại diện: role="featured". Ảnh featured PHẢI có alt CHỨA primary_keyword.
- Các ảnh còn lại: gán vào 1 mục bài viết phù hợp NHẤT với nội dung ảnh — dùng after_heading = ĐÚNG chữ trong thẻ <h2> tương ứng, kèm alt (nên chứa keyword) + caption ngắn mô tả ảnh.
- Ảnh chỉ chứa bảng thông số: đọc lấy số để viết bài, vẫn có thể đặt ở mục thông số.

TRẢ VỀ DUY NHẤT JSON đúng schema:
{
  "primary_keyword": "string",
  "specs_read": ["thông số/điểm đọc được từ ảnh & ghi chú"],
  "seo_title": "50-62 ký tự, chứa keyword",
  "short_description": "1-2 câu, HTML đơn giản, chứa keyword",
  "long_html": "bài viết HTML đầy đủ, >=3 <h2>, KHÔNG tự chèn thẻ <img> (ảnh do hệ thống chèn theo image_placements)",
  "tags": ["3-6 tag"],
  "meta_description": "140-155 ký tự, chứa keyword",
  "image_placements": [
    { "index": 0, "role": "featured", "alt": "...", "caption": "..." },
    { "index": 1, "after_heading": "chữ trong <h2>", "alt": "...", "caption": "..." }
  ],
  "product_shot_index": <index của ẢNH CHỤP sản phẩm rõ nhất (sản phẩm chiếm phần lớn khung, ít/không chữ, nền đơn giản) phù hợp để TÁCH NỀN làm ảnh đại diện nền trắng; trả -1 nếu KHÔNG có ảnh nào phù hợp (vd toàn poster/banner nhiều chữ)>
}`;

export async function onRequestPost({ request, env }) {
  if (env.USE_CLAUDE === "false") {
    return json({ ok: false, error: "AI đang tắt (USE_CLAUDE=false)" }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }

  const site = String(body.site || "").toLowerCase();
  const name = String(body.name || "").trim();
  if (!name) return json({ ok: false, error: "Thiếu tên sản phẩm" }, 400);
  const brand = BRAND[site] || BRAND.doscom;
  const note = String(body.note || "").trim();
  const catName = String(body.category_name || "").trim();
  const images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];

  // ---- cache theo input + ngày VN ----
  const dateVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const cacheKey = `prodgen:v5:${site}:${slugify(name)}:${note.length}:${images.length}:${dateVN}`;
  if (!body.regenerate && env.INVENTORY) {
    const hit = await env.INVENTORY.get(cacheKey).catch(() => null);
    if (hit) { try { return json({ ok: true, cached: true, generated: JSON.parse(hit) }); } catch {} }
  }

  // ---- dựng content vision (mảng block: text + image) ----
  const intro =
    `Thương hiệu: ${brand.name} — ${brand.voice}\n` +
    `Website (dùng cho liên kết nội bộ): ${SITE_URL[site] || ""}\n` +
    `Tên sản phẩm: ${name}\n` +
    (catName ? `Danh mục: ${catName}\n` : "") +
    (note ? `\nGHI CHÚ NGƯỜI DÙNG (nguồn thật, ưu tiên dùng):\n${note}\n` : "") +
    `\nSố ảnh đính kèm: ${images.length}. Đọc kỹ chữ/thông số trong từng ảnh dưới đây.`;

  const content = [{ type: "text", text: intro }];
  images.forEach((im, i) => {
    content.push({ type: "text", text: `Ảnh #${i}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: im.media_type || "image/jpeg", data: String(im.data || "").replace(/^data:[^,]+,/, "") },
    });
  });
  content.push({ type: "text", text: "Hãy trả về JSON đúng schema ở trên. Không thêm chữ nào ngoài JSON." });

  const callOnce = () => callClaude(env, {
    model: "haiku",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: content,
    maxTokens: 8000,
    jsonOutput: true,
  });

  try {
    // Thử 2 lần: lỗi parse JSON thường ngẫu nhiên (HTML lệch dấu ngoặc), lần 2 hay qua.
    let res;
    try { res = await callOnce(); }
    catch (e1) { res = await callOnce(); }

    const g = res.parsed;
    if (!g || !g.seo_title || !g.long_html) {
      return json({ ok: false, error: "AI không trả đúng cấu trúc bài viết" }, 502);
    }
    g.primary_keyword = String(g.primary_keyword || "").trim() || deriveKeyword(name);
    g.tags = Array.isArray(g.tags) ? g.tags : [];
    g.specs_read = Array.isArray(g.specs_read) ? g.specs_read : [];
    g.image_placements = Array.isArray(g.image_placements) ? g.image_placements : [];
    if (env.INVENTORY) {
      await env.INVENTORY.put(cacheKey, JSON.stringify(g), { expirationTtl: 7 * 86400 }).catch(() => {});
    }
    return json({ ok: true, generated: g, cost_usd: res.cost_usd });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}
