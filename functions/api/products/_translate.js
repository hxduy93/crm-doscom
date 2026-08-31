// Dịch nội dung sản phẩm tiếng Việt → tiếng Anh cho nomaauto.us.
// Tách ra module dùng chung cho publish.js (đăng SP mới) + sync-us.js (đồng bộ SP đã có).
import { callClaude } from "../geo/_utils/claude.js";

export const TRANSLATE_SYS = `You are a professional US-English e-commerce copywriter translating Vietnamese WooCommerce product content into natural, fluent, SEO-optimized American English.
RULES:
- Translate the meaning naturally and persuasively (not word-for-word).
- Keep ALL HTML tags and structure in long_html intact; translate only the visible text. In HTML use SINGLE quotes for attributes (href, style, class...) — NEVER double quotes — so the JSON stays valid.
- primary_keyword: a natural 2-4 word English search phrase.
- Return ONLY one valid JSON object, no markdown, escape everything correctly.`;

// opts.kind = "product" (mặc định) | "post" (bài viết blog — dài hơn nên nới maxTokens).
// Với bài viết, long_html có thể chứa src="__NOMA_IMG_0__" (placeholder ảnh) — bắt buộc giữ nguyên,
// vì src thật chỉ được gắn lại SAU khi copy ảnh sang nomaauto.us.
export async function translateToEN(env, vn, opts = {}) {
  const isPost = opts.kind === "post";
  const what = isPost ? "blog article" : "product";
  const keep = isPost
    ? " Keep every src attribute EXACTLY as-is (values like __NOMA_IMG_0__ are image placeholders — never translate, rename or drop them)."
    : "";
  // Biến thể: nhãn thuộc tính ("Dung tích") và các lựa chọn ("Đỏ", "Loại 2 vòi") hiện
  // ngay trên nút chọn hàng của nomaauto.us — để nguyên tiếng Việt là khách Mỹ không hiểu.
  // Chỉ xin thêm 2 key này KHI có biến thể, để sync-us.js (không có biến thể) không đổi hành vi.
  const coBienThe = !!vn.variant_attribute && Array.isArray(vn.variant_options) && vn.variant_options.length;
  const kBienThe = coBienThe
    ? ` Also translate variant_attribute (the option label) and variant_options — return variant_options as an array of the SAME LENGTH and SAME ORDER as the input; keep numbers and units (300ml, 1L, 5kg) unchanged.`
    : "";
  const keysBienThe = coBienThe ? ", variant_attribute, variant_options (array of strings)" : "";
  const user = `Translate this ${what} content to English. Return JSON with EXACTLY these keys: name, seo_title, short_description, long_html, meta_description, tags (array of strings), primary_keyword${keysBienThe}.${keep}${kBienThe}\n\nVietnamese content (JSON):\n${JSON.stringify(vn)}`;
  const maxTokens = Number(opts.maxTokens) || (isPost ? 16000 : 8000);
  const call = () => callClaude(env, { model: "haiku", systemPrompt: TRANSLATE_SYS, userPrompt: user, maxTokens, jsonOutput: true });
  let res;
  try { res = await call(); } catch { res = await call(); }
  const t = res.parsed || {};
  return {
    name: t.name || vn.name,
    seo_title: t.seo_title || vn.seo_title,
    short_description: t.short_description || vn.short_description,
    long_html: t.long_html || vn.long_html,
    meta_description: t.meta_description || vn.meta_description,
    tags: Array.isArray(t.tags) ? t.tags : [],
    primary_keyword: t.primary_keyword || "",
    // Lệch số lượng/thứ tự thì KHÔNG dùng bản dịch: gán nhầm nhãn cho biến thể nghĩa là
    // khách bấm "500ml" nhưng mua phải chai 300ml. Thà để tiếng Việt còn hơn sai hàng.
    variant_attribute: t.variant_attribute || vn.variant_attribute || "",
    variant_options:
      Array.isArray(t.variant_options) && Array.isArray(vn.variant_options)
        && t.variant_options.length === vn.variant_options.length
        && t.variant_options.every((s) => String(s || "").trim())
        ? t.variant_options.map((s) => String(s).trim())
        : (vn.variant_options || []),
    cost_usd: res.cost_usd || 0,
  };
}
