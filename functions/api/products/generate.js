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
import { slugify } from "./_wc.js";

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
3. Không dùng emoji. Không thêm chữ ngoài JSON.
4. Bài viết dùng HTML đơn giản: <h2>, <h3>, <p>, <ul><li>, <table>. Mỗi <p> tối đa ~80 từ.
5. Có ít nhất 3 <h2>. Xác định 1 primary keyword tiếng Việt và rải hợp lý ở title, mô tả, h2, đoạn đầu & cuối.

CHÈN ẢNH: bạn sẽ nhận nhiều ảnh (Ảnh #0, #1, ...). Với MỖI ảnh, quyết định:
- 1 ảnh làm ảnh đại diện: role="featured".
- Các ảnh còn lại: gán vào 1 mục bài viết phù hợp NHẤT với nội dung ảnh — dùng after_heading = ĐÚNG chữ trong thẻ <h2> tương ứng, kèm alt (chứa keyword) + caption ngắn mô tả ảnh.
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
  ]
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
  const cacheKey = `prodgen:v1:${site}:${slugify(name)}:${note.length}:${images.length}:${dateVN}`;
  if (!body.regenerate && env.INVENTORY) {
    const hit = await env.INVENTORY.get(cacheKey).catch(() => null);
    if (hit) { try { return json({ ok: true, cached: true, generated: JSON.parse(hit) }); } catch {} }
  }

  // ---- dựng content vision (mảng block: text + image) ----
  const intro =
    `Thương hiệu: ${brand.name} — ${brand.voice}\n` +
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

  try {
    const res = await callClaude(env, {
      model: "haiku",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: content,
      maxTokens: 4000,
      jsonOutput: true,
    });
    const g = res.parsed;
    if (!g || !g.seo_title || !g.long_html) {
      return json({ ok: false, error: "AI không trả đúng cấu trúc bài viết" }, 502);
    }
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
