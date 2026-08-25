// POST /api/thai-social/generate
//
// Sinh caption tiếng Thái + ảnh cho MỘT cặp sản phẩm do người dùng chọn.
// Tạo bài mới, hoặc sinh lại cho bài đã có (`post_id`).
//
// Body: { page_id, sku_main, sku_addon?, angle?, source?, post_id?, force? }
//
// KHÔNG đăng gì lên Facebook — file này tuyệt đối không import _graph.js.

import { ok, fail, requireToken, requireDB, nowSec, vnDate, clip, publicPost, STATUS } from "./_lib.js";
import { callClaude, extractJson } from "../geo/_utils/claude.js";
import { buildSystemPrompt, buildUserPrompt, ANGLES } from "./_prompt.js";
import { clipPosterText, POSTER_LIMITS } from "./_poster.js";
import { skuBlock, loadSkuImages, THB_PRICES } from "./_skus.js";
import { buildArtwork } from "./_image.js";

const CACHE_VER = "v2";   // v2: thêm chữ trên ảnh + cảnh nền
const CACHE_TTL = 60 * 60 * 20; // 20 giờ — đủ trong ngày, không giữ qua đêm

const cacheKey = (pageId, main, addon, angle, day) =>
  `thai_social:${CACHE_VER}:${pageId}:${main}:${addon || "-"}:${angle}:${day}`;

/* Red line dự án: mode AI tốn tiền PHẢI cache KV. Bấm "Sinh bài" lại trong ngày với cùng
   cặp SKU trả bản đã lưu; muốn bài khác thì force=true. Giống agent-fb-ai. */
async function readCache(env, key, force) {
  if (force || !env.INVENTORY) return null;
  try {
    const raw = await env.INVENTORY.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function writeCache(env, key, val) {
  if (!env.INVENTORY) return;
  try { await env.INVENTORY.put(key, JSON.stringify(val), { expirationTtl: CACHE_TTL }); } catch { /* cache hỏng không làm gãy bài */ }
}

export async function onRequestPost({ request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  let b;
  try { b = await request.json(); } catch { return fail("invalid_json"); }

  const pageId = clip(b.page_id, 40);
  if (!pageId) return fail("missing_page_id");

  const page = await env.DB.prepare(`SELECT * FROM thai_pages WHERE page_id = ?`).bind(pageId).first();
  if (!page) return fail("unknown_page", 404);

  const skuMain = clip(b.sku_main, 20);
  const skuAddon = clip(b.sku_addon, 20) || null;
  if (!skuMain) return fail("missing_sku_main");

  const angle = ANGLES[b.angle] ? b.angle : "combo";

  // Kiểm SKU TRƯỚC khi gọi AI — sai mã thì không được tốn một xu nào.
  const main = await skuBlock(env, skuMain);
  if (!main.known) return fail("unknown_sku", 400, { sku: skuMain });
  let addon = { text: "", known: true, name: "" };
  if (skuAddon) {
    addon = await skuBlock(env, skuAddon);
    if (!addon.known) return fail("unknown_sku", 400, { sku: skuAddon });
  }

  const day = vnDate();
  const key = cacheKey(pageId, skuMain, skuAddon, angle, day);
  let gen = await readCache(env, key, b.force === true);
  let cached = !!gen;
  let costText = 0;

  if (!gen) {
    let res;
    try {
      res = await callClaude(env, {
        model: "haiku",
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt({
          mainBlock: main.text, mainName: main.name,
          addonBlock: addon.text, addonName: addon.name,
          angle,
          thbMain: THB_PRICES[skuMain] || null,
          thbAddon: skuAddon ? (THB_PRICES[skuAddon] || null) : null,
        }),
        maxTokens: 2000,
        jsonOutput: true,
      });
    } catch (e) {
      return fail("ai_failed", 502, { detail: String(e?.message || e) });
    }

    // callClaude(jsonOutput:true) đã parse sẵn vào `parsed`; extractJson là lưới đỡ
    // cho trường hợp model bọc JSON trong fence và bước parse kia trả undefined.
    const parsed = res.parsed || extractJson(res.text || "");
    if (!parsed || !parsed.caption_th) {
      return fail("ai_bad_output", 502, { detail: "Model không trả JSON có caption_th" });
    }
    gen = {
      caption_th: String(parsed.caption_th),
      caption_vi: String(parsed.caption_vi || ""),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 8).map(String) : [],
      // Cắt ở server chứ không tin model tự giữ giới hạn: chữ quá dài làm vỡ bố cục ảnh.
      poster_title_th: clipPosterText(parsed.poster_title_th, POSTER_LIMITS.title),
      poster_sub_th:   clipPosterText(parsed.poster_sub_th,   POSTER_LIMITS.sub),
      poster_title_vi: clipPosterText(parsed.poster_title_vi, POSTER_LIMITS.title * 2),
      poster_sub_vi:   clipPosterText(parsed.poster_sub_vi,   POSTER_LIMITS.sub * 2),
      scene_prompt: String(parsed.scene_prompt || parsed.image_prompt || ""),
      cost_usd: Number(res.cost_usd || 0),
    };
    costText = gen.cost_usd;
    await writeCache(env, key, gen);
  }

  const now0 = nowSec();
  const { images } = await loadSkuImages(env);
  /* seedKey quyết định ảnh nền. Cùng bài + cùng ngày → cùng ảnh, mở lại không đổi.
     Bấm "Ép làm mới" thì kèm giờ phút vào seed để ra tấm khác. */
  const seedKey = b.force === true ? `${pageId}|${day}|${now0}` : `${pageId}|${day}`;
  const img = await buildArtwork(env, { skuMain, images, angle, scene: gen.scene_prompt, seedKey });

  const now = nowSec();
  const source = b.source === "schedule" ? "schedule" : "manual";
  let postId = Number(b.post_id) || 0;

  if (postId) {
    const existing = await env.DB.prepare(`SELECT status FROM thai_post_queue WHERE id = ?`).bind(postId).first();
    if (!existing) return fail("post_not_found", 404);
    if (existing.status === STATUS.PUBLISHED) return fail("already_published", 409);
    await env.DB.prepare(
      `UPDATE thai_post_queue SET sku_main=?, sku_addon=?, angle=?, caption_th=?, caption_vi=?,
              hashtags=?, image_prompt=?, image_url=?, image_base64=?, bg_base64=?, scene_prompt=?,
              poster_title_th=?, poster_sub_th=?, poster_title_vi=?, poster_sub_vi=?,
              status=?, last_error=?, cost_usd = cost_usd + ?, updated_at=? WHERE id=?`
    ).bind(
      skuMain, skuAddon, angle, gen.caption_th, gen.caption_vi,
      JSON.stringify(gen.hashtags), gen.scene_prompt, img.image_url, img.image_base64,
      img.bg_base64, gen.scene_prompt,
      gen.poster_title_th, gen.poster_sub_th, gen.poster_title_vi, gen.poster_sub_vi,
      STATUS.REVIEW, img.image_note || null, costText + img.cost_usd, now, postId
    ).run();
  } else {
    const r = await env.DB.prepare(
      `INSERT INTO thai_post_queue (page_id, vn_date, source, sku_main, sku_addon, angle,
              caption_th, caption_vi, hashtags, image_prompt, image_url, image_base64,
              bg_base64, scene_prompt, poster_title_th, poster_sub_th, poster_title_vi, poster_sub_vi,
              status, last_error, cost_usd, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      pageId, day, source, skuMain, skuAddon, angle,
      gen.caption_th, gen.caption_vi, JSON.stringify(gen.hashtags), gen.scene_prompt,
      img.image_url, img.image_base64,
      img.bg_base64, gen.scene_prompt,
      gen.poster_title_th, gen.poster_sub_th, gen.poster_title_vi, gen.poster_sub_vi,
      STATUS.REVIEW, img.image_note || null, costText + img.cost_usd, now, now
    ).run();
    postId = r.meta && r.meta.last_row_id;
  }

  const row = await env.DB.prepare(`SELECT * FROM thai_post_queue WHERE id = ?`).bind(postId).first();
  return ok({
    post: publicPost(row, { withImage: true }),
    cached,
    image_note: img.image_note || null,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Thai-Token",
    },
  });
}
