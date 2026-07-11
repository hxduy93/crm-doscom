// Dịch nội dung sản phẩm tiếng Việt → tiếng Anh cho nomaauto.us.
// Tách ra module dùng chung cho publish.js (đăng SP mới) + sync-us.js (đồng bộ SP đã có).
import { callClaude } from "../geo/_utils/claude.js";

export const TRANSLATE_SYS = `You are a professional US-English e-commerce copywriter translating Vietnamese WooCommerce product content into natural, fluent, SEO-optimized American English.
RULES:
- Translate the meaning naturally and persuasively (not word-for-word).
- Keep ALL HTML tags and structure in long_html intact; translate only the visible text. In HTML use SINGLE quotes for attributes (href, style, class...) — NEVER double quotes — so the JSON stays valid.
- primary_keyword: a natural 2-4 word English search phrase.
- Return ONLY one valid JSON object, no markdown, escape everything correctly.`;

export async function translateToEN(env, vn) {
  const user = `Translate this product content to English. Return JSON with EXACTLY these keys: name, seo_title, short_description, long_html, meta_description, tags (array of strings), primary_keyword.\n\nVietnamese content (JSON):\n${JSON.stringify(vn)}`;
  const call = () => callClaude(env, { model: "haiku", systemPrompt: TRANSLATE_SYS, userPrompt: user, maxTokens: 8000, jsonOutput: true });
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
    cost_usd: res.cost_usd || 0,
  };
}
