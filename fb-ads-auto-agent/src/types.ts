export interface Env {
  DB: D1Database;
  AGENT_KV: KVNamespace;
  AD_ACCOUNT_ID: string;
  DAILY_SPEND_CAP_USD: string;
  MAX_BUDGET_DELTA_PCT: string;
  USD_VND_RATE: string;
  NOTIFY_EMAIL: string;
  MIN_SPEND_PER_CAMPAIGN_USD: string;
  SHADOW_MODE: string;
  FB_ACCESS_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  GMAIL_APP_PASSWORD: string;
}

export interface CampaignInsight {
  campaign_id: string;
  campaign_name: string;
  objective: string;
  status: string;
  daily_budget_cents: number;
  lifetime_budget_cents: number;
  spend_usd: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc_usd: number;
  cpm_usd: number;
  conversions: number;
  cpa_usd: number;
  roas: number;
  days: number;
  adsets: AdsetInsight[];
}

export interface AdsetInsight {
  adset_id: string;
  adset_name: string;
  status: string;
  daily_budget_cents: number;
  spend_usd: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa_usd: number;
  ads: AdInsight[];
}

export interface AdInsight {
  ad_id: string;
  ad_name: string;
  status: string;
  creative_id: string;
  spend_usd: number;
  impressions: number;
  ctr: number;
  conversions: number;
  cpa_usd: number;
  frequency: number;
}

export type ActionType =
  | "pause"
  | "scale_budget"
  | "reallocate"
  | "rotate_creative"
  | "noop";

export interface Decision {
  campaign_id: string;
  campaign_name?: string;
  adset_id?: string;
  ad_id?: string;
  action_type: ActionType;
  payload: Record<string, unknown>;
  reasoning: string;
  importance: "low" | "medium" | "high";
}

export interface GuardrailResult {
  allowed: boolean;
  blocked_reason?: string;
}

export interface RunContext {
  run_id: number;
  started_at: string;
  daily_spend_usd: number;
  shadow_mode: boolean;
}
