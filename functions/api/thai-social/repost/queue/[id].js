// GET    /api/thai-social/repost/queue/:id  — xem một bài
// PATCH  /api/thai-social/repost/queue/:id  — sửa caption / hashtag / cách dùng ảnh
// DELETE /api/thai-social/repost/queue/:id  — bỏ bài
//
// Bài đã đưa sang Facebook (đã đăng HOẶC đã hẹn giờ) là bất biến ở đây: sửa bản ghi này
// không đổi được cái đang nằm trên Facebook, chỉ tạo ra hai sự thật khác nhau. Muốn đổi bài
// đã hẹn giờ thì vào Meta Business Suite huỷ lịch, rồi dịch lại từ đầu.

import { ok, fail, requireToken, requireDB, nowSec } from "../../_lib.js";
import { RSTATUS, publicRepost } from "../../_repost-lib.js";

const FROZEN = [RSTATUS.PUBLISHED, RSTATUS.SCHEDULED];

async function load(env, id) {
  return env.DB.prepare(`SELECT * FROM thai_repost_queue WHERE id = ?`).bind(id).first();
}

export async function onRequestGet({ params, env }) {
  const bad = requireDB(env);
  if (bad) return bad;
  const row = await load(env, Number(params.id));
  if (!row) return fail("post_not_found", 404);
  return ok(publicRepost(row));
}

export async function onRequestPatch({ params, request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  const id = Number(params.id);
  const row = await load(env, id);
  if (!row) return fail("post_not_found", 404);
  if (FROZEN.includes(row.status)) {
    return fail(row.status === RSTATUS.PUBLISHED ? "already_published" : "already_scheduled", 409);
  }

  let b;
  try { b = await request.json(); } catch { return fail("invalid_json"); }

  const caption = typeof b.caption_th === "string" ? b.caption_th.trim() : null;
  if (caption !== null && !caption) return fail("empty_caption");
  const hashtags = Array.isArray(b.hashtags)
    ? JSON.stringify(b.hashtags.slice(0, 8).map((t) => String(t).replace(/^#/, ""))) : null;

  /* Sửa ảnh: hai việc người duyệt hay cần khi máy vẽ lại chưa đạt.
       use_original: [idx…]  — quay về ảnh gốc tiếng Việt (bản vẽ lại vẫn còn trong KV)
       remove_image: [idx…]  — bỏ hẳn ảnh khỏi bài */
  let images = null;
  if (Array.isArray(b.use_original) || Array.isArray(b.remove_image)) {
    let list = [];
    try { list = JSON.parse(row.images || "[]"); } catch { list = []; }
    const useOrig = new Set((b.use_original || []).map(Number));
    const remove = new Set((b.remove_image || []).map(Number));
    list = list
      .map((im, i) => (useOrig.has(i)
        ? { ...im, translated: false, note: "Người duyệt chọn giữ ảnh gốc tiếng Việt." }
        : im))
      .filter((_, i) => !remove.has(i));
    images = JSON.stringify(list);
  }

  if (caption === null && hashtags === null && images === null) return fail("nothing_to_update");

  await env.DB.prepare(
    `UPDATE thai_repost_queue
        SET caption_th = COALESCE(?, caption_th),
            hashtags   = COALESCE(?, hashtags),
            images     = COALESCE(?, images),
            status     = ?,
            last_error = NULL,
            updated_at = ?
      WHERE id = ?`
  ).bind(caption, hashtags, images, RSTATUS.EDITED, nowSec(), id).run();

  return ok(publicRepost(await load(env, id)));
}

export async function onRequestDelete({ params, request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  const id = Number(params.id);
  const row = await load(env, id);
  if (!row) return fail("post_not_found", 404);
  if (FROZEN.includes(row.status)) {
    return fail(row.status === RSTATUS.PUBLISHED ? "already_published" : "already_scheduled", 409);
  }

  await env.DB.prepare(`UPDATE thai_repost_queue SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(RSTATUS.DISCARDED, nowSec(), id).run();

  return ok({ id, status: RSTATUS.DISCARDED });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Thai-Token",
    },
  });
}
