import { checkDecision } from "./guardrails";
import {
  pauseAd,
  pauseAdset,
  pauseCampaign,
  updateAdsetBudgetUsd,
  updateCampaignBudgetUsd,
} from "./meta-api";
import type { Decision, Env, RunContext } from "./types";

export interface ExecuteResult {
  executed: boolean;
  blocked_reason?: string;
  meta_response?: unknown;
  error?: string;
}

export async function executeDecision(
  decision: Decision,
  ctx: RunContext,
  env: Env
): Promise<ExecuteResult> {
  const check = checkDecision(decision, ctx, env);
  if (!check.allowed) {
    return { executed: false, blocked_reason: check.blocked_reason };
  }

  try {
    switch (decision.action_type) {
      case "noop":
        return { executed: false, blocked_reason: "noop" };

      case "pause": {
        let resp: unknown;
        if (decision.ad_id) resp = await pauseAd(env, decision.ad_id);
        else if (decision.adset_id) resp = await pauseAdset(env, decision.adset_id);
        else resp = await pauseCampaign(env, decision.campaign_id);
        return { executed: true, meta_response: resp };
      }

      case "scale_budget": {
        const newBudget = Number(decision.payload.budget_new_usd);
        if (!isFinite(newBudget) || newBudget <= 0) {
          return { executed: false, blocked_reason: "invalid_new_budget" };
        }
        const resp = decision.adset_id
          ? await updateAdsetBudgetUsd(env, decision.adset_id, newBudget)
          : await updateCampaignBudgetUsd(env, decision.campaign_id, newBudget);
        return { executed: true, meta_response: resp };
      }

      case "reallocate": {
        const fromId = String(decision.payload.from_adset_id);
        const toId = String(decision.payload.to_adset_id);
        const fromDelta = Number(decision.payload.from_delta_usd);
        const toDelta = Number(decision.payload.to_delta_usd);
        const fromOld = Number(decision.payload.from_budget_old_usd);
        const toOld = Number(decision.payload.to_budget_old_usd);
        if (!fromId || !toId || !isFinite(fromOld) || !isFinite(toOld)) {
          return { executed: false, blocked_reason: "invalid_reallocate_payload" };
        }
        const fromNew = Math.max(1, fromOld + fromDelta);
        const toNew = Math.max(1, toOld + toDelta);
        const r1 = await updateAdsetBudgetUsd(env, fromId, fromNew);
        const r2 = await updateAdsetBudgetUsd(env, toId, toNew);
        return { executed: true, meta_response: { from: r1, to: r2 } };
      }

      case "rotate_creative": {
        if (!decision.ad_id) {
          return { executed: false, blocked_reason: "rotate_needs_ad_id" };
        }
        const resp = await pauseAd(env, decision.ad_id);
        return { executed: true, meta_response: resp };
      }

      default:
        return { executed: false, blocked_reason: "unknown_action_type" };
    }
  } catch (e) {
    return {
      executed: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function logDecision(
  env: Env,
  runId: number,
  decision: Decision,
  result: ExecuteResult
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO decisions
       (run_id, created_at, campaign_id, campaign_name, adset_id, ad_id,
        action_type, action_payload, reasoning, executed, blocked_reason, meta_response)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      runId,
      now,
      decision.campaign_id,
      decision.campaign_name ?? null,
      decision.adset_id ?? null,
      decision.ad_id ?? null,
      decision.action_type,
      JSON.stringify(decision.payload ?? {}),
      decision.reasoning,
      result.executed ? 1 : 0,
      result.blocked_reason ?? result.error ?? null,
      result.meta_response ? JSON.stringify(result.meta_response).slice(0, 2000) : null
    )
    .run();
}
