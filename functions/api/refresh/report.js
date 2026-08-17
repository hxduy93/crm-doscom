// POST /api/refresh/report — runner báo tiến độ, mỗi bước một lần.
// Body: { job_id, step_index, step, status: "ok"|"failed"|"done", message?, warnings? }
//
// CỐ Ý không stream log: log đầy đủ nằm ở máy chạy runner (runner/logs/), chỉ 2000 ký tự
// cuối của bước lỗi được lưu lên D1 để hiện trên giao diện. Tránh biến D1 thành nơi chứa
// log và tránh ghi D1 liên tục suốt 40 phút.

import { json, nowSec, requireRunner, requireDB } from "./_lib.js";

const MAX_LOG = 2000;

export async function onRequestPost(context) {
  const { request, env } = context;

  const authErr = requireRunner(request, env);
  if (authErr) return authErr;
  const dbErr = requireDB(env);
  if (dbErr) return dbErr;

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const jobId = parseInt(d.job_id, 10);
  if (!jobId) return json({ ok: false, error: "missing_job_id" }, 400);

  const status = String(d.status || "").trim();
  if (!["ok", "failed", "done"].includes(status)) {
    return json({ ok: false, error: "bad_status" }, 400);
  }

  const stepIndex = parseInt(d.step_index, 10) || 0;
  const stepName = String(d.step || "").slice(0, 120);
  const warnings = Math.max(parseInt(d.warnings, 10) || 0, 0);
  const message = String(d.message || "");
  const ts = nowSec();

  try {
    const job = await env.DB.prepare(`SELECT * FROM refresh_jobs WHERE id = ?`).bind(jobId).first();
    if (!job) return json({ ok: false, error: "job_not_found" }, 404);

    // Báo cáo bước cũng TÍNH LÀ nhịp tim. Trong lúc chạy job (~40 phút) runner không gọi
    // /next lần nào, nên nếu chỉ dựa vào /next thì nhịp tim hoá cũ và giao diện báo
    // "runner chưa chạy" ngay giữa lúc runner đang chạy thật.
    await env.DB.prepare(
      `INSERT INTO refresh_runner_state (id, last_seen_at) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    ).bind(ts).run();

    if (status === "failed") {
      // Bước lỗi → dừng cả pipeline. Runner KHÔNG chạy bước sau và KHÔNG deploy.
      await env.DB.prepare(
        `UPDATE refresh_jobs
         SET status='failed', finished_at=?, current_step=?, current_step_name=?,
             error_step=?, error_log=?, warnings=?
         WHERE id=?`
      ).bind(ts, stepIndex, stepName, stepName, message.slice(-MAX_LOG), warnings, jobId).run();
      return json({ ok: true, data: { job_id: jobId, status: "failed" } });
    }

    if (status === "done") {
      // Chỉ đúng khi bước cuối (deploy) xong. warnings > 0 thì giao diện phải báo
      // "xong, có N cảnh báo" — không báo thành công trơn tru.
      await env.DB.prepare(
        `UPDATE refresh_jobs
         SET status='done', finished_at=?, current_step=?, current_step_name=?,
             warnings=?, warning_text=?
         WHERE id=?`
      ).bind(ts, stepIndex, stepName, warnings, message.slice(-MAX_LOG), jobId).run();
      return json({ ok: true, data: { job_id: jobId, status: "done", warnings } });
    }

    // status === "ok": một bước xong, pipeline chạy tiếp.
    // Cộng dồn warnings vì mỗi bước có thể tự đếm cảnh báo của riêng nó.
    await env.DB.prepare(
      `UPDATE refresh_jobs
       SET current_step=?, current_step_name=?, warnings=warnings+?,
           warning_text=CASE WHEN ?='' THEN warning_text
                             ELSE TRIM(COALESCE(warning_text,'') || char(10) || ?) END
       WHERE id=?`
    ).bind(stepIndex, stepName, warnings, message, message, jobId).run();

    return json({ ok: true, data: { job_id: jobId, status: "running", current_step: stepIndex } });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
