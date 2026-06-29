// GET /api/clarity/insights?days=3&refresh=0
// Lấy chỉ số UX từ Microsoft Clarity Data Export API (project NOMA, id xczl125ty0),
// tách theo URL từng landing (dimension1=URL).
//
// RED LINES tuân thủ:
//  - Secret qua env.CLARITY_API_TOKEN (KHÔNG hard-code).
//  - Cache KV (env.INVENTORY) theo ngày VN — Clarity giới hạn 10 lần gọi/ngày,
//    nên F5 nhiều lần trong ngày KHÔNG gọi lại upstream (tránh cạn quota).
//  - KHÔNG bịa số: thiếu token / lỗi upstream -> trả ok:false để UI báo, không chế số.
//
// Clarity chỉ cho kéo SỐ LIỆU (phiên, scroll, rage/dead click...), KHÔNG có ảnh heatmap.
// Ảnh heatmap trực quan xem trực tiếp trên dashboard Clarity (UI có nút deep-link).

const CLARITY_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function vnNow() { return new Date(Date.now() + 7 * 3600 * 1000); }
function vnDateStr() { return vnNow().toISOString().slice(0, 10); }

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.CLARITY_API_TOKEN) {
    return json({
      ok: false,
      error: "missing_token",
      hint: "Chưa set secret CLARITY_API_TOKEN cho project crm-doscom. Lấy token ở Clarity > Settings > Data Export > Generate new API token.",
    });
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "3", 10) || 3, 1), 3);
  const refresh = url.searchParams.get("refresh") === "1";
  const cacheKey = `clarity:insights:${vnDateStr()}:d${days}`;

  // Đọc cache trước (trừ khi ép refresh)
  if (env.INVENTORY && !refresh) {
    const cached = await env.INVENTORY.get(cacheKey);
    if (cached) {
      try { const o = JSON.parse(cached); o.cached = true; return json(o); } catch { /* fall through */ }
    }
  }

  let raw;
  try {
    const r = await fetch(`${CLARITY_URL}?numOfDays=${days}&dimension1=URL`, {
      headers: { Authorization: `Bearer ${env.CLARITY_API_TOKEN}` },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      // 429 = đã hết 10 lần/ngày: cố trả cache cũ (nếu có) để UI vẫn xem được số gần nhất.
      if (env.INVENTORY) {
        const stale = await env.INVENTORY.get(cacheKey);
        if (stale) { try { const o = JSON.parse(stale); o.cached = true; o.stale = true; return json(o); } catch {} }
      }
      return json({ ok: false, error: `clarity_http_${r.status}`, detail: body.slice(0, 300) });
    }
    raw = await r.json();
  } catch (e) {
    return json({ ok: false, error: "fetch_failed", detail: String(e?.message || e).slice(0, 200) });
  }

  const out = { ok: true, days, fetchedAt: vnNow().toISOString(), metrics: raw, cached: false };
  if (env.INVENTORY) {
    try { await env.INVENTORY.put(cacheKey, JSON.stringify(out), { expirationTtl: 6 * 3600 }); } catch { /* ignore cache write fail */ }
  }
  return json(out);
}
