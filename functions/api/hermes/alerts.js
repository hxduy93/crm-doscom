// GET /api/hermes/alerts
// Cảnh báo nội bộ cho widget Hermes. Hiện chỉ 1 loại: token FB sắp hết hạn (≤2 ngày).
//
// Kiểm hạn token bằng FB debug_token trên env.FB_ACCESS_TOKEN (token CRM đang dùng để
// tạo ads). KHÔNG lộ token ra response — chỉ trả số ngày còn lại + ngày hết hạn.
// Cache kết quả vào KV INVENTORY 3h để không gọi FB mỗi lần load trang.
//
// Response: { ok, alert: { active, days, expires, invalid, msg } }

const CACHE_KEY = "hermes_alert:fb_token";
const CACHE_TTL = 3 * 3600;   // 3h
const WARN_DAYS = 2;          // báo trước 2 ngày

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  const kv = env.INVENTORY;

  // 1. Cache (tránh gọi FB mỗi lần widget load)
  try {
    if (kv) {
      const cached = await kv.get(CACHE_KEY);
      if (cached) return json(JSON.parse(cached));
    }
  } catch { /* ignore */ }

  let payload = { ok: true, alert: { active: false } };
  const token = env.FB_ACCESS_TOKEN;

  if (token) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(15000) }
      );
      const d = (await r.json())?.data || {};
      const exp = d.expires_at || 0;            // 0 = không hết hạn (System User token)
      const now = Math.floor(Date.now() / 1000);
      const invalid = d.is_valid === false;
      const days = exp ? (exp - now) / 86400 : null;   // null = vĩnh viễn

      if (invalid || (days !== null && days <= WARN_DAYS)) {
        const expStr = exp ? new Date(exp * 1000).toISOString().slice(0, 10) : "—";
        const dRound = days !== null ? Math.max(0, Math.round(days)) : 0;
        payload.alert = {
          active: true,
          days: dRound,
          expires: expStr,
          invalid,
          msg: invalid
            ? "⚠️ Token Facebook đã HẾT HẠN — số liệu quảng cáo sẽ ngừng cập nhật. Cần làm mới token NGAY."
            : `⚠️ Token Facebook còn ${dRound} ngày (hết hạn ${expStr}). Làm mới sớm để dashboard/Hermes không gián đoạn.`,
        };
      }
    } catch { /* lỗi mạng → không cảnh báo sai, coi như không có alert */ }
  }

  // Cache cả khi không có alert (để khỏi gọi FB liên tục)
  try {
    if (kv) await kv.put(CACHE_KEY, JSON.stringify(payload), { expirationTtl: CACHE_TTL });
  } catch { /* ignore */ }

  return json(payload);
}
