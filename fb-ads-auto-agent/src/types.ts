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
  // Email cảnh báo qua Resend (https://resend.com). RESEND_API_KEY là secret.
  // NOTIFY_FROM: địa chỉ gửi đã verify domain trên Resend; nếu trống dùng
  // onboarding@resend.dev (chỉ gửi được tới chính email chủ tài khoản Resend).
  RESEND_API_KEY: string;
  NOTIFY_FROM: string;
  // URL endpoint điều khiển trên CRM (danh sách bảo vệ + shadow + killswitch).
  // vd: https://crm-doscom.pages.dev/api/optimizer/control
  CRM_CONTROL_URL: string;
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
  | "duplicate_adset"
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
  // Số liệu THẬT đọc từ Meta trong run này — guardrail dùng để đối chiếu,
  // không tin các con số do LLM tự khai trong payload.
  campaigns?: CampaignInsight[];
}
