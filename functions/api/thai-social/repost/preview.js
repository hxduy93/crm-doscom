// POST /api/thai-social/repost/preview
//
// Nhận LINK một bài đã đăng trên fanpage Việt → đọc bài gốc → dịch chữ + chữ trên ảnh sang
// tiếng Thái → xếp vào hàng chờ duyệt của fanpage Thái đã chọn.
//
// Body: { url, page_id, image_mode?, post_id?, src_page_id?, force? }
//   image_mode: "auto" (mặc định, chỉ vẽ lại ảnh CÓ chữ) | "keep" (giữ nguyên mọi ảnh)
//               | "text_only" (chỉ đọc & dịch chữ trên ảnh để người tự thiết kế lại)
//
// KHÔNG đăng gì lên Facebook — file này tuyệt đối không import _graph.js.

import { ok, fail, requireToken, requireDB, nowSec, vnDate, clip } from "../_lib.js";
import { callClaude, extractJson } from "../../geo/_utils/claude.js";
import { fetchSourcePost, downloadImage } from "../_fb-source.js";
import { buildSystemPrompt, buildUserPrompt, sniffWarnings, mergeWarnings } from "../_repost-prompt.js";
import { readImageText, redrawImageInThai, bytesToBase64 } from "../_image-translate.js";
import { RSTATUS, publicRepost, imageKey, readImageCache, writeImageCache } from "../_repost-lib.js";

const MODES = ["auto", "keep", "text_only"];
const CACHE_VER = "v1";
const TEXT_TTL = 60 * 60 * 20;    // 20 giờ, giống bước sinh bài theo SKU

/* Trần số ảnh ĐEM ĐI VẼ LẠI. Mỗi tấm ~$0,03–0,05 và mất 20–40 giây; một bài album 10 ảnh
   sẽ vừa hết tiền vừa chạm giới hạn thời gian của Pages Functions. Ảnh thứ 5 trở đi giữ
   nguyên bản gốc và NÓI RÕ trong ghi chú — không im lặng bỏ qua. */
const MAX_REDRAW = 4;

const cacheKey = (srcPostId, day) => `thai_repost:txt:${CACHE_VER}:${srcPostId}:${day}`;

export async function onRequestPost({ request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  let b;
  try { b = await request.json(); } catch { return fail("invalid_json"); }

  const pageId = clip(b.page_id, 40);
  if (!pageId) return fail("missing_page_id");
  const page = await env.DB.prepare(`SELECT * FROM thai_pages WHERE page_id = ?`).bind(pageId).first();
  if (!page) return fail("unknown_page", 404);

  const url = clip(b.url, 800);
  if (!url) return fail("missing_url");

  const mode = MODES.includes(b.image_mode) ? b.image_mode : "auto";
  const force = b.force === true;
  const postId0 = Number(b.post_id) || 0;

  // 1. Đọc bài gốc TRƯỚC khi gọi bất kỳ AI nào — link sai thì không được tốn một xu.
  let src;
  try {
    src = await fetchSourcePost(env, { url, srcPageId: clip(b.src_page_id, 40) || null });
  } catch (e) {
    return fail("khong_doc_duoc_bai_goc", e.kind === "no_token" ? 500 : 400,
                { kind: e.kind || "graph", detail: String(e.message || e) });
  }
  if (!src.message && !src.images.length) {
    return fail("bai_goc_rong", 400, { detail: "Bài gốc không có chữ lẫn ảnh nào để dịch." });
  }

  // 2. Đã dịch bài này cho đúng fanpage đó rồi thì đừng lặng lẽ tạo bản thứ hai — đăng trùng
  //    lên fanpage thật là thứ CRM không hoàn tác được.
  if (!postId0 && !force) {
    const dup = await env.DB.prepare(
      `SELECT * FROM thai_repost_queue WHERE src_post_id = ? AND page_id = ? AND status != ?
        ORDER BY id DESC LIMIT 1`
    ).bind(src.post_id, pageId, RSTATUS.DISCARDED).first();
    if (dup) {
      return ok({ post: publicRepost(dup), duplicate: true, source: publicSource(src),
                  note: "Bài gốc này đã được dịch cho fanpage đó rồi. Mở bản cũ để sửa, hoặc bấm “Dịch lại” nếu muốn bản mới." });
    }
  }

  const day = vnDate();
  let cost = 0;

  // 3. Ảnh: đọc chữ, và vẽ lại nếu có chữ. Làm TRƯỚC phần caption để đưa được ngữ cảnh
  //    chữ-trên-ảnh vào prompt dịch caption.
  const images = [];
  let redrawn = 0;
  for (const srcUrl of src.images) {
    const item = { src: srcUrl, has_text: false, translated: false, text_vi: "", text_th: "", note: null, kv_key: null };

    if (mode === "keep") {
      item.note = "Giữ nguyên ảnh gốc theo lựa chọn của người dùng.";
      images.push(item);
      continue;
    }

    const key = imageKey(srcUrl);
    const cached = force ? null : await readImageCache(env, key);
    if (cached) {
      item.has_text = !!cached.has_text;
      item.text_vi = cached.text_vi || "";
      item.text_th = cached.text_th || "";
      item.translated = !!(cached.b64 && mode !== "text_only");
      item.kv_key = item.translated ? key : null;
      item.note = item.translated
        ? "Ảnh đã vẽ lại (dùng lại bản đã lưu, không tốn thêm tiền AI). Soi kỹ chữ Thái và nhãn sản phẩm."
        : (cached.has_text ? "Ảnh có chữ, chưa vẽ lại." : "Ảnh không có chữ thiết kế — giữ nguyên bản gốc.");
      images.push(item);
      continue;
    }

    const dl = await downloadImage(srcUrl);
    if (!dl) {
      item.note = "Không tải được ảnh gốc từ Facebook — bài sẽ đăng bằng chính link ảnh này, kiểm lại trước khi đăng.";
      images.push(item);
      continue;
    }

    const b64 = bytesToBase64(dl.bytes);
    let vision = null;
    try {
      vision = await readImageText(env, { b64, mime: dl.type });
      cost += vision.cost_usd || 0;
    } catch (e) {
      item.note = `Không đọc được chữ trên ảnh (${String(e.message || e).slice(0, 120)}) — giữ nguyên ảnh gốc.`;
      images.push(item);
      continue;
    }

    item.has_text = vision.has_text;
    item.text_vi = vision.text_vi;
    item.text_th = vision.text_th;

    if (!vision.has_text) {
      item.note = vision.unreadable
        ? "Không đọc rõ chữ trên ảnh — giữ nguyên bản gốc cho an toàn."
        : "Ảnh không có chữ thiết kế — giữ nguyên bản gốc.";
      await writeImageCache(env, key, { has_text: false, text_vi: "", text_th: "" });
      images.push(item);
      continue;
    }

    if (mode === "text_only") {
      item.note = "Đã dịch chữ trên ảnh nhưng KHÔNG vẽ lại — đưa bản dịch cho thiết kế làm ảnh mới.";
      await writeImageCache(env, key, { has_text: true, text_vi: vision.text_vi, text_th: vision.text_th });
      images.push(item);
      continue;
    }

    if (redrawn >= MAX_REDRAW) {
      item.note = `Bài có nhiều ảnh có chữ; hệ thống chỉ vẽ lại ${MAX_REDRAW} tấm đầu. Tấm này giữ nguyên bản Việt — bỏ bớt ảnh hoặc tự làm lại tấm này.`;
      images.push(item);
      continue;
    }

    try {
      const drawn = await redrawImageInThai(env, { bytes: dl.bytes, mime: dl.type, blocks: vision.blocks });
      cost += drawn.cost_usd || 0;
      redrawn++;
      const saved = await writeImageCache(env, key, {
        has_text: true, text_vi: vision.text_vi, text_th: vision.text_th,
        b64: drawn.b64, mime: "image/png", model: drawn.model,
      });
      if (saved) {
        item.translated = true;
        item.kv_key = key;
        item.note = "Ảnh đã được VẼ LẠI bằng tiếng Thái — máy vẽ nên phải soi kỹ chữ và nhãn sản phẩm trước khi đăng.";
      } else {
        item.note = "Vẽ lại được ảnh nhưng KHÔNG lưu được (thiếu KV INVENTORY) — bài đang dùng ảnh gốc tiếng Việt.";
      }
    } catch (e) {
      item.note = `Không vẽ lại được ảnh (${String(e.message || e).slice(0, 140)}) — giữ nguyên ảnh gốc tiếng Việt.`;
    }
    images.push(item);
  }

  // 4. Caption. Cache theo bài gốc + ngày VN (red line: mode AI tốn tiền phải cache KV).
  //    Tên khác `key` của vòng lặp ảnh phía trên — hai thứ khác nhau, đặt trùng tên là mời
  //    người sau sửa nhầm.
  const textKey = cacheKey(src.post_id, day);
  let gen = null;
  if (!force && env.INVENTORY) {
    try {
      const raw = await env.INVENTORY.get(textKey);
      gen = raw ? JSON.parse(raw) : null;
    } catch { gen = null; }
  }
  const cachedText = !!gen;

  if (!gen) {
    if (!src.message) {
      // Bài chỉ có ảnh: không bịa caption. Để trống, người tự viết.
      gen = { caption_th: "", caption_vi_back: "", hashtags: [], canh_bao: ["Bài gốc không có phần chữ — tự viết caption tiếng Thái trước khi đăng."] };
    } else {
      let res;
      try {
        res = await callClaude(env, {
          model: "haiku",
          systemPrompt: buildSystemPrompt(),
          userPrompt: buildUserPrompt({
            message: src.message,
            pageName: src.page_name,
            imageTexts: images.filter((i) => i.text_th).map((i) => `${i.text_vi} → ${i.text_th}`),
          }),
          maxTokens: 3000,
          jsonOutput: true,
        });
      } catch (e) {
        return fail("ai_failed", 502, { detail: String(e?.message || e) });
      }
      const parsed = res.parsed || safeExtract(res.text);
      if (!parsed || !parsed.caption_th) {
        return fail("ai_bad_output", 502, { detail: "Model không trả JSON có caption_th" });
      }
      gen = {
        caption_th: String(parsed.caption_th).trim(),
        caption_vi_back: String(parsed.caption_vi_back || "").trim(),
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 8).map((t) => String(t).replace(/^#/, "")) : [],
        canh_bao: Array.isArray(parsed.canh_bao) ? parsed.canh_bao.map(String) : [],
        cost_usd: Number(res.cost_usd || 0),
      };
      cost += gen.cost_usd || 0;
      if (env.INVENTORY) {
        try { await env.INVENTORY.put(textKey, JSON.stringify(gen), { expirationTtl: TEXT_TTL }); } catch {}
      }
    }
  }

  const warnings = mergeWarnings(gen.canh_bao, sniffWarnings(src.message));

  // 5. Ghi vào hàng chờ.
  const now = nowSec();
  const cols = [
    pageId, day, url, src.post_id, src.page_id, src.page_name,
    src.message, gen.caption_th, gen.caption_vi_back,
    JSON.stringify(gen.hashtags || []), JSON.stringify(warnings),
    JSON.stringify(images), mode,
  ];

  let id = postId0;
  if (id) {
    const existing = await env.DB.prepare(`SELECT status FROM thai_repost_queue WHERE id = ?`).bind(id).first();
    if (!existing) return fail("post_not_found", 404);
    if (existing.status === RSTATUS.PUBLISHED) return fail("already_published", 409);
    if (existing.status === RSTATUS.SCHEDULED) return fail("already_scheduled", 409);
    await env.DB.prepare(
      `UPDATE thai_repost_queue SET page_id=?, vn_date=?, src_url=?, src_post_id=?, src_page_id=?,
              src_page_name=?, caption_vi=?, caption_th=?, caption_vi_back=?, hashtags=?, warnings=?,
              images=?, image_mode=?, status=?, last_error=NULL, cost_usd = cost_usd + ?, updated_at=?
        WHERE id=?`
    ).bind(...cols, RSTATUS.REVIEW, Number(cost.toFixed(6)), now, id).run();
  } else {
    const r = await env.DB.prepare(
      `INSERT INTO thai_repost_queue (page_id, vn_date, src_url, src_post_id, src_page_id,
              src_page_name, caption_vi, caption_th, caption_vi_back, hashtags, warnings,
              images, image_mode, status, cost_usd, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(...cols, RSTATUS.REVIEW, Number(cost.toFixed(6)), now, now).run();
    id = r.meta && r.meta.last_row_id;
  }

  const row = await env.DB.prepare(`SELECT * FROM thai_repost_queue WHERE id = ?`).bind(id).first();
  return ok({
    post: publicRepost(row),
    source: publicSource(src),
    cached_text: cachedText,
    cost_usd: Number(cost.toFixed(6)),
  });
}

function publicSource(src) {
  return {
    post_id: src.post_id, page_id: src.page_id, page_name: src.page_name,
    permalink: src.permalink, created_time: src.created_time, image_count: src.images.length,
  };
}

function safeExtract(text) {
  try { return extractJson(text || ""); } catch { return null; }
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
