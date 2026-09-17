// crm-doscom-api — cổng ĐỌC dữ liệu CPQC của CRM Doscom cho đồng nghiệp trong công ty.
//
// Vì sao là Worker riêng chứ không phải Pages Function của crm-doscom:
//   crm-doscom.pages.dev nằm sau Cloudflare Access → mọi lời gọi từ script/Google Sheet/
//   Lark của người khác đều bị trả 403. Worker này ở workers.dev, không dính Access, và tự
//   xác thực bằng token riêng cho TỪNG người.
//
// Nguồn dữ liệu: data/dashboard-data.json trên GitHub — CHÍNH file CRM dựng lúc 9h/13h/17h,
// nên số API trả ra khớp số trên CRM.
//
// Secret (wrangler secret put API_TOKENS --name crm-doscom-api):
//   API_TOKENS = JSON {"<tên người/app>": "<token>", ...}. Thu hồi một người = xoá key đó rồi put lại.

import { buildCpqc, parseQuery, GROUPS } from "./cpqc.js";

const SOURCE = "https://raw.githubusercontent.com/hxduy93/crm-doscom/master/data/dashboard-data.json";
const CACHE_SECONDS = 300;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-Api-Key, Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
  });
}

function whoIs(request, env, url) {
  let tokens = {};
  try { tokens = JSON.parse(env.API_TOKENS || "{}"); } catch { return null; }
  const auth = request.headers.get("Authorization") || "";
  const given = (/^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "") : "")
    || request.headers.get("X-Api-Key")
    || url.searchParams.get("key") // cho Google Sheet IMPORTDATA / Power Query không đặt được header
    || "";
  if (!given) return null;
  for (const [name, tok] of Object.entries(tokens)) {
    if (tok && tok === given.trim()) return name;
  }
  return null;
}

async function loadData(ctx) {
  const cache = caches.default;
  const key = new Request(SOURCE);
  let res = await cache.match(key);
  if (!res) {
    const r = await fetch(SOURCE, { cf: { cacheTtl: 0 } });
    if (!r.ok) throw new Error(`Không tải được dữ liệu nguồn (HTTP ${r.status})`);
    res = new Response(await r.text(), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_SECONDS}` },
    });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res.json();
}

function toCsv(rows) {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json({ ok: false, error: "Chỉ hỗ trợ GET" }, 405);

    if (url.pathname === "/" || url.pathname === "/v1") {
      return json({
        ok: true,
        name: "crm-doscom-api",
        endpoints: {
          "GET /v1/cpqc": "Chi phí quảng cáo theo nhân sự/sản phẩm/kênh/campaign — cần token",
          "GET /v1/health": "Kiểm tra dữ liệu mới nhất — không cần token",
        },
        auth: "Header 'Authorization: Bearer <token>' (hoặc 'X-Api-Key: <token>', hoặc ?key=<token>)",
        params: { from: "YYYY-MM-DD (mặc định đầu tháng)", to: "YYYY-MM-DD (mặc định hôm nay)", group: GROUPS, channel: ["all", "facebook", "google"], market: ["vn", "th", "all"], format: ["json", "csv"] },
      });
    }

    if (url.pathname === "/v1/health") {
      try {
        const data = await loadData(ctx);
        return json({ ok: true, data_generated_at: data.generated_at, google_ads_until: data.google_ads?.date_range?.end || null });
      } catch (e) {
        return json({ ok: false, error: String(e.message || e) }, 502);
      }
    }

    if (url.pathname !== "/v1/cpqc") return json({ ok: false, error: "Không có endpoint này. Xem GET /" }, 404);

    const client = whoIs(request, env, url);
    if (!client) return json({ ok: false, error: "unauthorized — thiếu hoặc sai token" }, 401);

    const q = parseQuery(url.searchParams);
    if (q.errors.length) return json({ ok: false, error: q.errors.join("; ") }, 400);

    let data;
    try { data = await loadData(ctx); }
    catch (e) { return json({ ok: false, error: String(e.message || e) }, 502); }

    const { totals, rows } = buildCpqc(data, q);
    if ((url.searchParams.get("format") || "").toLowerCase() === "csv") {
      return new Response(toCsv(rows), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", ...CORS },
      });
    }
    return json({
      ok: true,
      client,
      data_generated_at: data.generated_at,
      google_ads_until: data.google_ads?.date_range?.end || null,
      currency: "VND",
      range: { from: q.from, to: q.to },
      group: q.group, channel: q.channel, market: q.market,
      totals,
      count: rows.length,
      rows,
    });
  },
};
