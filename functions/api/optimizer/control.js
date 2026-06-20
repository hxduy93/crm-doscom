/**
 * Cấu hình điều khiển agent tối ưu (đọc bởi Worker fb-ads-auto-agent mỗi lần chạy).
 *   GET  /api/optimizer/control?account=927390616363424
 *        → { excluded:[campaign_id...], shadow, killswitch, ... }
 *   POST /api/optimizer/control?account=...   (ghi — cần header X-Optimizer-Token)
 *        body { excluded:[], shadow:bool, killswitch:bool }
 *
 * Lưu trong KV INVENTORY, key = optimizer_control_<account>.
 * Mặc định khi chưa cấu hình: shadow=true (an toàn — agent chỉ ghi log, không thực thi).
 */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const keyOf = (acct) => `optimizer_control_${acct}`;
const DEFAULTS = { excluded: [], shadow: true, killswitch: false };

function acctOf(request) {
  return String(new URL(request.url).searchParams.get("account") || "").replace(/^act_/, "");
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const acct = acctOf(request);
  if (!acct) return json({ ok: false, error: "Thiếu ?account=" }, 400);
  let ctrl = { ...DEFAULTS };
  try {
    const raw = await env.INVENTORY.get(keyOf(acct));
    if (raw) ctrl = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (_) {}
  // Trả thẳng các field control (Worker đọc) + ok/account cho UI.
  return json({ ...ctrl, ok: true, account: acct });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.OPTIMIZER_TOKEN || request.headers.get("X-Optimizer-Token") !== env.OPTIMIZER_TOKEN) {
    return json({ ok: false, error: "unauthorized — sai/thiếu X-Optimizer-Token" }, 401);
  }
  const acct = acctOf(request);
  if (!acct) return json({ ok: false, error: "Thiếu ?account=" }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }

  const ctrl = {
    excluded: Array.isArray(body.excluded) ? [...new Set(body.excluded.map(String))] : [],
    shadow: body.shadow === true,
    killswitch: body.killswitch === true,
    updated_at: new Date().toISOString(),
  };
  await env.INVENTORY.put(keyOf(acct), JSON.stringify(ctrl));
  return json({ ...ctrl, ok: true, account: acct });
}
