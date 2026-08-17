// GET /api/refresh/next   — runner ở máy người vận hành hỏi "có việc không?"
// Bảo vệ bằng header X-Refresh-Token == env.REFRESH_RUNNER_TOKEN (khuôn giống
// X-Noma-Token của noma911-orders).
//
// Runner KÉO chứ CRM không ĐẨY: máy người vận hành nằm sau NAT, không có IP tĩnh, không
// mở cổng vào được. Đổi lại độ trễ tối đa 60 giây từ lúc bấm nút — không đáng kể so với
// pipeline chạy 40 phút.

import { json, nowSec, sweepStale, requireRunner, requireDB, STEPS, NOMA_LANDINGS } from "./_lib.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const authErr = requireRunner(request, env);
  if (authErr) return authErr;
  const dbErr = requireDB(env);
  if (dbErr) return dbErr;

  const url = new URL(request.url);
  const version = url.searchParams.get("v") || null;
  const ts = nowSec();

  try {
    // Nhịp tim: ghi MỌI lần runner hỏi, kể cả khi không có job. Giao diện dựa vào đây để
    // biết máy chạy runner có đang bật không.
    await env.DB.prepare(
      `INSERT INTO refresh_runner_state (id, last_seen_at, runner_version) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at,
                                     runner_version = excluded.runner_version`
    ).bind(ts, version).run();

    await sweepStale(env);

    const job = await env.DB.prepare(
      `SELECT * FROM refresh_jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1`
    ).first();

    if (!job) return json({ ok: true, data: null });

    await env.DB.prepare(
      `UPDATE refresh_jobs SET status='running', started_at=?, total_steps=? WHERE id=?`
    ).bind(ts, STEPS.length, job.id).run();

    return json({
      ok: true,
      data: {
        job_id: job.id,
        requested_by: job.requested_by,
        steps: STEPS,
        noma_landings: NOMA_LANDINGS,
      },
    });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
