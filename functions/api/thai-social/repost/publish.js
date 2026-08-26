// POST /api/thai-social/repost/publish  { post_id, scheduled_at? }
//
// ĐƯỜNG DUY NHẤT đưa bài dịch lại sang Facebook. Người duyệt bấm một lần:
//   · không có scheduled_at → đăng ngay
//   · có scheduled_at (epoch giây) → giao cho Facebook giữ tới giờ đó
//
// HẸN GIỜ KHÔNG PHẢI LÀ CRM TỰ ĐĂNG. Không có cron nào của mình chờ tới giờ rồi gọi lại
// endpoint này — bài được Facebook xếp lịch ngay trong lời gọi này và nằm ở mục "Bài đã lên
// lịch" của Meta Business Suite. Luật cũ của tính năng vẫn nguyên: mọi bài lên fanpage đều
// do một người bấm nút, và lịch vẫn chạy kể cả khi Pages/Worker chết.
//
// Chỉ đổi status khi Facebook trả về id bài thật — đúng bài học lệch NOMA911_INGEST_TOKEN:
// endpoint trả 200 mà việc không hề xảy ra.

import { ok, fail, requireToken, requireDB, nowSec, tokenStatus } from "../_lib.js";
import { postArticleToPage } from "../_graph.js";
import {
  RSTATUS, RPUBLISHABLE, publicRepost, fullMessage, checkScheduledAt, readImageCache,
} from "../_repost-lib.js";
import { base64ToBytes } from "../_image-translate.js";

export async function onRequestPost({ request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  let b;
  try { b = await request.json(); } catch { return fail("invalid_json"); }

  const id = Number(b.post_id);
  if (!id) return fail("missing_post_id");

  const row = await env.DB.prepare(`SELECT * FROM thai_repost_queue WHERE id = ?`).bind(id).first();
  if (!row) return fail("post_not_found", 404);
  if (row.status === RSTATUS.PUBLISHED) return fail("already_published", 409, { fb_post_id: row.fb_post_id });
  if (row.status === RSTATUS.SCHEDULED) {
    return fail("already_scheduled", 409, { fb_post_id: row.fb_post_id, scheduled_at: row.scheduled_at });
  }
  if (!RPUBLISHABLE.includes(row.status)) return fail("not_publishable", 409, { status: row.status });
  if (!String(row.caption_th || "").trim()) {
    return fail("empty_caption", 400, { detail: "Bài chưa có caption tiếng Thái — viết caption rồi mới đăng." });
  }

  // Giờ hẹn: kiểm TRƯỚC khi tải ảnh lên Facebook. Sai giờ mà đã đẩy ảnh lên là để lại một
  // đống ảnh mồ côi trong thư viện fanpage.
  const now = nowSec();
  let scheduledAt = null;
  if (b.scheduled_at !== undefined && b.scheduled_at !== null && b.scheduled_at !== "") {
    const chk = checkScheduledAt(b.scheduled_at, now);
    if (chk.error) return fail(chk.error, 400, { detail: chk.detail });
    scheduledAt = chk.at;
  }

  const page = await env.DB.prepare(`SELECT * FROM thai_pages WHERE page_id = ?`).bind(row.page_id).first();
  if (!page) return fail("unknown_page", 404);

  const ts = tokenStatus(page, now);
  if (ts !== "ok") {
    const msg = ts === "missing"
      ? `Fanpage "${page.name}" chưa có Page Access Token. Cấp token có quyền pages_manage_posts rồi nhập ở tab Fanpage của menu Đăng fanpage Thái.`
      : `Page Access Token của "${page.name}" đã hết hạn. Cấp lại token dài hạn rồi nhập lại.`;
    await noteError(env, id, msg, now);
    return fail("page_token_" + ts, 409, { detail: msg });
  }

  /* Ảnh gửi lên Facebook:
       · ảnh đã vẽ lại  → gửi BYTES lấy từ KV (bản tiếng Thái, thứ người vừa duyệt)
       · ảnh giữ nguyên → đưa thẳng link scontent của Facebook, chính nó đi lấy được
     Ảnh vẽ lại mà bản trong KV đã hết hạn thì DỪNG, không lặng lẽ đăng bản tiếng Việt —
     đăng nhầm ảnh tiếng Việt lên fanpage Thái là thứ CRM không gỡ lại được. */
  let list = [];
  try { list = JSON.parse(row.images || "[]"); } catch { list = []; }

  const images = [];
  for (let i = 0; i < list.length; i++) {
    const im = list[i] || {};
    if (im.translated && im.kv_key) {
      const cached = await readImageCache(env, im.kv_key);
      if (!cached || !cached.b64) {
        const msg = `Ảnh ${i + 1} đã vẽ lại nhưng bản lưu tạm hết hạn — bấm “Dịch lại” để làm lại ảnh, hoặc chọn “Dùng ảnh gốc” cho tấm này. Chưa đăng gì cả.`;
        await noteError(env, id, msg, now);
        return fail("anh_het_han", 409, { detail: msg, image_index: i });
      }
      images.push({ bytes: base64ToBytes(cached.b64), imageType: cached.mime || "image/png" });
    } else if (im.src) {
      images.push({ imageUrl: im.src });
    }
  }

  let result;
  try {
    result = await postArticleToPage({
      pageId: page.page_id,
      pageToken: page.page_token,
      message: fullMessage(row),
      images,
      scheduledAt,
    });
  } catch (e) {
    // KHÔNG tự retry vòng lặp: rate limit thì retry ngay chỉ làm Facebook siết thêm, còn lỗi
    // token/quyền thì retry bao nhiêu lần cũng vậy. Để người quyết.
    const msg = `Facebook từ chối (${e.kind || "other"}): ${e.message}`;
    await noteError(env, id, msg, now);
    return fail("graph_failed", 502, { kind: e.kind || "other", detail: e.message });
  }

  if (!result || !result.fb_post_id) {
    const msg = "Facebook trả về nhưng KHÔNG có id bài — chưa coi là đã đăng.";
    await noteError(env, id, msg, now);
    return fail("no_post_id", 502, { detail: msg });
  }

  const status = scheduledAt ? RSTATUS.SCHEDULED : RSTATUS.PUBLISHED;
  await env.DB.prepare(
    `UPDATE thai_repost_queue SET status = ?, fb_post_id = ?, scheduled_at = ?,
            last_error = NULL, updated_at = ? WHERE id = ?`
  ).bind(status, result.fb_post_id, scheduledAt, nowSec(), id).run();

  const updated = await env.DB.prepare(`SELECT * FROM thai_repost_queue WHERE id = ?`).bind(id).first();
  return ok({ post: publicRepost(updated), scheduled: !!scheduledAt });
}

async function noteError(env, id, msg, now) {
  await env.DB.prepare(`UPDATE thai_repost_queue SET last_error = ?, updated_at = ? WHERE id = ?`)
    .bind(msg, now, id).run();
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
