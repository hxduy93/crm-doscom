// GET /api/thai-social/queue?page_id=&days=&status=
//
// Liệt kê bài theo fanpage. Mặc định 14 ngày gần nhất, bỏ bài đã bỏ đi.

import { ok, requireDB, publicPost, STATUS } from "./_lib.js";

export async function onRequestGet({ request, env }) {
  const bad = requireDB(env);
  if (bad) return bad;

  const u = new URL(request.url);
  const pageId = (u.searchParams.get("page_id") || "").trim();
  const days = Math.min(Math.max(parseInt(u.searchParams.get("days"), 10) || 14, 1), 90);
  const status = (u.searchParams.get("status") || "").trim();
  const includeDiscarded = u.searchParams.get("include_discarded") === "1";

  const since = new Date(Date.now() + 7 * 3600 * 1000 - days * 86400 * 1000)
    .toISOString().slice(0, 10);

  const where = ["vn_date >= ?"];
  const args = [since];
  if (pageId) { where.push("page_id = ?"); args.push(pageId); }
  if (status) { where.push("status = ?"); args.push(status); }
  else if (!includeDiscarded) { where.push("status != ?"); args.push(STATUS.DISCARDED); }

  const { results } = await env.DB.prepare(
    `SELECT * FROM thai_post_queue WHERE ${where.join(" AND ")}
     ORDER BY vn_date DESC, id DESC LIMIT 200`
  ).bind(...args).all();

  const rows = results || [];
  const counts = { pending_review: 0, edited: 0, published: 0, discarded: 0 };
  for (const r of rows) if (counts[r.status] !== undefined) counts[r.status]++;

  return ok({ posts: rows.map((r) => publicPost(r)), counts, since });
}
