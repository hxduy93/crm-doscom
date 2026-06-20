import type { AdInsight, AdsetInsight, CampaignInsight, Env } from "./types";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

async function graphGet<T>(
  path: string,
  token: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  const j = (await r.json()) as { error?: { message: string } } & T;
  if (!r.ok || (j as { error?: { message: string } }).error) {
    throw new Error(
      `Meta GET ${path}: ${
        (j as { error?: { message: string } }).error?.message ?? r.status
      }`
    );
  }
  return j;
}

async function graphPost<T>(
  path: string,
  token: string,
  body: Record<string, string>
): Promise<T> {
  const r = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, access_token: token }).toString(),
  });
  const j = (await r.json()) as { error?: { message: string } } & T;
  if (!r.ok || (j as { error?: { message: string } }).error) {
    throw new Error(
      `Meta POST ${path}: ${
        (j as { error?: { message: string } }).error?.message ?? r.status
      }`
    );
  }
  return j;
}

interface MetaPaged<T> {
  data: T[];
  paging?: { next?: string };
}

async function graphGetAll<T>(
  path: string,
  token: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${GRAPH_BASE}${path}`;
  let p: Record<string, string> | null = { ...params, access_token: token };
  while (url) {
    const reqUrl = p
      ? `${url}?${new URLSearchParams(p).toString()}`
      : url;
    const r = await fetch(reqUrl);
    const j = (await r.json()) as MetaPaged<T> & { error?: { message: string } };
    if (!r.ok || j.error) {
      throw new Error(`Meta paged ${path}: ${j.error?.message ?? r.status}`);
    }
    out.push(...j.data);
    url = j.paging?.next ?? null;
    p = null;
  }
  return out;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface MetaAdset {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
  campaign_id: string;
}

interface MetaAd {
  id: string;
  name: string;
  status: string;
  adset_id: string;
  creative?: { id: string };
}

interface MetaInsight {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  date_start?: string;
  date_stop?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
}

function pickConversions(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  const types = ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase", "lead", "offsite_conversion.fb_pixel_lead"];
  let n = 0;
  for (const a of actions) if (types.includes(a.action_type)) n += Number(a.value) || 0;
  return n;
}

function pickRevenue(values?: { action_type: string; value: string }[]): number {
  if (!values) return 0;
  let v = 0;
  for (const a of values) if (a.action_type.includes("purchase")) v += Number(a.value) || 0;
  return v;
}

export async function fetchCampaignInsights(
  env: Env,
  daysBack = 7
): Promise<CampaignInsight[]> {
  const token = env.FB_ACCESS_TOKEN;
  const acct = env.AD_ACCOUNT_ID.startsWith("act_")
    ? env.AD_ACCOUNT_ID
    : `act_${env.AD_ACCOUNT_ID}`;
  const usdVnd = Number(env.USD_VND_RATE) || 25400;
  const datePreset = daysBack <= 7 ? "last_7d" : "last_14d";

  // --- Cấu trúc tài khoản: 3 lời gọi (phân trang), KHÔNG phụ thuộc số lượng ---
  const campaigns = await graphGetAll<MetaCampaign>(
    `/${acct}/campaigns`,
    token,
    {
      fields: "id,name,status,objective,daily_budget,lifetime_budget",
      effective_status: '["ACTIVE","PAUSED"]',
      limit: "200",
    }
  );
  const adsetsAll = await graphGetAll<MetaAdset>(`/${acct}/adsets`, token, {
    fields: "id,name,status,daily_budget,campaign_id",
    effective_status: '["ACTIVE","PAUSED"]',
    limit: "200",
  });
  const adsAll = await graphGetAll<MetaAd>(`/${acct}/ads`, token, {
    fields: "id,name,status,adset_id,creative{id}",
    effective_status: '["ACTIVE","PAUSED"]',
    limit: "200",
  });

  // --- Insights gom theo account ở 3 cấp: 3 lời gọi (phân trang) ---
  // Trước đây mỗi campaign/adset/ad gọi /insights riêng (N+1) → dễ vượt giới hạn
  // 50 subrequest của Workers Free tier. Giờ tổng cộng cố định 6 lời gọi.
  const campInsights = await graphGetAll<MetaInsight>(`/${acct}/insights`, token, {
    fields: "spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,campaign_id",
    date_preset: datePreset,
    level: "campaign",
    limit: "500",
  });
  const adsetInsights = await graphGetAll<MetaInsight>(`/${acct}/insights`, token, {
    fields: "spend,impressions,clicks,ctr,actions,adset_id",
    date_preset: datePreset,
    level: "adset",
    limit: "500",
  });
  const adInsights = await graphGetAll<MetaInsight>(`/${acct}/insights`, token, {
    fields: "spend,impressions,ctr,frequency,actions,ad_id",
    date_preset: datePreset,
    level: "ad",
    limit: "500",
  });

  const campInsById = new Map<string, MetaInsight>();
  for (const i of campInsights) if (i.campaign_id) campInsById.set(i.campaign_id, i);
  const adsetInsById = new Map<string, MetaInsight>();
  for (const i of adsetInsights) if (i.adset_id) adsetInsById.set(i.adset_id, i);
  const adInsById = new Map<string, MetaInsight>();
  for (const i of adInsights) if (i.ad_id) adInsById.set(i.ad_id, i);

  const adsetsByCampaign = new Map<string, MetaAdset[]>();
  for (const s of adsetsAll) {
    if (s.status !== "ACTIVE") continue;
    const arr = adsetsByCampaign.get(s.campaign_id) ?? [];
    arr.push(s);
    adsetsByCampaign.set(s.campaign_id, arr);
  }
  const adsByAdset = new Map<string, MetaAd[]>();
  for (const a of adsAll) {
    if (a.status !== "ACTIVE") continue;
    const arr = adsByAdset.get(a.adset_id) ?? [];
    arr.push(a);
    adsByAdset.set(a.adset_id, arr);
  }

  const out: CampaignInsight[] = [];
  for (const c of campaigns) {
    if (c.status !== "ACTIVE") continue;

    const cIns = campInsById.get(c.id) ?? {};

    const adsetOut: AdsetInsight[] = [];
    for (const s of adsetsByCampaign.get(c.id) ?? []) {
      const sIns = adsetInsById.get(s.id) ?? {};

      const adOut: AdInsight[] = [];
      for (const a of adsByAdset.get(s.id) ?? []) {
        const aIns = adInsById.get(a.id) ?? {};
        const spendVnd = Number(aIns.spend) || 0;
        const spendUsd = spendVnd / usdVnd;
        const conv = pickConversions(aIns.actions);
        adOut.push({
          ad_id: a.id,
          ad_name: a.name,
          status: a.status,
          creative_id: a.creative?.id ?? "",
          spend_usd: round2(spendUsd),
          impressions: Number(aIns.impressions) || 0,
          ctr: Number(aIns.ctr) || 0,
          conversions: conv,
          cpa_usd: conv > 0 ? round2(spendUsd / conv) : 0,
          frequency: Number(aIns.frequency) || 0,
        });
      }

      const sSpendVnd = Number(sIns.spend) || 0;
      const sSpendUsd = sSpendVnd / usdVnd;
      const sConv = pickConversions(sIns.actions);
      adsetOut.push({
        adset_id: s.id,
        adset_name: s.name,
        status: s.status,
        daily_budget_cents: Number(s.daily_budget) || 0,
        spend_usd: round2(sSpendUsd),
        impressions: Number(sIns.impressions) || 0,
        clicks: Number(sIns.clicks) || 0,
        ctr: Number(sIns.ctr) || 0,
        conversions: sConv,
        cpa_usd: sConv > 0 ? round2(sSpendUsd / sConv) : 0,
        ads: adOut,
      });
    }

    const cSpendVnd = Number(cIns.spend) || 0;
    const cSpendUsd = cSpendVnd / usdVnd;
    const cConv = pickConversions(cIns.actions);
    const cRev = pickRevenue(cIns.action_values) / usdVnd;
    out.push({
      campaign_id: c.id,
      campaign_name: c.name,
      objective: c.objective,
      status: c.status,
      daily_budget_cents: Number(c.daily_budget) || 0,
      lifetime_budget_cents: Number(c.lifetime_budget) || 0,
      spend_usd: round2(cSpendUsd),
      impressions: Number(cIns.impressions) || 0,
      clicks: Number(cIns.clicks) || 0,
      ctr: Number(cIns.ctr) || 0,
      cpc_usd: Number(cIns.cpc) ? round2(Number(cIns.cpc) / usdVnd) : 0,
      cpm_usd: Number(cIns.cpm) ? round2(Number(cIns.cpm) / usdVnd) : 0,
      conversions: cConv,
      cpa_usd: cConv > 0 ? round2(cSpendUsd / cConv) : 0,
      roas: cSpendUsd > 0 ? round2(cRev / cSpendUsd) : 0,
      days: daysBack,
      adsets: adsetOut,
    });
  }
  return out;
}

export async function fetchTodaySpendUsd(env: Env): Promise<number> {
  const token = env.FB_ACCESS_TOKEN;
  const acct = env.AD_ACCOUNT_ID.startsWith("act_")
    ? env.AD_ACCOUNT_ID
    : `act_${env.AD_ACCOUNT_ID}`;
  const usdVnd = Number(env.USD_VND_RATE) || 25400;

  const ins = await graphGetAll<MetaInsight>(
    `/${acct}/insights`,
    token,
    {
      fields: "spend",
      date_preset: "today",
      level: "account",
    }
  );
  const vnd = Number(ins[0]?.spend) || 0;
  return round2(vnd / usdVnd);
}

export async function pauseCampaign(env: Env, campaignId: string) {
  return graphPost<{ success: boolean }>(`/${campaignId}`, env.FB_ACCESS_TOKEN, {
    status: "PAUSED",
  });
}

// Nhân bản 1 nhóm QC (kèm các quảng cáo bên trong) để scale nhóm đang chạy tốt.
// statusActive=true → bản sao chạy ngay; false → tạo ở PAUSED.
export async function copyAdset(env: Env, adsetId: string, statusActive: boolean) {
  return graphPost<{ copied_adset_id?: string; ad_object_ids?: unknown }>(
    `/${adsetId}/copies`,
    env.FB_ACCESS_TOKEN,
    {
      deep_copy: "true",
      status_option: statusActive ? "ACTIVE" : "PAUSED",
    }
  );
}

export async function pauseAdset(env: Env, adsetId: string) {
  return graphPost<{ success: boolean }>(`/${adsetId}`, env.FB_ACCESS_TOKEN, {
    status: "PAUSED",
  });
}

export async function pauseAd(env: Env, adId: string) {
  return graphPost<{ success: boolean }>(`/${adId}`, env.FB_ACCESS_TOKEN, {
    status: "PAUSED",
  });
}

export async function updateCampaignBudgetUsd(
  env: Env,
  campaignId: string,
  newBudgetUsd: number
) {
  const usdVnd = Number(env.USD_VND_RATE) || 25400;
  const newDailyVnd = Math.round(newBudgetUsd * usdVnd);
  return graphPost<{ success: boolean }>(`/${campaignId}`, env.FB_ACCESS_TOKEN, {
    daily_budget: String(newDailyVnd),
  });
}

export async function updateAdsetBudgetUsd(
  env: Env,
  adsetId: string,
  newBudgetUsd: number
) {
  const usdVnd = Number(env.USD_VND_RATE) || 25400;
  const newDailyVnd = Math.round(newBudgetUsd * usdVnd);
  return graphPost<{ success: boolean }>(`/${adsetId}`, env.FB_ACCESS_TOKEN, {
    daily_budget: String(newDailyVnd),
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Check token expiry via /debug_token endpoint.
// Returns days until expiry. null = never expires (System User token).
// Throws if token is invalid or revoked.
export async function checkTokenExpiry(env: Env): Promise<{
  days_until_expiry: number | null;
  expires_at_iso: string | null;
  is_valid: boolean;
  scopes: string[];
}> {
  const token = env.FB_ACCESS_TOKEN;
  const url = new URL(`${GRAPH_BASE}/debug_token`);
  url.searchParams.set("input_token", token);
  url.searchParams.set("access_token", token);

  const r = await fetch(url.toString());
  const j = (await r.json()) as {
    data?: {
      is_valid: boolean;
      expires_at: number;
      data_access_expires_at?: number;
      scopes: string[];
      error?: { message: string };
    };
    error?: { message: string };
  };
  if (!r.ok || j.error || !j.data) {
    throw new Error(`Token debug failed: ${j.error?.message ?? r.status}`);
  }
  const d = j.data;
  if (!d.is_valid) {
    throw new Error(`Token invalid: ${d.error?.message ?? "unknown"}`);
  }
  const expiresAt = d.expires_at;
  if (!expiresAt || expiresAt === 0) {
    return {
      days_until_expiry: null,
      expires_at_iso: null,
      is_valid: true,
      scopes: d.scopes,
    };
  }
  const now = Math.floor(Date.now() / 1000);
  const days = Math.floor((expiresAt - now) / 86400);
  return {
    days_until_expiry: days,
    expires_at_iso: new Date(expiresAt * 1000).toISOString(),
    is_valid: true,
    scopes: d.scopes,
  };
}

export { graphGet, graphPost };
