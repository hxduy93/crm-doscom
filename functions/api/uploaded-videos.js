/**
 * Cloudflare Pages Function: /api/uploaded-videos
 * ------------------------------------------------
 * Sổ video đã upload thành ad (D1 bảng uploaded_videos). Phục vụ nút "Quét video":
 * biết video nào ĐÃ CÓ ad set để bỏ qua, chỉ upload video MỚI.
 *
 *   GET  /api/uploaded-videos?account_id=<id>
 *        → { ok, account_id, files:[filename...], rows:[{filename,video_id,ad_id,...}] }
 *
 *   POST /api/uploaded-videos        (ghi sổ sau khi tạo ad thành công)
 *        body { account_id, videos:[{ filename, video_id?, ad_id?, campaign_id?, product? }] }
 *        → { ok, inserted }
 *
 * Phân quyền: getIdentity + canAccess (đúng red-line "endpoint ghi phải có quyền").
 * Khi Access CHƯA bật (role "open") → POST bắt buộc X-Optimizer-Token.
 */
import { getIdentity, canAccess } from "../lib/access.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const acctOf = (v) => String(v || "").replace(/^act_/, "");

export async function onRequestGet(context) {
  const { request, env } = context;
  const acct = acctOf(new URL(request.url).searchParams.get("account_id"));
  if (!acct) return json({ ok: false, error: "Thiếu ?account_id=" }, 400);
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  const id = await getIdentity(context);
  if (!canAccess(id, acct)) return json({ ok: false, error: "Không có quyền trên tài khoản này" }, 403);

  try {
    const res = await env.DB.prepare(
      `SELECT filename, video_id, ad_id, campaign_id, product, created_at
         FROM uploaded_videos
        WHERE account_id = ?
        ORDER BY created_at DESC`
    ).bind(acct).all();
    const rows = (res && res.results) || [];
    return json({ ok: true, account_id: acct, files: rows.map((r) => r.filename), rows });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }

  const acct = acctOf(body.account_id);
  if (!acct) return json({ ok: false, error: "Thiếu account_id" }, 400);
  const videos = Array.isArray(body.videos) ? body.videos : [];
  if (videos.length === 0) return json({ ok: false, error: "videos rỗng" }, 400);

  // Phân quyền: đã đăng nhập (Access) + có quyền tài khoản. Access chưa bật → cần token.
  const id = await getIdentity(context);
  if (!canAccess(id, acct)) return json({ ok: false, error: "Không có quyền trên tài khoản này" }, 403);
  if (id.role === "open") {
    if (!env.OPTIMIZER_TOKEN || request.headers.get("X-Optimizer-Token") !== env.OPTIMIZER_TOKEN) {
      return json({ ok: false, error: "unauthorized — sai/thiếu X-Optimizer-Token" }, 401);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  // INSERT OR IGNORE → trùng (account_id, filename) thì bỏ qua, không lỗi.
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO uploaded_videos
       (account_id, product, filename, video_id, ad_id, campaign_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    const batch = videos
      .filter((v) => v && v.filename)
      .map((v) => stmt.bind(
        acct,
        v.product != null ? String(v.product) : null,
        String(v.filename),
        v.video_id != null ? String(v.video_id) : null,
        v.ad_id != null ? String(v.ad_id) : null,
        v.campaign_id != null ? String(v.campaign_id) : null,
        now
      ));
    if (batch.length === 0) return json({ ok: false, error: "Không có filename hợp lệ" }, 400);
    await env.DB.batch(batch);
    return json({ ok: true, inserted: batch.length });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
