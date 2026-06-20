/**
 * GET /api/optimizer/campaigns?account=927390616363424
 * Liệt kê campaign (ACTIVE+PAUSED) của 1 ad account để UI "Tối ưu & Bảo vệ" tick chọn
 * camp không cho agent chỉnh sửa. Dùng env.FB_ACCESS_TOKEN của CRM.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = env.FB_ACCESS_TOKEN;
  if (!token) return json({ ok: false, error: "FB_ACCESS_TOKEN chưa cấu hình trên CRM" }, 500);

  const acct = String(new URL(request.url).searchParams.get("account") || "").replace(/^act_/, "");
  if (!acct) return json({ ok: false, error: "Thiếu ?account=" }, 400);

  try {
    const p = new URLSearchParams({
      fields: "id,name,status,effective_status,daily_budget",
      effective_status: '["ACTIVE","PAUSED"]',
      limit: "200",
      access_token: token,
    });
    const out = [];
    let next = `${GRAPH}/act_${acct}/campaigns?${p}`;
    let guard = 0;
    while (next && guard++ < 20) {
      const r = await fetch(next, { signal: AbortSignal.timeout(20000) });
      const d = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
      if (!r.ok || d.error) throw new Error(d.error?.message || `HTTP ${r.status}`);
      out.push(...(d.data || []));
      next = d.paging?.next || null;
    }
    return json({ ok: true, account: acct, campaigns: out });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}
