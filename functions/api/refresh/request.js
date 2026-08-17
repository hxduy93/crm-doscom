// POST /api/refresh/request
// Người dùng bấm nút "Cập nhật dữ liệu" trên trang Tổng quan Dashboard.
// KHÔNG chạy pipeline ở đây — Pages Functions không có runtime Python và pipeline chạy
// ~40 phút. Endpoint này chỉ ghi một yêu cầu vào D1 rồi trả về ngay; runner ở máy người
// vận hành sẽ nhận việc qua /api/refresh/next.
//
// KHÔNG cần token: đúng quyết định "CRM để public trong giai đoạn hoàn thiện" của hiến
// pháp dự án. Rủi ro tối đa nếu bị gọi bừa là chạy pipeline thừa một lượt — không mất
// dữ liệu, và ràng buộc "một job tại một thời điểm" bên dưới chặn spam.

import { json, nowSec, sweepStale, latestJob, STEPS, requireDB } from "./_lib.js";

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const dbErr = requireDB(env);
  if (dbErr) return dbErr;

  try {
    await sweepStale(env);

    // Một job tại một thời điểm. Hai lượt pipeline cùng ghi data/*.json rồi cùng deploy
    // là đúng kiểu race đã làm hỏng workflow trước đây.
    const running = await env.DB.prepare(
      `SELECT * FROM refresh_jobs WHERE status IN ('pending','running') ORDER BY id DESC LIMIT 1`
    ).first();

    if (running) {
      return json({
        ok: true,
        data: {
          job_id: running.id,
          status: running.status,
          already_running: true,
          current_step: running.current_step,
          current_step_name: running.current_step_name,
          total_steps: running.total_steps,
        },
      });
    }

    // Cloudflare Access gắn header này khi đã bật đăng nhập; chưa bật thì ghi 'web'.
    const who = request.headers.get("Cf-Access-Authenticated-User-Email") || "web";
    const ts = nowSec();

    const res = await env.DB.prepare(
      `INSERT INTO refresh_jobs (status, created_at, total_steps, requested_by)
       VALUES ('pending', ?, ?, ?)`
    ).bind(ts, STEPS.length, who).run();

    const jobId = res?.meta?.last_row_id ?? (await latestJob(env))?.id;

    return json({
      ok: true,
      data: { job_id: jobId, status: "pending", already_running: false, total_steps: STEPS.length },
    });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
