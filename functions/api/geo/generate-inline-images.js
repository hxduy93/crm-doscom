// Endpoint: POST /api/geo/generate-inline-images
//
// Sinh 4 ảnh inline cho 1 article (768x432) — chèn vào body bài viết phía dưới mỗi H2.
// Lấy prompt từ field `inline_images_meta` (JSON Claude xuất khi sinh content).
// Nếu meta chưa có (bài cũ trước Phase 6), tự sinh prompt từ heading + image_prompt gốc.
//
// Body: {
//   article_id: "uuid",
//   count: 4,                  // default 4, max 4
//   width: 768,                // default 768
//   height: 432,               // default 432 (16:9 ratio)
//   steps: 4,                  // default 4
//   force_regen: false         // true = xoá inline cũ và gen lại
// }

import { estimateNeurons, logAIUsage } from "./_utils/ai-usage.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const GATEWAY_ID = "doscom-erp";

async function generateFluxImage(env, { prompt, steps, width, height }) {
  if (!env.AI) throw new Error("Workers AI binding 'AI' missing");
  const inputs = { prompt, steps };
  if (width)  inputs.width  = width;
  if (height) inputs.height = height;
  const response = await env.AI.run(MODEL, inputs, { gateway: { id: GATEWAY_ID } });
  if (!response?.image) throw new Error("Flux returned empty response");
  return response.image;  // base64 PNG
}

function uuid() {
  return crypto.randomUUID();
}

// Fallback: nếu article không có inline_images_meta, parse content_markdown lấy H2
// và build prompt từ heading + image_prompt gốc của article.
function buildFallbackMeta(article, count) {
  const md = article.content_markdown || "";
  // Lấy H2 (không lấy H1, không lấy H3+) — skip H2 cuối nếu là FAQ/Kết luận
  const h2Matches = [...md.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim());
  const usefulH2 = h2Matches.filter(h =>
    !/FAQ|Câu hỏi|Kết luận|Conclusion|Tổng kết/i.test(h)
  );
  const chosen = usefulH2.slice(0, count);
  const basePrompt = article.image_prompt || "professional blog hero image, realistic photography";

  return chosen.map((heading, i) => ({
    position: i,
    after_heading: heading,
    prompt_en: `${basePrompt}. Topic focus: ${heading}. Cinematic composition, brand-safe, no text in image, no clearly visible faces.`,
    alt_vi: heading.slice(0, 120),
  }));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ error: "D1 binding 'DB' missing" }, 500);
  if (!env.AI) return jsonResponse({ error: "Workers AI binding 'AI' missing" }, 500);

  let body = {};
  try { body = await request.json(); } catch {}

  const articleId = body.article_id;
  if (!articleId) return jsonResponse({ error: "Missing article_id" }, 400);

  const count       = Math.min(Math.max(parseInt(body.count) || 4, 1), 4);
  const width       = Math.min(Math.max(parseInt(body.width)  || 768, 256), 2048);
  const height      = Math.min(Math.max(parseInt(body.height) || 432, 256), 2048);
  const steps       = Math.min(Math.max(parseInt(body.steps)  || 4,   1),   8);
  const forceRegen  = body.force_regen === true;

  // Load article
  const article = await env.DB.prepare(
    `SELECT id, title, content_markdown, image_prompt, inline_images_meta, status FROM geo_content_queue WHERE id = ?`
  ).bind(articleId).first();

  if (!article) return jsonResponse({ error: `Article ${articleId} not found` }, 404);

  // Resolve metadata (từ Claude output hoặc fallback)
  let metaList = [];
  if (article.inline_images_meta) {
    try { metaList = JSON.parse(article.inline_images_meta); } catch {}
  }
  if (!Array.isArray(metaList) || metaList.length === 0) {
    metaList = buildFallbackMeta(article, count);
  }
  metaList = metaList.slice(0, count);

  if (metaList.length === 0) {
    return jsonResponse({
      error: "Không xác định được vị trí inline. Bài chưa có content_markdown hoặc H2.",
    }, 400);
  }

  // Xoá inline cũ nếu force_regen
  if (forceRegen) {
    await env.DB.prepare(`DELETE FROM geo_inline_images WHERE article_id = ?`).bind(articleId).run();
  } else {
    // Bỏ qua positions đã có ảnh
    const { results: existing } = await env.DB.prepare(
      `SELECT position FROM geo_inline_images WHERE article_id = ?`
    ).bind(articleId).all();
    const usedPositions = new Set((existing || []).map(r => r.position));
    metaList = metaList.filter(m => !usedPositions.has(m.position));
  }

  if (metaList.length === 0) {
    return jsonResponse({
      message: "Đã có đủ inline images. Dùng force_regen=true để gen lại.",
      article_id: articleId,
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const neuronsPerImage = estimateNeurons({ width, height, steps });
  const results = [];
  const errors = [];

  for (const meta of metaList) {
    try {
      const safePrompt = `${meta.prompt_en}\n\nPhotography style, professional, clean composition, NO TEXT in image, NO clearly visible faces, brand-safe, high detail, magazine quality.`;
      const b64 = await generateFluxImage(env, {
        prompt: safePrompt.slice(0, 2000),
        steps,
        width,
        height,
      });

      const usage = await logAIUsage(env, { neurons: neuronsPerImage, isImage: true });
      const cost = usage.over_free_tier ? Number(((neuronsPerImage / 1000) * 0.011).toFixed(6)) : 0;
      const id = uuid();

      await env.DB.prepare(`
        INSERT INTO geo_inline_images (
          id, article_id, position, after_heading, prompt, alt,
          image_base64, width, height, steps, provider,
          neurons_used, cost_usd, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'flux-schnell', ?, ?, ?)
      `).bind(
        id, articleId, meta.position, meta.after_heading || null,
        (meta.prompt_en || "").slice(0, 1000),
        (meta.alt_vi || meta.after_heading || "").slice(0, 250),
        b64, width, height, steps,
        neuronsPerImage, cost, now
      ).run();

      results.push({
        id, position: meta.position, after_heading: meta.after_heading,
        alt: meta.alt_vi, neurons: neuronsPerImage, cost_usd: cost,
      });
    } catch (err) {
      errors.push({ position: meta.position, error: String(err?.message || err).slice(0, 300) });
    }
  }

  // Update cost_image trên article
  const totalCost = results.reduce((s, r) => s + r.cost_usd, 0);
  if (totalCost > 0) {
    await env.DB.prepare(
      `UPDATE geo_content_queue SET cost_image_usd = COALESCE(cost_image_usd, 0) + ?, cost_total_usd = COALESCE(cost_total_usd, 0) + ? WHERE id = ?`
    ).bind(totalCost, totalCost, articleId).run();
  }

  return jsonResponse({
    article_id: articleId,
    generated: results.length,
    failed: errors.length,
    results,
    errors,
    total_neurons: results.length * neuronsPerImage,
    total_cost_usd: totalCost,
  }, errors.length && !results.length ? 500 : 200);
}
