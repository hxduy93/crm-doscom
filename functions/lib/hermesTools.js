// Hermes tool registry — v1 chỉ tool READ-ONLY.
// Mỗi tool có { name, description, input_schema, handler }.
// Handler nhận (input, ctx) với ctx = { env, origin, cookieHeader, userEmail }.
//
// Port từ facebookadsallinone (2026-06-24): dùng lại fbAdsHelpers.js có sẵn của CRM,
// đọc /data/*.json trực tiếp thay vì gọi /api/* nội bộ (tránh drop cookie giữa các
// Pages Function call). Static /data/*.json không cần auth → đọc ổn định.
// get_geo_queue đọc field `items` (shape của /api/geo/queue bên CRM, khác `articles`).

import {
  resolveTimeRange,
  compactFbCampaigns,
  compactFbAccounts,
  compactFbOrdersInRange,
  computeFbProfitInRange,
  STAFF_TO_SOURCE_GROUP,
} from "./fbAdsHelpers.js";

// Nguồn data: raw GitHub repo facebook-ads-dashboard (CÔNG KHAI — KHÔNG qua Cloudflare Access).
// Lý do: crm-doscom.pages.dev đã bật Access → subrequest nội bộ tới /data/*.json bị chặn,
// tool nhận rỗng → trả 0. Raw GitHub là source-of-truth của fb-ads-data (auto-sync) và public.
// Pattern + KV cache giống functions/api/export/fb-ad-spend.js.
const RAW_DATA_BASE = "https://raw.githubusercontent.com/hxduy93/facebook-ads-dashboard/main/data";
const DATA_CACHE_TTL = 600; // 10 phút — tránh refetch GitHub mỗi tool call

// path dạng "/data/<file>.json". Thử KV cache → raw GitHub → fallback /data local (forward cookie).
async function fetchData(ctx, path) {
  const file = String(path).replace(/^\/data\//, "");
  const kv = ctx.env?.INVENTORY;
  const cacheKey = `hermes_data:v1:${file}`;

  // 1. KV cache
  try { if (kv) { const c = await kv.get(cacheKey); if (c) return JSON.parse(c); } } catch { /* ignore */ }

  // 2. Raw GitHub (public, không qua Access)
  try {
    const r = await fetch(`${RAW_DATA_BASE}/${file}`, { headers: { "User-Agent": "crm-doscom-hermes" } });
    if (r.ok) {
      const data = await r.json();
      try { if (kv) await kv.put(cacheKey, JSON.stringify(data), { expirationTtl: DATA_CACHE_TTL }); } catch { /* ignore */ }
      return data;
    }
  } catch { /* fallthrough to local */ }

  // 3. Fallback: /data local cùng origin (qua Access — forward cookie từ request gốc)
  const r2 = await fetch(new URL(path, ctx.origin).toString(), { headers: { Cookie: ctx.cookieHeader || "" } });
  if (!r2.ok) throw new Error(`Fetch ${path} ${r2.status} (raw GitHub + local đều fail)`);
  return await r2.json();
}

async function fetchInternal(ctx, path) {
  // Giữ lại cho tool nào vẫn cần API chain (vd geo queue) — forward Cookie.
  const url = new URL(path, ctx.origin).toString();
  const r = await fetch(url, { headers: { Cookie: ctx.cookieHeader || "" } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Fetch ${path} ${r.status}: ${t.slice(0, 200)}`);
  }
  return await r.json();
}

// Đọc fb-config: default file (source of truth cho account_to_groups) +
// merge với KV (override KPI nếu user đã edit qua UI).
// KV thường được save qua /api/fb-config POST khi user update KPI — payload
// có thể không có account_to_groups → KV bị rỗng map. Phải fallback default
// file cho account_to_groups, KV chỉ thắng nếu thực sự có data.
async function loadFbConfig(ctx) {
  let baseConfig = { account_to_groups: {}, kpi_revenue_monthly_vnd: 0 };
  try {
    baseConfig = await fetchData(ctx, "/data/fb-config.json");
  } catch { /* ignore — KV may still rescue */ }

  if (ctx.env?.INVENTORY) {
    try {
      const cached = await ctx.env.INVENTORY.get("fb_config", { type: "json" });
      if (cached) {
        const kvHasAccounts = cached.account_to_groups
          && Object.keys(cached.account_to_groups).length > 0;
        return {
          ...baseConfig,
          ...cached,
          account_to_groups: kvHasAccounts
            ? cached.account_to_groups
            : baseConfig.account_to_groups,
        };
      }
    } catch { /* ignore */ }
  }
  return baseConfig;
}

// ────────────────────────────────────────────────────────────
// Tool: get_fb_spend — tổng spend FB Ads theo time range + group
// ────────────────────────────────────────────────────────────
const get_fb_spend = {
  name: "get_fb_spend",
  description: "Lấy tổng spend FB Ads + profit + orders trong 1 time range. Dùng khi user hỏi 'chi phí quảng cáo FB tháng này', 'spend tuần qua', v.v. Trả về tổng theo group (NOMA, MAY_DO, CAMERA_VIDEO_CALL, GHI_AM) hoặc ALL. Muốn khoảng KHÔNG có sẵn preset (vd 'tuần trước nữa', '15-21/6') → truyền start + end.",
  input_schema: {
    type: "object",
    properties: {
      time_preset: {
        type: "string",
        enum: ["today","yesterday","this_week","last_week","this_month","last_month","last_7d","last_30d","last_90d"],
        description: "Khoảng thời gian. Default this_month. Bị bỏ qua nếu có cả start+end.",
      },
      start: {
        type: "string",
        description: "Ngày bắt đầu YYYY-MM-DD (tùy chọn). Có cả start+end → dùng khoảng tùy chỉnh, bỏ qua time_preset.",
      },
      end: {
        type: "string",
        description: "Ngày kết thúc YYYY-MM-DD (tùy chọn). Đi kèm start.",
      },
      group: {
        type: "string",
        enum: ["ALL","NOMA","MAY_DO","CAMERA_VIDEO_CALL","GHI_AM"],
        description: "Nhóm SP. Default ALL.",
      },
    },
  },
  handler: async (input, ctx) => {
    const time = input.time_preset || "this_month";
    const group = input.group || "ALL";
    const timeRange = (input.start && input.end)
      ? resolveTimeRange("custom", input.start, input.end)
      : resolveTimeRange(time);
    if (!timeRange) return { error: "Invalid time range (start/end phải là YYYY-MM-DD)" };
    if (timeRange.custom) timeRange.label = `${timeRange.start} → ${timeRange.end}`;

    const [fbAds, rev, costs] = await Promise.all([
      fetchData(ctx, "/data/fb-ads-data.json"),
      fetchData(ctx, "/data/product-revenue.json").catch(() => null),
      fetchData(ctx, "/data/product-costs.json").catch(() => null),
    ]);

    const accountsBlock = compactFbAccounts(fbAds, timeRange);
    const profit = (rev && costs)
      ? computeFbProfitInRange(rev, costs, group, timeRange)
      : null;
    const orders = rev ? compactFbOrdersInRange(rev, group, timeRange) : null;

    return {
      time_range: timeRange,
      group,
      profit_total: profit?.total || null,
      orders_total: orders?.total || null,
      accounts_summary: (accountsBlock?.accounts || []).map(a => ({
        id: a.id, name: a.name, spend: a.spend, leads: a.leads,
        conversions: a.conversions, active_campaigns: a.active_campaigns,
      })),
    };
  },
};

// ────────────────────────────────────────────────────────────
// Tool: get_fb_staff_spend — spend theo nhân sự (DUY/PHUONG_NAM) trong tháng
// Trả về số CHUẨN (gồm cả campaign đã pause trong tháng) — fix bug 2026-05-26.
// ────────────────────────────────────────────────────────────
const get_fb_staff_spend = {
  name: "get_fb_staff_spend",
  description: "Lấy spend MTD chuẩn của 1 nhân sự FB Ads (DUY hoặc PHUONG_NAM), break down per account. Gọi khi user hỏi 'spend Phương Nam tháng này', 'DUY chi bao nhiêu cho Noma'. Khoảng không có preset → truyền start + end.",
  input_schema: {
    type: "object",
    properties: {
      staff: { type: "string", enum: ["DUY","PHUONG_NAM"], description: "Tên nhân sự" },
      time_preset: {
        type: "string",
        enum: ["today","yesterday","this_week","last_week","this_month","last_month","last_7d","last_30d","last_90d"],
        description: "Khoảng thời gian. Default this_month. Bị bỏ qua nếu có cả start+end.",
      },
      start: {
        type: "string",
        description: "Ngày bắt đầu YYYY-MM-DD (tùy chọn). Có cả start+end → dùng khoảng tùy chỉnh, bỏ qua time_preset.",
      },
      end: {
        type: "string",
        description: "Ngày kết thúc YYYY-MM-DD (tùy chọn). Đi kèm start.",
      },
    },
    required: ["staff"],
  },
  handler: async (input, ctx) => {
    const time = input.time_preset || "this_month";
    const timeRange = (input.start && input.end)
      ? resolveTimeRange("custom", input.start, input.end)
      : resolveTimeRange(time);
    if (!timeRange) return { error: "Invalid time range (start/end phải là YYYY-MM-DD)" };
    if (timeRange.custom) timeRange.label = `${timeRange.start} → ${timeRange.end}`;

    const [cfg, fbAds] = await Promise.all([
      loadFbConfig(ctx),
      fetchData(ctx, "/data/fb-ads-data.json"),
    ]);
    const accMap = cfg?.account_to_groups || {};
    const accounts = Object.entries(accMap)
      .filter(([_, v]) => v.staff === input.staff)
      .map(([id, v]) => ({ id, groups: v.groups, note: v.products_note }));

    if (accounts.length === 0) {
      return {
        staff: input.staff,
        time_preset: time,
        total_spend_vnd: 0,
        accounts: [],
        error: `Không có account nào map cho staff "${input.staff}" trong fb-config.json`,
      };
    }

    const perAcc = accounts.map(a => {
      // activeOnly:false → tính cả campaign đã pause nhưng có spend trong range
      const camps = compactFbCampaigns(fbAds, a.id, timeRange, { activeOnly: false });
      const campsAll = camps?.campaigns || [];
      const withSpend = campsAll.filter(c => c.spend > 0);
      const spend = withSpend.reduce((s, c) => s + (c.spend || 0), 0);
      const conv  = withSpend.reduce((s, c) => s + (c.conversions || 0), 0);
      const activeCount = withSpend.filter(c => c.effective_status === "ACTIVE").length;
      return {
        id: a.id, groups: a.groups, note: a.note,
        spend, conversions: conv,
        active_campaigns: activeCount,
        paused_with_spend: withSpend.length - activeCount,
      };
    });

    const totalSpend = perAcc.reduce((s, a) => s + a.spend, 0);
    const totalConv  = perAcc.reduce((s, a) => s + a.conversions, 0);
    return {
      staff: input.staff,
      time_preset: time,
      time_range: timeRange,
      total_spend_vnd: totalSpend,
      total_conversions: totalConv,
      cpa_avg: totalConv > 0 ? Math.round(totalSpend / totalConv) : null,
      accounts: perAcc,
      note: "Số đã gồm cả campaign đã pause nhưng có spend trong range (fix 2026-05-26).",
    };
  },
};

// ────────────────────────────────────────────────────────────
// Tool: get_kpi_status — KPI tháng + tiến độ
// ────────────────────────────────────────────────────────────
const get_kpi_status = {
  name: "get_kpi_status",
  description: "Lấy KPI doanh thu tháng + tiến độ MTD + dự báo cuối tháng. Dùng khi user hỏi 'KPI tháng này thế nào', 'có đạt KPI không'.",
  input_schema: { type: "object", properties: {} },
  handler: async (_input, ctx) => {
    const timeRange = resolveTimeRange("this_month");
    const [cfg, rev, costs] = await Promise.all([
      loadFbConfig(ctx),
      fetchData(ctx, "/data/product-revenue.json").catch(() => null),
      fetchData(ctx, "/data/product-costs.json").catch(() => null),
    ]);
    const kpi = cfg?.kpi_revenue_monthly_vnd || 0;
    const profitData = (rev && costs)
      ? computeFbProfitInRange(rev, costs, "ALL", timeRange)
      : null;
    const revenueMtd = profitData?.total?.revenue || 0;
    const profitMtd = profitData?.total?.profit || 0;
    const pct = kpi > 0 ? Math.round((revenueMtd / kpi) * 1000) / 10 : 0;
    return {
      kpi_revenue_monthly_vnd: kpi,
      revenue_mtd_vnd: revenueMtd,
      profit_mtd_vnd: profitMtd,
      progress_pct: pct,
      gap_vnd: kpi - revenueMtd,
      time_range: timeRange,
    };
  },
};

// ────────────────────────────────────────────────────────────
// Tool: get_geo_queue — danh sách bài GEO trong queue
// CRM /api/geo/queue trả { count, items: [...] } — đọc `items`.
// ────────────────────────────────────────────────────────────
const get_geo_queue = {
  name: "get_geo_queue",
  description: "Liệt kê bài content GEO trong queue (idea/drafting/pending_review/published). Dùng khi user hỏi 'có bài nào chờ duyệt không', 'tháng này viết được bao nhiêu bài'.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", description: "Filter status: idea, drafting, pending_review, edited, published, ... (comma-separated). Default: tất cả active." },
      brand: { type: "string", enum: ["doscom","noma","all"], description: "Brand filter. Default all." },
      limit: { type: "integer", description: "Default 20, max 50." },
    },
  },
  handler: async (input, ctx) => {
    const qs = new URLSearchParams();
    if (input.status) qs.set("status", input.status);
    if (input.brand) qs.set("brand", input.brand);
    qs.set("limit", String(Math.min(input.limit || 20, 50)));
    let data;
    try {
      data = await fetchInternal(ctx, `/api/geo/queue?${qs}`);
    } catch (e) {
      return { count: 0, articles: [], error: `Không đọc được GEO queue: ${e.message}` };
    }
    const rows = data?.items || data?.articles || data?.results || [];
    const articles = rows.map(a => ({
      id: a.id, brand: a.brand, status: a.status,
      title: a.title, slug: a.slug, gap_severity: a.gap_severity,
      created_at: a.created_at, published_at: a.published_at,
    }));
    return { count: articles.length, articles };
  },
};

// ────────────────────────────────────────────────────────────
// Tool: search_past_chats — FTS5 search lịch sử chat của user
// ────────────────────────────────────────────────────────────
const search_past_chats = {
  name: "search_past_chats",
  description: "Tìm trong lịch sử chat của user theo keyword (full-text search). Dùng khi user hỏi 'tuần trước mình đã nói gì về X', 'lần nào agent khuyên scale campaign Noma'.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keyword/cụm từ tìm. Hỗ trợ FTS5 syntax." },
      limit: { type: "integer", description: "Default 10, max 30." },
    },
    required: ["query"],
  },
  handler: async (input, ctx) => {
    const q = String(input.query || "").trim();
    if (!q) return { results: [] };
    const lim = Math.min(input.limit || 10, 30);
    const { results } = await ctx.env.DB.prepare(
      `SELECT m.session_id, m.role, m.content, m.created_at, s.title
       FROM hermes_messages_fts f
       JOIN hermes_messages m ON m.id = f.rowid
       JOIN hermes_sessions s ON s.id = m.session_id
       WHERE hermes_messages_fts MATCH ? AND f.user_email = ?
       ORDER BY m.created_at DESC LIMIT ?`
    ).bind(q, ctx.userEmail, lim).all();
    return {
      count: results?.length || 0,
      results: (results || []).map(r => ({
        session_id: r.session_id,
        session_title: r.title,
        role: r.role,
        snippet: String(r.content || "").slice(0, 300),
        when: new Date(r.created_at).toISOString().slice(0, 16).replace("T", " "),
      })),
    };
  },
};

// ────────────────────────────────────────────────────────────
// Tool: remember_preference — Hermes-style "learn over time"
// User: "luôn báo cáo gọn bullet point" → agent gọi tool này.
// ────────────────────────────────────────────────────────────
const remember_preference = {
  name: "remember_preference",
  description: "Lưu 1 preference của user (vd 'thích báo cáo gọn', 'default staff là PHUONG_NAM', 'cảnh báo khi CPL > 400K'). Chỉ gọi khi user RÕ RÀNG nói 'từ giờ hãy luôn ...' hoặc 'nhớ rằng ...'.",
  input_schema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Key ngắn (snake_case), vd 'report_style', 'cpl_alert_threshold'." },
      value: { type: "string", description: "Value (text mô tả preference)." },
    },
    required: ["key", "value"],
  },
  handler: async (input, ctx) => {
    await ctx.env.DB.prepare(
      `INSERT OR REPLACE INTO hermes_user_prefs (user_email, key, value, learned_at, source)
       VALUES (?, ?, ?, ?, 'user_explicit')`
    ).bind(ctx.userEmail, input.key, input.value, Date.now()).run();
    return { ok: true, message: `Đã ghi nhớ: ${input.key} = ${input.value}` };
  },
};

// ────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────
const REGISTRY = {
  get_fb_spend,
  get_fb_staff_spend,
  get_kpi_status,
  get_geo_queue,
  search_past_chats,
  remember_preference,
};

// Export tools array cho Claude API (chỉ name + description + input_schema)
export const TOOLS = Object.values(REGISTRY).map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema,
}));

export async function runTool(name, input, ctx) {
  const tool = REGISTRY[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return await tool.handler(input || {}, ctx);
}
