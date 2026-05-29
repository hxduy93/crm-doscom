import type { Decision, Env, GuardrailResult, RunContext } from "./types";

const KILLSWITCH_KEY = "AGENT_KILLSWITCH";

export async function isKillswitchOn(env: Env): Promise<boolean> {
  const v = await env.AGENT_KV.get(KILLSWITCH_KEY);
  return v === "1" || v === "true";
}

export function todayYmdICT(now: Date = new Date()): string {
  const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return ict.toISOString().slice(0, 10);
}

export async function getDailySpendUsd(env: Env): Promise<number> {
  const ymd = todayYmdICT();
  const row = await env.DB.prepare(
    "SELECT spend_usd FROM daily_spend WHERE date_ymd = ?"
  )
    .bind(ymd)
    .first<{ spend_usd: number }>();
  return row?.spend_usd ?? 0;
}

export async function recordDailySpend(
  env: Env,
  spendUsd: number
): Promise<void> {
  const ymd = todayYmdICT();
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO daily_spend (date_ymd, spend_usd, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(date_ymd) DO UPDATE SET spend_usd = excluded.spend_usd, updated_at = excluded.updated_at`
  )
    .bind(ymd, spendUsd, nowIso)
    .run();
}

export function checkDecision(
  decision: Decision,
  ctx: RunContext,
  env: Env
): GuardrailResult {
  if (ctx.shadow_mode) {
    return { allowed: false, blocked_reason: "shadow_mode" };
  }

  const cap = Number(env.DAILY_SPEND_CAP_USD);
  const maxDelta = Number(env.MAX_BUDGET_DELTA_PCT);

  if (decision.action_type === "scale_budget") {
    const oldB = Number(decision.payload.budget_old_usd);
    const newB = Number(decision.payload.budget_new_usd);
    if (!isFinite(oldB) || !isFinite(newB) || oldB <= 0) {
      return { allowed: false, blocked_reason: "invalid_budget_payload" };
    }
    const deltaPct = Math.abs(newB - oldB) / oldB;
    if (deltaPct > maxDelta) {
      return {
        allowed: false,
        blocked_reason: `delta_too_large:${(deltaPct * 100).toFixed(1)}%`,
      };
    }
    if (newB > oldB && ctx.daily_spend_usd >= cap) {
      return { allowed: false, blocked_reason: "spend_cap_hit" };
    }
    const projected = ctx.daily_spend_usd + (newB - oldB);
    if (projected > cap * 1.2) {
      return {
        allowed: false,
        blocked_reason: `projected_spend_exceeds_cap:${projected.toFixed(2)}`,
      };
    }
  }

  if (decision.action_type === "reallocate") {
    const from = Number(decision.payload.from_delta_usd);
    const to = Number(decision.payload.to_delta_usd);
    if (Math.abs(from + to) > 0.5) {
      return { allowed: false, blocked_reason: "reallocate_not_zero_sum" };
    }
  }

  return { allowed: true };
}

export function enforceAccountWhitelist(
  campaignAccountId: string,
  env: Env
): GuardrailResult {
  const whitelisted = env.AD_ACCOUNT_ID.replace(/^act_/, "");
  const got = campaignAccountId.replace(/^act_/, "");
  if (whitelisted !== got) {
    return {
      allowed: false,
      blocked_reason: `account_mismatch:expected_${whitelisted}_got_${got}`,
    };
  }
  return { allowed: true };
}
