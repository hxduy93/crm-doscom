// GET /api/hermes/alerts
// Cảnh báo nội bộ cho widget Hermes. 2 nguồn:
//   1. Token FB sắp hết hạn (≤2 ngày) — kiểm LIVE bằng FB debug_token (như cũ).
//   2. API key / token / link khác ĐÃ CHẾT/HẾT HẠN — đọc cache health_keys:v1
//      (do GET /api/health/keys ghi, cron tuần làm mới). Không ping lại → nhẹ.
//
// KHÔNG lộ token ra response — chỉ trả số ngày còn lại + ngày hết hạn.
// Cache kết quả FB vào KV INVENTORY 3h để không gọi FB mỗi lần load trang.
//
// Response: { ok, alert: { active, days, expires, invalid, msg } }

const CACHE_KEY = "hermes_alert:fb_token";
const HEALTH_CACHE_KEY = "health_keys:v1";   // do /api/health/keys ghi
const CACHE_TTL = 3 * 3600;   // 3h
const WARN_DAYS = 2;          // báo trước 2 ngày

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Gom các key/link ĐÃ CHẾT/HẾT HẠN từ cache health_keys:v1 (không ping lại — chỉ đọc KV).
// Trả về mảng câu ngắn để chèn thêm vào banner Hermes. Bỏ FB (đã kiểm riêng bên dưới).
async function healthProblemLines(kv) {
  if (!kv) return [];
  try {
    const raw = await kv.get(HEALTH_CACHE_KEY);
    if (!raw) return [];
    const items = (JSON.parse(raw).items) || [];
    const lines = [];
    for (const it of items) {
      if (it.id === "fb_access") continue;                // FB kiểm live riêng, tránh trùng
      if (it.status === "expired" || it.status === "dead") lines.push(`• ${it.label}: KEY/TOKEN đã chết — cần thay.`);
      else if (it.status === "link_down") lines.push(`• ${it.label}: LINK chết — không phản hồi.`);
    }
    return lines;
  } catch { return []; }
}

export async function onRequestGet(context) {
  const { env } = context;
  const kv = env.INVENTORY;

  // Cache FB (tránh gọi FB mỗi lần widget load). Vẫn phải gộp health bên dưới,
  // nên chỉ dùng cache cho phần FB — không return sớm.
  let fbCached = null;
  try {
    if (kv) {
      const c = await kv.get(CACHE_KEY);
      if (c) fbCached = JSON.parse(c);
    }
  } catch { /* ignore */ }

  let payload = fbCached || { ok: true, alert: { active: false } };
  const token = env.FB_ACCESS_TOKEN;

  if (!fbCached && token) {
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

    // Cache phần FB (cả khi không có alert) để khỏi gọi FB liên tục.
    try {
      if (kv) await kv.put(CACHE_KEY, JSON.stringify(payload), { expirationTtl: CACHE_TTL });
    } catch { /* ignore */ }
  }

  // Gộp thêm các key/link khác đã chết (đọc cache health, không tốn ping).
  const extra = await healthProblemLines(kv);
  if (extra.length) {
    const base = payload.alert.active ? payload.alert.msg + "\n" : "⚠️ Có API/token khác gặp sự cố:\n";
    payload = {
      ...payload,
      alert: {
        ...payload.alert,
        active: true,
        msg: base + extra.join("\n"),
      },
    };
  }

  return json(payload);
}
