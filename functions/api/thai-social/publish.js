// POST /api/thai-social/publish  { post_id }
//
// ĐƯỜNG DUY NHẤT đẩy bài lên Facebook. Cron và bước sinh bài không được đăng —
// bài sai lên fanpage thật thì CRM không hoàn tác được, phải vào Facebook xoá tay.
//
// Chỉ chuyển status sang `published` KHI Facebook trả về id bài thật. Lỗi thì giữ nguyên
// status và ghi last_error để user thấy trên UI — đúng bài học sự cố lệch
// NOMA911_INGEST_TOKEN: endpoint trả 200 mà đơn không hề về.

import { ok, fail, requireToken, requireDB, nowSec, publicPost, STATUS, PUBLISHABLE, tokenStatus } from "./_lib.js";
import { postToPage, base64ToBytes } from "./_graph.js";

function fullMessage(row) {
  let tags = [];
  try { tags = JSON.parse(row.hashtags || "[]"); } catch { tags = []; }
  const tagLine = tags.length ? "\n\n" + tags.map((t) => "#" + String(t).replace(/^#/, "")).join(" ") : "";
  return String(row.caption_th || "").trim() + tagLine;
}

export async function onRequestPost({ request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  let b;
  try { b = await request.json(); } catch { return fail("invalid_json"); }

  const id = Number(b.post_id);
  if (!id) return fail("missing_post_id");

  const row = await env.DB.prepare(`SELECT * FROM thai_post_queue WHERE id = ?`).bind(id).first();
  if (!row) return fail("post_not_found", 404);
  if (row.status === STATUS.PUBLISHED) return fail("already_published", 409, { fb_post_id: row.fb_post_id });
  if (!PUBLISHABLE.includes(row.status)) return fail("not_publishable", 409, { status: row.status });
  if (!String(row.caption_th || "").trim()) return fail("empty_caption");

  const page = await env.DB.prepare(`SELECT * FROM thai_pages WHERE page_id = ?`).bind(row.page_id).first();
  if (!page) return fail("unknown_page", 404);

  const ts = tokenStatus(page);
  if (ts !== "ok") {
    const msg = ts === "missing"
      ? `Fanpage "${page.name}" chưa có Page Access Token. Cấp token có quyền pages_manage_posts rồi nhập ở tab Fanpage.`
      : `Page Access Token của "${page.name}" đã hết hạn. Cấp lại token dài hạn rồi nhập lại.`;
    await env.DB.prepare(`UPDATE thai_post_queue SET last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(msg, nowSec(), id).run();
    return fail("page_token_" + ts, 409, { detail: msg });
  }

  let result;
  try {
    result = await postToPage({
      pageId: page.page_id,
      pageToken: page.page_token,
      message: fullMessage(row),
      imageUrl: row.image_url || null,
      imageBytes: row.image_url ? null : (row.image_base64 ? base64ToBytes(row.image_base64) : null),
    });
  } catch (e) {
    // KHÔNG tự retry vòng lặp: rate limit thì retry ngay chỉ làm Facebook siết thêm,
    // còn lỗi token/quyền thì retry bao nhiêu lần cũng vậy. Để user quyết định.
    const msg = `Facebook từ chối (${e.kind || "other"}): ${e.message}`;
    await env.DB.prepare(`UPDATE thai_post_queue SET last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(msg, nowSec(), id).run();
    return fail("graph_failed", 502, { kind: e.kind || "other", detail: e.message });
  }

  if (!result || !result.fb_post_id) {
    const msg = "Facebook trả về nhưng KHÔNG có id bài — chưa coi là đã đăng.";
    await env.DB.prepare(`UPDATE thai_post_queue SET last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(msg, nowSec(), id).run();
    return fail("no_post_id", 502, { detail: msg });
  }

  // Có id thật → mới đánh dấu published. Xoá ảnh base64 tạm cho D1 khỏi phình.
  await env.DB.prepare(
    `UPDATE thai_post_queue SET status = ?, fb_post_id = ?, image_base64 = NULL,
            last_error = NULL, updated_at = ? WHERE id = ?`
  ).bind(STATUS.PUBLISHED, result.fb_post_id, nowSec(), id).run();

  const updated = await env.DB.prepare(`SELECT * FROM thai_post_queue WHERE id = ?`).bind(id).first();
  return ok(publicPost(updated));
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
