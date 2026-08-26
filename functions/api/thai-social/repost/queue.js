// GET /api/thai-social/repost/queue?page_id=&days=&status=
//
// Liệt kê bài dịch lại. Mặc định 30 ngày gần nhất, bỏ bài đã bỏ đi.
// Để 30 (bài theo SKU là 14) vì bài hẹn giờ có thể nằm chờ khá lâu mới tới lượt đăng.

import { ok, requireDB } from "../_lib.js";
import { RSTATUS, publicRepost } from "../_repost-lib.js";

export async function onRequestGet({ request, env }) {
  const bad = requireDB(env);
  if (bad) return bad;

  const u = new URL(request.url);
  const pageId = (u.searchParams.get("page_id") || "").trim();
  const days = Math.min(Math.max(parseInt(u.searchParams.get("days"), 10) || 30, 1), 180);
  const status = (u.searchParams.get("status") || "").trim();
  const includeDiscarded = u.searchParams.get("include_discarded") === "1";

  const since = new Date(Date.now() + 7 * 3600 * 1000 - days * 86400 * 1000)
    .toISOString().slice(0, 10);

  const where = ["vn_date >= ?"];
  const args = [since];
  if (pageId) { where.push("page_id = ?"); args.push(pageId); }
  if (status) { where.push("status = ?"); args.push(status); }
  else if (!includeDiscarded) { where.push("status != ?"); args.push(RSTATUS.DISCARDED); }

  const { results } = await env.DB.prepare(
    `SELECT * FROM thai_repost_queue WHERE ${where.join(" AND ")}
      ORDER BY vn_date DESC, id DESC LIMIT 200`
  ).bind(...args).all();

  const rows = results || [];
  const counts = { pending_review: 0, edited: 0, scheduled: 0, published: 0, discarded: 0 };
  let cost = 0;
  for (const r of rows) {
    if (counts[r.status] !== undefined) counts[r.status]++;
    cost += Number(r.cost_usd || 0);
  }

  return ok({ posts: rows.map((r) => publicRepost(r)), counts, since, cost_usd: Number(cost.toFixed(4)) });
}
