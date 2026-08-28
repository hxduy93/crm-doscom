// Endpoint: POST /api/geo/jobs (cũng support GET cho manual test)
//
// Tạo daily batch jobs cho geo_job_queue.
//
// Engine RẺ (gemini): mọi active query, như cũ.
// Engine ĐẮT (chatgpt, $0,025/lượt vì tool web_search): CHỈ query đã tới hạn theo
// TẦNG — A 2 ngày/lần, B 7 ngày/lần, C 14 ngày/lần — và không quá TRẦN NGÀY
// (env GEO_COSTLY_JOBS_PER_DAY, mặc định 7 → ~$5,3/tháng). Xem _utils/query-tier.js để biết
// vì sao (28/08/2026: 35/44 query chưa bao giờ được nhắc qua ~45 lượt mỗi câu, tiền
// đổ vào chỗ đứng yên). Tạo job đắt xong là dời next_run_at của query đó.
//
// Idempotent — skip nếu hôm nay (UTC 00:00) đã có jobs created, trừ khi {force: true}.
//
// Được GitHub Actions cron gọi mỗi 30 phút (cùng workflow với run-batch). Bypass auth
// qua X-Test-Token (_middleware.js whitelist). Manual trigger qua browser cũng OK.

import { ENGINES } from "./_utils/ai-engines/index.js";
import { COSTLY_JOBS_PER_DAY, buildJobPlan } from "./_utils/query-tier.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function todayStartUnix() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

async function handle(env, opts = {}) {
  if (!env.DB) return jsonResponse({ error: "D1 binding 'DB' missing" }, 500);

  const runsPerQuery = Math.min(Math.max(parseInt(opts.runs_per_query) || 1, 1), 3);
  const force = !!opts.force;
  const todayStart = todayStartUnix();

  if (!force) {
    const existing = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM geo_job_queue WHERE created_at >= ?`
    ).bind(todayStart).first();
    if (existing && existing.cnt > 0) {
      return jsonResponse({
        message: "Today's jobs already created — skipping (idempotent)",
        existing_count: existing.cnt,
        hint: "Pass {\"force\": true} để override",
      });
    }
  }

  const { results: queries } = await env.DB.prepare(
    `SELECT id, tier, next_run_at FROM geo_queries WHERE active = 1
      ORDER BY next_run_at IS NULL DESC, next_run_at ASC`
  ).all();

  if (queries.length === 0) {
    return jsonResponse({ error: "No active queries in geo_queries table" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const costlyCap = Number(env.GEO_COSTLY_JOBS_PER_DAY) > 0
    ? Number(env.GEO_COSTLY_JOBS_PER_DAY)
    : COSTLY_JOBS_PER_DAY;
  const plan = buildJobPlan(queries, ENGINES, runsPerQuery, now, costlyCap);

  const stmts = plan.jobs.map(j =>
    env.DB.prepare(
      `INSERT INTO geo_job_queue (id, query_id, engine, run_seq, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    ).bind(crypto.randomUUID(), j.query_id, j.engine, j.run_seq, now)
  );

  // Dời lịch cho các query vừa được cấp job engine đắt. Phải nằm CÙNG mẻ với
  // INSERT: dời trước mà insert lỗi thì query bị bỏ qua nguyên một chu kỳ.
  for (const r of plan.reschedule) {
    stmts.push(
      env.DB.prepare(
        `UPDATE geo_queries SET next_run_at = ?, updated_at = ? WHERE id = ?`
      ).bind(r.next_run_at, now, r.query_id)
    );
  }

  // D1 batch limit ~1000 statements. Chia chunk để an toàn khi scale up queries.
  const CHUNK = 50;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await env.DB.batch(stmts.slice(i, i + CHUNK));
  }

  // Đếm số job bị hoãn theo tầng và theo LÝ DO — KHÔNG im lặng cắt bớt.
  const skippedByTier = {};
  const skippedByReason = {};
  for (const s of plan.skipped) {
    skippedByTier[s.tier] = (skippedByTier[s.tier] || 0) + 1;
    skippedByReason[s.reason] = (skippedByReason[s.reason] || 0) + 1;
  }

  const costlyJobs = plan.jobs.filter(j => j.engine === "chatgpt").length;

  return jsonResponse({
    message: "Daily jobs created",
    queries: queries.length,
    engines: ENGINES.length,
    runs_per_query: runsPerQuery,
    total_jobs: plan.jobs.length,
    costly_jobs: costlyJobs,
    costly_cap: costlyCap,
    capped: plan.capped,
    est_cost_usd: Number((costlyJobs * 0.025).toFixed(4)),
    rescheduled: plan.reschedule.length,
    skipped_costly: plan.skipped.length,
    skipped_by_tier: skippedByTier,
    skipped_by_reason: skippedByReason,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch {}
  return handle(env, body || {});
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return handle(context.env, {
    runs_per_query: url.searchParams.get("runs_per_query"),
    force: url.searchParams.get("force") === "1",
  });
}
