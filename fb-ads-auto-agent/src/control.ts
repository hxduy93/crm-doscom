import type { Env } from "./types";

// Cấu hình điều khiển agent, do CRM (crm-doscom) quản lý + lưu trong KV của CRM.
// Worker đọc mỗi lần chạy để biết: camp nào được bảo vệ, có đang shadow/killswitch không.
export interface OptimizerControl {
  excluded: string[]; // campaign_id KHÔNG được agent đụng tới
  shadow: boolean;
  killswitch: boolean;
}

const EMPTY: OptimizerControl = { excluded: [], shadow: false, killswitch: false };

export async function fetchControl(env: Env): Promise<OptimizerControl> {
  const base = env.CRM_CONTROL_URL;
  if (!base) return EMPTY;
  const acct = env.AD_ACCOUNT_ID.replace(/^act_/, "");
  try {
    const r = await fetch(`${base}?account=${acct}`, {
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
    // Lỗi mạng → trả rỗng (KHÔNG nới lỏng shadow/killswitch local; index.ts gộp bằng OR).
    return EMPTY;
  }
}
