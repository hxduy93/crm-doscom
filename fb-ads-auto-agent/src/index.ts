import { runHaikuDecision } from "./agent";
import { executeDecision, logDecision } from "./actions";
import { sendImportantNotification } from "./gmail-notifier";
import {
  checkCampaignExcluded,
  enforceAccountWhitelist,
  getDailySpendUsd,
  isKillswitchOn,
  recordDailySpend,
} from "./guardrails";
import { fetchControl } from "./control";
import { checkTokenExpiry, fetchCampaignInsights, fetchTodaySpendUsd } from "./meta-api";
import type { Env, RunContext } from "./types";

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runAgentLoop(env));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, ts: new Date().toISOString() });
    }

    if (url.pathname === "/run" && url.searchParams.get("key") === env.ANTHROPIC_API_KEY.slice(-8)) {
      const result = await runAgentLoop(env);
      return Response.json(result);
    }

    if (url.pathname === "/runs") {
      const rows = await env.DB.prepare(
        "SELECT id, started_at, finished_at, status, campaigns_seen, decisions_made, actions_executed, daily_spend_usd, haiku_cost_usd, error_message FROM runs ORDER BY id DESC LIMIT 30"
      ).all();
      return Response.json(rows.results);
    }

    if (url.pathname === "/token") {
      const info = await checkTokenExpiry(env).catch((e) => ({
        error: e instanceof Error ? e.message : String(e),
      }));
      return Response.json(info);
    }

    if (url.pathname === "/decisions") {
      const runId = url.searchParams.get("run_id");
      const q = runId
        ? env.DB.prepare(
            "SELECT * FROM decisions WHERE run_id = ? ORDER BY id DESC"
          ).bind(runId)
        : env.DB.prepare(
            "SELECT * FROM decisions ORDER BY id DESC LIMIT 50"
          );
      const rows = await q.all();
      return Response.json(rows.results);
    }

    return new Response("FB Ads Auto Agent — endpoints: /health /runs /decisions?run_id=N", {
      status: 200,
    });
  },
};

async function runAgentLoop(env: Env) {
  const startedAt = new Date().toISOString();
  // Cấu hình điều khiển từ CRM (danh sách bảo vệ + shadow + killswitch).
  const control = await fetchControl(env);
  const shadowMode = env.SHADOW_MODE === "true" || control.shadow;
  const excludedSet = new Set(control.excluded);

  if ((await isKillswitchOn(env)) || control.killswitch) {
    await env.DB.prepare(
      "INSERT INTO runs (started_at, finished_at, status, ad_account_id) VALUES (?, ?, 'killswitch', ?)"
    )
      .bind(startedAt, new Date().toISOString(), env.AD_ACCOUNT_ID)
      .run();
    return { status: "killswitch", started_at: startedAt };
  }

  const insertRun = await env.DB.prepare(
    "INSERT INTO runs (started_at, status, ad_account_id) VALUES (?, 'running', ?)"
  )
    .bind(startedAt, env.AD_ACCOUNT_ID)
    .run();
  const runId = Number(insertRun.meta.last_row_id);

  try {
    const tokenInfo = await checkTokenExpiry(env).catch((e) => {
      console.error("Token check failed:", e instanceof Error ? e.message : String(e));
      return null;
    });
    if (tokenInfo) {
      const days = tokenInfo.days_until_expiry;
      if (days !== null && days < 7) {
        await env.DB.prepare(
          "INSERT INTO audit_log (ts, level, event, details) VALUES (?, 'warn', 'token_expiring_soon', ?)"
        )
          .bind(
            new Date().toISOString(),
            JSON.stringify({ days_until_expiry: days, expires_at: tokenInfo.expires_at_iso })
          )
          .run();
      }
      if (days !== null && days < 0) {
        throw new Error(`FB_ACCESS_TOKEN expired ${-days} days ago — refresh required`);
      }
    }

    const dailySpendUsd = await fetchTodaySpendUsd(env).catch(async () => {
      return await getDailySpendUsd(env);
    });
    await recordDailySpend(env, dailySpendUsd);

    const allCampaigns = await fetchCampaignInsights(env, 7);
    // Bỏ HẲN camp bảo vệ khỏi dữ liệu AI thấy → AI không thể đề xuất gì lên chúng.
    const campaigns = allCampaigns.filter(
      (c) => !excludedSet.has(c.campaign_id)
    );

    if (campaigns.length === 0) {
      await finalizeRun(env, runId, "success", {
        campaigns_seen: 0,
        decisions_made: 0,
        actions_executed: 0,
        daily_spend_usd: dailySpendUsd,
      });
      return { status: "no_active_campaigns", run_id: runId };
    }

    const agentRes = await runHaikuDecision(env, campaigns, dailySpendUsd);

    const runCtx: RunContext = {
      run_id: runId,
      started_at: startedAt,
      daily_spend_usd: dailySpendUsd,
      shadow_mode: shadowMode,
      campaigns,
    };

    let executed = 0;
    for (const d of agentRes.decisions) {
      const acctCheck = enforceAccountWhitelist(env.AD_ACCOUNT_ID, env);
      if (!acctCheck.allowed) {
        await logDecision(env, runId, d, {
          executed: false,
          blocked_reason: acctCheck.blocked_reason,
        });
        continue;
      }
      // Lớp phòng thủ 2: chặn mọi action lên camp bảo vệ.
      const exCheck = checkCampaignExcluded(d.campaign_id, excludedSet);
      if (!exCheck.allowed) {
        await logDecision(env, runId, d, {
          executed: false,
          blocked_reason: exCheck.blocked_reason,
        });
        continue;
      }
      const res = await executeDecision(d, runCtx, env);
      if (res.executed) executed++;
      await logDecision(env, runId, d, res);
    }

    await sendImportantNotification(env, agentRes.decisions, runId, dailySpendUsd);

    await finalizeRun(env, runId, shadowMode ? "shadow" : "success", {
      campaigns_seen: campaigns.length,
      decisions_made: agentRes.decisions.length,
      actions_executed: executed,
      daily_spend_usd: dailySpendUsd,
      haiku_tokens_in: agentRes.tokens_in,
      haiku_tokens_out: agentRes.tokens_out,
      haiku_cost_usd: agentRes.cost_usd,
    });

    return {
      status: shadowMode ? "shadow" : "success",
      run_id: runId,
      campaigns_seen: campaigns.length,
      decisions_made: agentRes.decisions.length,
      actions_executed: executed,
      haiku_cost_usd: agentRes.cost_usd,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finalizeRun(env, runId, "error", { error_message: msg });
    return { status: "error", run_id: runId, error: msg };
  }
}

async function finalizeRun(
  env: Env,
  runId: number,
  status: string,
  extra: {
    campaigns_seen?: number;
    decisions_made?: number;
    actions_executed?: number;
    daily_spend_usd?: number;
    haiku_tokens_in?: number;
    haiku_tokens_out?: number;
    haiku_cost_usd?: number;
    error_message?: string;
  }
) {
  await env.DB.prepare(
    `UPDATE runs SET
       finished_at = ?,
       status = ?,
       campaigns_seen = COALESCE(?, campaigns_seen),
       decisions_made = COALESCE(?, decisions_made),
       actions_executed = COALESCE(?, actions_executed),
       daily_spend_usd = COALESCE(?, daily_spend_usd),
       haiku_tokens_in = COALESCE(?, haiku_tokens_in),
       haiku_tokens_out = COALESCE(?, haiku_tokens_out),
       haiku_cost_usd = COALESCE(?, haiku_cost_usd),
       error_message = COALESCE(?, error_message)
     WHERE id = ?`
  )
    .bind(
      new Date().toISOString(),
      status,
      extra.campaigns_seen ?? null,
      extra.decisions_made ?? null,
      extra.actions_executed ?? null,
      extra.daily_spend_usd ?? null,
      extra.haiku_tokens_in ?? null,
      extra.haiku_tokens_out ?? null,
      extra.haiku_cost_usd ?? null,
      extra.error_message ?? null,
      runId
    )
    .run();
}
