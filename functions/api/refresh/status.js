// GET /api/refresh/status — giao diện hỏi trạng thái để hiện tiến độ.
// KHÔNG cần token (chỉ đọc, không ghi gì ngoài việc quét job treo).

import { json, nowSec, sweepStale, latestJob, runnerLastSeen, requireDB,
         STEPS, RUNNER_OFFLINE_SECONDS } from "./_lib.js";

export async function onRequestGet(context) {
  const { env } = context;
  const dbErr = requireDB(env);
  if (dbErr) return dbErr;

  try {
    await sweepStale(env);

    const [job, runner] = await Promise.all([latestJob(env), runnerLastSeen(env)]);
    const ts = nowSec();
    const lastSeen = runner?.last_seen_at || 0;

    return json({
      ok: true,
      data: {
        job: job
          ? {
              job_id: job.id,
              status: job.status,
              created_at: job.created_at,
              started_at: job.started_at,
              finished_at: job.finished_at,
              current_step: job.current_step,
              current_step_name: job.current_step_name,
              total_steps: job.total_steps || STEPS.length,
              warnings: job.warnings,
              warning_text: job.warning_text,
              error_step: job.error_step,
              error_log: job.error_log,
              requested_by: job.requested_by,
            }
          : null,
        runner: {
          last_seen_at: lastSeen || null,
          version: runner?.runner_version || null,
          // Runner im quá 5 phút → giao diện đổi nút thành "runner chưa chạy" thay vì
          // để người bấm rồi chờ vô ích.
          online: lastSeen > 0 && ts - lastSeen <= RUNNER_OFFLINE_SECONDS,
        },
        steps: STEPS.map((s) => ({ key: s.key, label: s.label })),
        server_time: ts,
      },
    });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
