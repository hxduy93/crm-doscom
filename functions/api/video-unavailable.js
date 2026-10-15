/**
 * Cloudflare Pages Function: /api/video-unavailable
 * -------------------------------------------------
 * Sổ video TikTok KHÔNG LẤY ĐƯỢC LINK (D1 bảng video_unavailable, 15/10/2026).
 *
 *   GET  /api/video-unavailable
 *        → { ok, han_an_s, videos:[{ video_key, reason, marked_at }] }
 *        Chỉ trả video ghi trong HAN_AN_S gần nhất — quá hạn thì menu TikTok Shop hiện lại.
 *
 *   POST /api/video-unavailable   (cần X-Optimizer-Token khi Access chưa bật)
 *        body { videos:[{ key|link, title?, reason? }] }
 *        → { ok, marked:[key], released:[key] }
 *        Đồng thời GỠ NHẬN các video đó trong video_claims nếu chưa lên camp: nhận rồi
 *        mà không lấy được video thì giữ chỗ chỉ làm người kia không tick được. Gỡ hộ ở
 *        đây không xét hạn 60s — video chưa hề chạy nên không có gì để cam kết.
 */
import { getIdentity } from "../lib/access.js";
import { videoKeyFromLink } from "./video-claims.js";

// 3 ngày: video "đang duyệt" thường xong trong khoảng đó; kênh bị hạn chế thì lần
// lấy sau lại lỗi và được ghi mới.
export const HAN_AN_S = 3 * 86400;
const MAX_PER_CALL = 100;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function normalizeUnavailable(v) {
  if (!v) return null;
  const key = videoKeyFromLink(v.key || v.link);
  if (!key) return null;
  const str = (x, n = 300) => (x == null ? null : String(x).slice(0, n));
  return { key, link: str(v.link), title: str(v.title), reason: str(v.reason, 500) };
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  try {
    const tu = Math.floor(Date.now() / 1000) - HAN_AN_S;
    const res = await env.DB.prepare(
      `SELECT video_key, reason, marked_at FROM video_unavailable
        WHERE marked_at >= ? ORDER BY marked_at DESC LIMIT 2000`
    ).bind(tu).all();
    return json({ ok: true, han_an_s: HAN_AN_S, videos: (res && res.results) || [] });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  let body = null;
  try { body = await request.json(); } catch { /* bỏ qua */ }
  if (!body) return json({ ok: false, error: "Body không phải JSON" }, 400);
  const videos = (Array.isArray(body.videos) ? body.videos : [])
    .map(normalizeUnavailable).filter(Boolean).slice(0, MAX_PER_CALL);
  if (!videos.length) return json({ ok: false, error: "Không có video hợp lệ (thiếu id video)" }, 400);

  const id = await getIdentity(context);
  if (id.role === "open") {
    const sent = request.headers.get("X-Optimizer-Token");
    if (!env.OPTIMIZER_TOKEN || sent !== env.OPTIMIZER_TOKEN) {
      return json({ ok: false, error: "Sai hoặc thiếu mã CRM (X-Optimizer-Token)" }, 401);
    }
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const ghi = env.DB.prepare(
      `INSERT INTO video_unavailable (video_key, link, title, reason, marked_at, marked_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(video_key) DO UPDATE SET
         link = excluded.link, title = excluded.title, reason = excluded.reason,
         marked_at = excluded.marked_at, marked_by = excluded.marked_by`
    );
    await env.DB.batch(videos.map((v) =>
      ghi.bind(v.key, v.link, v.title, v.reason, now, id?.email || null)));

    // Gỡ nhận — trừ video đã có ad (sổ uploaded_videos lưu "<id>.mp4").
    const keys = videos.map((v) => v.key);
    const holes = keys.map(() => "?").join(",");
    const coAd = await env.DB.prepare(
      `SELECT filename FROM uploaded_videos WHERE filename IN (${holes})`
    ).bind(...keys.map((k) => k + ".mp4")).all().catch(() => ({ results: [] }));
    const daChay = new Set(((coAd && coAd.results) || []).map((r) => String(r.filename).replace(/\.[^.]+$/, "")));
    const goKeys = keys.filter((k) => !daChay.has(k));
    let released = [];
    if (goKeys.length) {
      const h2 = goKeys.map(() => "?").join(",");
      const dang = await env.DB.prepare(
        `SELECT video_key FROM video_claims WHERE released_at IS NULL AND video_key IN (${h2})`
      ).bind(...goKeys).all();
      released = ((dang && dang.results) || []).map((r) => String(r.video_key));
      if (released.length) {
        const h3 = released.map(() => "?").join(",");
        await env.DB.prepare(
          `UPDATE video_claims SET released_at = ?, released_by = ?
            WHERE released_at IS NULL AND video_key IN (${h3})`
        ).bind(now, "auto:khong-lay-duoc-link", ...released).run();
      }
    }
    return json({ ok: true, marked: keys, released });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
