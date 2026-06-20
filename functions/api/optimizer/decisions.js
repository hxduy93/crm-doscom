/**
 * GET /api/optimizer/decisions
 * Proxy sang Worker fb-ads-auto-agent để UI xem agent vừa làm gì (runs + decisions gần nhất).
 * Cần var OPTIMIZER_WORKER_URL (vd https://fb-ads-auto-agent.<subdomain>.workers.dev).
 * Server-to-server nên không vướng CORS.
 */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  const base = (env.OPTIMIZER_WORKER_URL || "").replace(/\/$/, "");
  if (!base) {
    return json({ ok: false, error: "OPTIMIZER_WORKER_URL chưa cấu hình trên CRM", runs: [], decisions: [] });
  }
  try {
    const [runsR, decR] = await Promise.all([
      fetch(`${base}/runs`, { signal: AbortSignal.timeout(15000) }),
      fetch(`${base}/decisions`, { signal: AbortSignal.timeout(15000) }),
    ]);
    const runs = runsR.ok ? await runsR.json().catch(() => []) : [];
    const decisions = decR.ok ? await decR.json().catch(() => []) : [];
    return json({ ok: true, runs, decisions });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e), runs: [], decisions: [] });
  }
}
