// GET /api/export/fb-ad-spend
// Cổng EXPORT chi phí quảng cáo Facebook (account × ngày) cho app đối tác
// (repo doscomvietnam/facebook-data-sync → Lark Base). Đối tác tự KÉO (pull) định kỳ.
//
// Xác thực (BẮT BUỘC — endpoint expose dữ liệu):
//   Authorization: Bearer <FB_EXPORT_TOKEN>     (khuyến nghị)
//   hoặc  X-Export-Token: <FB_EXPORT_TOKEN>
//
// Query params:
//   from, to : YYYY-MM-DD (mặc định: 30 ngày gần nhất tính tới hôm nay giờ VN)
//   level    : "account" (mặc định) | "campaign"
//
// Nguồn dữ liệu: raw GitHub repo dashboard cũ (PUBLIC, không qua Cloudflare Access) —
// đồng nhất với data CRM đang dùng. Override bằng env FB_DATA_SOURCE_URL nếu cần.
//
// Trả JSON: { ok, source, generated_at, currency, range, level, count, rows[] }
//   rows (account): { unique_key, date, account_id, account_name, spend, impressions, clicks, currency }
//   rows (campaign): + campaign_id, campaign_name
//   unique_key = `${date}_${account_id}` (account) / `${date}_${campaign_id}` (campaign) — để đối tác dedup.

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/hxduy93/facebook-ads-dashboard/main/data/fb-ads-data.json";
const CACHE_KEY = "fb_export:v1:src";
const CACHE_TTL = 600; // 10 phút — tránh refetch GitHub mỗi lần kéo

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-Export-Token, Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
  });
}

function vnToday() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

// Pure: gộp campaigns[].by_date thành các dòng account×ngày (hoặc campaign×ngày). Tách riêng để test.
export function buildRows(data, from, to, level) {
  const currency = (data && data.currency) || "VND";
  const accounts = Array.isArray(data && data.accounts) ? data.accounts : [];
  const inR = (d) => d >= from && d <= to;
  const rows = [];
  for (const a of accounts) {
    const accId = String(a.account_id || "").replace(/^act_/, "");
    const accName = a.account_name || accId;
    if (level === "campaign") {
      for (const c of a.campaigns || []) {
        const bd = c.by_date || {};
        for (const date in bd) {
          if (!inR(date)) continue;
          const r = bd[date] || {};
          rows.push({
            unique_key: `${date}_${c.campaign_id}`,
            date,
            account_id: accId,
            account_name: accName,
            campaign_id: String(c.campaign_id || ""),
            campaign_name: c.campaign_name || "",
            spend: Math.round(Number(r.spend) || 0),
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
            currency,
          });
        }
      }
    } else {
      const byDate = {};
      for (const c of a.campaigns || []) {
        const bd = c.by_date || {};
        for (const date in bd) {
          if (!inR(date)) continue;
          const r = bd[date] || {};
          const t = byDate[date] || (byDate[date] = { spend: 0, impressions: 0, clicks: 0 });
          t.spend += Number(r.spend) || 0;
          t.impressions += Number(r.impressions) || 0;
          t.clicks += Number(r.clicks) || 0;
        }
      }
      for (const date of Object.keys(byDate).sort()) {
        const t = byDate[date];
        rows.push({
          unique_key: `${date}_${accId}`,
          date,
          account_id: accId,
          account_name: accName,
          spend: Math.round(t.spend),
          impressions: t.impressions,
          clicks: t.clicks,
          currency,
        });
      }
    }
  }
  rows.sort((x, y) =>
    x.date < y.date ? -1 : x.date > y.date ? 1 : String(x.unique_key).localeCompare(String(y.unique_key))
  );
  return { currency, rows };
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // --- auth ---
  const need = env.FB_EXPORT_TOKEN;
  if (!need) return json({ ok: false, error: "FB_EXPORT_TOKEN chưa cấu hình trên Cloudflare env" }, 500);
  const auth = request.headers.get("Authorization") || "";
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
  const token = bearer || request.headers.get("X-Export-Token") || "";
  if (token !== need) return json({ ok: false, error: "unauthorized" }, 401);

  // --- params ---
  const url = new URL(request.url);
  let to = url.searchParams.get("to");
  let from = url.searchParams.get("from");
  if (!isYmd(to)) to = vnToday();
  if (!isYmd(from)) from = addDays(to, -29);
  if (from > to) { const t = from; from = to; to = t; }
  const level = (url.searchParams.get("level") || "account").toLowerCase() === "campaign" ? "campaign" : "account";

  // --- nguồn dữ liệu (cache KV) ---
  const srcUrl = env.FB_DATA_SOURCE_URL || DEFAULT_SOURCE;
  const kv = env.INVENTORY;
  let data = null;
  try {
    if (kv) { const cached = await kv.get(CACHE_KEY); if (cached) data = JSON.parse(cached); }
  } catch (_) {}
  if (!data) {
    let r;
    try {
      r = await fetch(srcUrl, { headers: { "User-Agent": "crm-doscom-export" } });
    } catch (e) {
      return json({ ok: false, error: "fetch source failed: " + (e && e.message) }, 502);
    }
    if (!r.ok) return json({ ok: false, error: `fetch source HTTP ${r.status}` }, 502);
    data = await r.json();
    try { if (kv) await kv.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL }); } catch (_) {}
  }

  const { currency, rows } = buildRows(data, from, to, level);
  return json({
    ok: true,
    source: "facebookadsallinone/data/fb-ads-data.json",
    generated_at: (data && data.generated_at) || null,
    currency,
    range: { from, to },
    level,
    count: rows.length,
    rows,
  });
}
