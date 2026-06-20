import type { Env } from "./types";

// Cấu hình điều khiển agent, do CRM (crm-doscom) quản lý + lưu trong KV của CRM.
// Worker đọc mỗi lần chạy để biết: camp nào được bảo vệ, có đang shadow/killswitch không.
export interface OptimizerControl {
  excluded: string[]; // campaign_id KHÔNG được agent đụng tới
  shadow: boolean;
  killswitch: boolean;
}

const EMPTY: OptimizerControl = { excluded: [], shadow: false, killswitch: false };

// Header để qua Cloudflare Access (service token) + để CRM nhận diện là Worker nội bộ.
function authHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = {};
  if (env.OPTIMIZER_TOKEN) h["X-Internal-Token"] = env.OPTIMIZER_TOKEN;
  if (env.CF_ACCESS_CLIENT_ID) h["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  if (env.CF_ACCESS_CLIENT_SECRET) h["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  return h;
}

// Đọc control của 1 tài khoản. Lỗi mạng → rỗng (index.ts gộp shadow/killswitch local bằng OR).
export async function fetchControl(env: Env, accountId: string): Promise<OptimizerControl> {
  const base = env.CRM_CONTROL_URL;
  if (!base) return EMPTY;
  const acct = accountId.replace(/^act_/, "");
  try {
    const r = await fetch(`${base}?account=${acct}`, {
      headers: authHeaders(env),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return EMPTY;
    const d = (await r.json()) as Partial<OptimizerControl>;
    return {
      excluded: Array.isArray(d.excluded) ? d.excluded.map(String) : [],
      shadow: d.shadow === true,
      killswitch: d.killswitch === true,
    };
  } catch {
    return EMPTY;
  }
}

// Lấy danh sách tài khoản cần tối ưu từ CRM (/api/optimizer/accounts).
// Fallback: env.AD_ACCOUNT_IDS (phẩy) hoặc env.AD_ACCOUNT_ID (1 tài khoản — tương thích cũ).
export async function fetchAccounts(env: Env): Promise<string[]> {
  const fallback = (): string[] => {
    const list = (env.AD_ACCOUNT_IDS || env.AD_ACCOUNT_ID || "")
      .split(",")
      .map((s) => s.trim().replace(/^act_/, ""))
      .filter(Boolean);
    return [...new Set(list)];
  };
  const base = env.CRM_CONTROL_URL;
  if (!base) return fallback();
  // .../api/optimizer/control → .../api/optimizer/accounts
  const url = base.replace(/\/[^/]*$/, "/accounts");
  try {
    const r = await fetch(url, { headers: authHeaders(env), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return fallback();
    const d = (await r.json()) as { accounts?: { id: string }[] };
    const ids = (d.accounts || []).map((a) => String(a.id).replace(/^act_/, "")).filter(Boolean);
    return ids.length ? [...new Set(ids)] : fallback();
  } catch {
    return fallback();
  }
}
