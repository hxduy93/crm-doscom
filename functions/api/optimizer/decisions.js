/**
 * GET /api/optimizer/decisions
 * Proxy sang Worker fb-ads-auto-agent để UI xem agent vừa làm gì (runs + decisions gần nhất).
 * Cần var OPTIMIZER_WORKER_URL (vd https://fb-ads-auto-agent.<subdomain>.workers.dev).
 * Server-to-server nên không vướng CORS.
 */
import { getIdentity } from "../../lib/access.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const norm = (x) => String(x || "").replace(/^act_/, "");

export async function onRequestGet(context) {
  const { request, env } = context;
  const base = (env.OPTIMIZER_WORKER_URL || "").replace(/\/$/, "");
  if (!base) {
    return json({ ok: false, error: "OPTIMIZER_WORKER_URL chưa cấu hình trên CRM", runs: [], decisions: [] });
  }
  // Cho phép lọc theo 1 tài khoản cụ thể (UI truyền ?account=); mặc định = mọi TK được xem.
  const wanted = norm(new URL(request.url).searchParams.get("account") || "");
  const id = await getIdentity(context);
  try {
    const [runsR, decR] = await Promise.all([
      fetch(`${base}/runs`, { signal: AbortSignal.timeout(15000) }),
      fetch(`${base}/decisions`, { signal: AbortSignal.timeout(15000) }),
    ]);
    let runs = runsR.ok ? await runsR.json().catch(() => []) : [];
    let decisions = decR.ok ? await decR.json().catch(() => []) : [];

    // Lọc theo quyền: run thuộc tài khoản được xem (+ đúng tài khoản đang chọn nếu có).
    const allow = (acct) => {
      const a = norm(acct);
      if (wanted && a !== wanted) return false;
      return id.all === true || id.accounts.includes(a);
    };
    runs = (Array.isArray(runs) ? runs : []).filter((r) => allow(r.ad_account_id));
    const okRunIds = new Set(runs.map((r) => r.id));
    decisions = (Array.isArray(decisions) ? decisions : []).filter((d) => okRunIds.has(d.run_id));

    return json({ ok: true, runs, decisions });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e), runs: [], decisions: [] });
  }
}
