// GET    /api/thai-social/queue/:id  — xem một bài (kèm ảnh base64 để xem trước)
// PATCH  /api/thai-social/queue/:id  — sửa caption / hashtag → status `edited`
// DELETE /api/thai-social/queue/:id  — bỏ bài → status `discarded`
//
// Bài đã `published` là bất biến: sửa hay bỏ đều từ chối. Trên Facebook nó đã ra ngoài rồi,
// sửa bản ghi ở đây chỉ tạo ra hai sự thật khác nhau.

import { ok, fail, requireToken, requireDB, nowSec, publicPost, STATUS } from "../_lib.js";
import { clipPosterText, POSTER_LIMITS } from "../_poster.js";

async function load(env, id) {
  return env.DB.prepare(`SELECT * FROM thai_post_queue WHERE id = ?`).bind(id).first();
}

export async function onRequestGet({ params, env }) {
  const bad = requireDB(env);
  if (bad) return bad;
  const row = await load(env, Number(params.id));
  if (!row) return fail("post_not_found", 404);
  return ok(publicPost(row, { withImage: true }));
}

export async function onRequestPatch({ params, request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  const id = Number(params.id);
  const row = await load(env, id);
  if (!row) return fail("post_not_found", 404);
  if (row.status === STATUS.PUBLISHED) return fail("already_published", 409);

  let b;
  try { b = await request.json(); } catch { return fail("invalid_json"); }

  const caption = typeof b.caption_th === "string" ? b.caption_th.trim() : null;
  if (caption !== null && !caption) return fail("empty_caption");

  const hashtags = Array.isArray(b.hashtags) ? JSON.stringify(b.hashtags.slice(0, 8).map(String)) : null;
  const captionVi = typeof b.caption_vi === "string" ? b.caption_vi.trim() : null;

  /* Ảnh ghép hoàn chỉnh do TRÌNH DUYỆT dựng (nền Flux + sản phẩm thật + chữ Thái) rồi lưu
     ngược về đây. Đây mới là tấm thật sự được đăng. Nhận base64 trần, không nhận data URL. */
  const poster = typeof b.image_base64 === "string" && b.image_base64.length > 500
    ? b.image_base64.replace(/^data:image\/\w+;base64,/, "")
    : null;
  const pTitleTh = typeof b.poster_title_th === "string" ? clipPosterText(b.poster_title_th, POSTER_LIMITS.title) : null;
  const pSubTh   = typeof b.poster_sub_th   === "string" ? clipPosterText(b.poster_sub_th,   POSTER_LIMITS.sub)   : null;

  /* Lưu ảnh ghép KHÔNG được coi là "người đã sửa bài": trình duyệt tự dựng ảnh ngay khi
     mở thẻ, nếu đổi status thì mọi bài vừa mở đã thành "đã duyệt" mà chưa ai đọc chữ nào. */
  const onlyPoster = poster && caption === null && captionVi === null && hashtags === null
                     && pTitleTh === null && pSubTh === null;
  const nextStatus = onlyPoster ? row.status : STATUS.EDITED;

  await env.DB.prepare(
    `UPDATE thai_post_queue
        SET caption_th      = COALESCE(?, caption_th),
            caption_vi      = COALESCE(?, caption_vi),
            hashtags        = COALESCE(?, hashtags),
            image_base64    = COALESCE(?, image_base64),
            poster_title_th = COALESCE(?, poster_title_th),
            poster_sub_th   = COALESCE(?, poster_sub_th),
            status          = ?,
            last_error      = NULL,
            updated_at      = ?
      WHERE id = ?`
  ).bind(caption, captionVi, hashtags, poster, pTitleTh, pSubTh, nextStatus, nowSec(), id).run();

  return ok(publicPost(await load(env, id), { withImage: true }));
}

export async function onRequestDelete({ params, request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  const id = Number(params.id);
  const row = await load(env, id);
  if (!row) return fail("post_not_found", 404);
  if (row.status === STATUS.PUBLISHED) return fail("already_published", 409);

  await env.DB.prepare(
    `UPDATE thai_post_queue SET status = ?, image_base64 = NULL, updated_at = ? WHERE id = ?`
  ).bind(STATUS.DISCARDED, nowSec(), id).run();

  return ok({ id, status: STATUS.DISCARDED });
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
