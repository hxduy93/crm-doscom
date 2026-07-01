// GET /api/health/keys — thống kê sức khỏe toàn bộ API key / token / link CRM đang dùng.
//
//   ?refresh=1  → bỏ qua cache, quét LIVE (cron tuần + nút "Quét lại" dùng cái này).
//   (mặc định)  → trả cache KV (TTL 6h) để F5 trang không ping lại tất cả dịch vụ.
//
// Response: { ok, checkedAt, items:[…], summary:{…}, alert:{active,msg}, cached? }
// KHÔNG lộ giá trị secret — xem functions/lib/keyHealth.js.

import { scanAll, summarize, buildAlertMessage } from "../../lib/keyHealth.js";

const CACHE_KEY = "health_keys:v1";
const CACHE_TTL = 6 * 3600; // 6h

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const kv = env.INVENTORY;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  // 1. Cache (trừ khi ép refresh)
  if (!refresh && kv) {
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached) return json({ ...JSON.parse(cached), cached: true });
    } catch { /* cache hỏng → quét lại */ }
  }

  // 2. Quét live
  let items;
  try {
    items = await scanAll(env);
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
  }

  const summary = summarize(items);
  const alertMsg = buildAlertMessage(items);
  const payload = {
    ok: true,
    checkedAt: new Date().toISOString(),
    items,
    summary,
    alert: alertMsg ? { active: true, msg: alertMsg } : { active: false },
  };

  // 3. Ghi cache (cả khi không có vấn đề — để widget Hermes/UI đọc nhanh)
  try {
    if (kv) await kv.put(CACHE_KEY, JSON.stringify(payload), { expirationTtl: CACHE_TTL });
  } catch { /* KV lỗi → vẫn trả kết quả */ }

  return json(payload);
}
