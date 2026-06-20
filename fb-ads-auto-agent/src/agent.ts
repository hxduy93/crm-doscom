import type { CampaignInsight, Decision, Env } from "./types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const HAIKU_INPUT_PER_MTOK = 1.0;
const HAIKU_OUTPUT_PER_MTOK = 5.0;

interface AnthropicResponse {
  id: string;
  content: { type: string; text: string }[];
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

export interface AgentResult {
  decisions: Decision[];
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  raw: string;
}

export async function runHaikuDecision(
  env: Env,
  campaigns: CampaignInsight[],
  dailySpendUsd: number
): Promise<AgentResult> {
  const spendCap = Number(env.DAILY_SPEND_CAP_USD);
  const maxDelta = Number(env.MAX_BUDGET_DELTA_PCT);
  const usdVnd = Number(env.USD_VND_RATE) || 25400;
  const userPrompt = buildUserPrompt(
    campaigns,
    dailySpendUsd,
    spendCap,
    maxDelta,
    usdVnd
  );

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic API ${r.status}: ${t.slice(0, 500)}`);
  }
  const j = (await r.json()) as AnthropicResponse;
  const raw = j.content[0]?.text ?? "";
  const decisions = parseDecisions(raw);
  const tokensIn = j.usage.input_tokens;
  const tokensOut = j.usage.output_tokens;
  const cost =
    (tokensIn * HAIKU_INPUT_PER_MTOK + tokensOut * HAIKU_OUTPUT_PER_MTOK) /
    1_000_000;
  return {
    decisions,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: Math.round(cost * 10000) / 10000,
    raw,
  };
}

function parseDecisions(raw: string): Decision[] {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  let parsed: { decisions?: Decision[] };
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error(`Haiku output not JSON: ${text.slice(0, 200)}`);
    }
    parsed = JSON.parse(text.slice(start, end + 1));
  }
  const out = parsed.decisions ?? [];
  for (const d of out) {
    if (!d.campaign_id || !d.action_type || !d.reasoning) {
      throw new Error(`Bad decision shape: ${JSON.stringify(d)}`);
    }
    if (!["low", "medium", "high"].includes(d.importance)) {
      d.importance = "medium";
    }
  }
  return out;
}
