// Hermes tool registry — v1 chỉ tool READ-ONLY.
// Mỗi tool có { name, description, input_schema, handler }.
// Handler nhận (input, ctx) với ctx = { env, origin, cookieHeader, userEmail }.
//
// Khi add mutation tool sau (vd pause campaign, generate GEO):
//   - Thêm cờ `mutates: true` để UI hiển thị warning + 2-step confirm
//   - Handler kiểm tra role user (admin mới được mutate)

async function fetchInternal(ctx, path) {
  const url = new URL(path, ctx.origin).toString();
  const r = await fetch(url, { headers: { Cookie: ctx.cookieHeader || "" } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Fetch ${path} ${r.status}: ${t.slice(0, 200)}`);
  }
  return await r.json();
}

// ────────────────────────────────────────────────────────────
// Tool: get_fb_spend — tổng spend FB Ads theo time range + group
// ────────────────────────────────────────────────────────────
const get_fb_spend = {
  name: "get_fb_spend",
  description: "Lấy tổng spend FB Ads + profit + orders trong 1 time range. Dùng khi user hỏi 'chi phí quảng cáo FB tháng này', 'spend tuần qua', v.v. Trả về tổng theo group (NOMA, MAY_DO, CAMERA_VIDEO_CALL, GHI_AM) hoặc ALL.",
  input_schema: {
    type: "object",
    properties: {
      time_preset: {
        type: "string",
        enum: ["today","yesterday","this_week","last_week","this_month","last_month","last_7d","last_30d","last_90d"],
        description: "Khoảng thời gian. Default this_month.",
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
    const data = await fetchInternal(ctx, `/api/fb/snapshot?time=${time}&group=${group}`);
    if (!data?.ok) return { error: data?.error || "Snapshot fail" };
    return {
      time_range: data.time_range,
      group: data.group,
      profit_total: data.profit?.total || null,
      orders_total: data.orders?.total || null,
      accounts_summary: (data.accounts?.accounts || []).map(a => ({
        id: a.id, name: a.name, spend: a.spend, leads: a.leads, conversions: a.conversions, active_campaigns: a.active_campaigns,
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
  description: "Lấy spend MTD chuẩn của 1 nhân sự FB Ads (DUY hoặc PHUONG_NAM), break down per account. Gọi khi user hỏi 'spend Phương Nam tháng này', 'DUY chi bao nhiêu cho Noma'.",
  input_schema: {
    type: "object",
    properties: {
      staff: { type: "string", enum: ["DUY","PHUONG_NAM"], description: "Tên nhân sự" },
      time_preset: {
        type: "string",
        enum: ["today","yesterday","this_week","last_week","this_month","last_month","last_7d","last_30d","last_90d"],
        description: "Khoảng thời gian. Default this_month.",
      },
    },
    required: ["staff"],
  },
  handler: async (input, ctx) => {
    const time = input.time_preset || "this_month";
    // Lấy account list cho staff từ /api/fb-config
    const cfg = await fetchInternal(ctx, "/api/fb-config");
    const accMap = cfg?.account_to_groups || {};
    const accounts = Object.entries(accMap)
      .filter(([_, v]) => v.staff === input.staff)
      .map(([id, v]) => ({ id, groups: v.groups, note: v.products_note }));

    // Gọi snapshot cho từng account
    const perAcc = await Promise.all(accounts.map(async (a) => {
      const snap = await fetchInternal(ctx, `/api/fb/snapshot?time=${time}&account_id=${a.id}`);
      const campsAll = (snap?.campaigns?.campaigns) || [];
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
    }));

    const totalSpend = perAcc.reduce((s, a) => s + a.spend, 0);
    const totalConv  = perAcc.reduce((s, a) => s + a.conversions, 0);
    return {
      staff: input.staff,
      time_preset: time,
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
    const [cfg, snap] = await Promise.all([
      fetchInternal(ctx, "/api/fb-config"),
      fetchInternal(ctx, "/api/fb/snapshot?time=this_month&group=ALL"),
    ]);
    const kpi = cfg?.kpi_revenue_monthly_vnd || 0;
    const rev = snap?.profit?.total?.revenue || 0;
    const profit = snap?.profit?.total?.profit || 0;
    const pct = kpi > 0 ? Math.round((rev / kpi) * 1000) / 10 : 0;
    return {
      kpi_revenue_monthly_vnd: kpi,
      revenue_mtd_vnd: rev,
      profit_mtd_vnd: profit,
      progress_pct: pct,
      gap_vnd: kpi - rev,
      time_range: snap?.time_range,
    };
  },
};

// ────────────────────────────────────────────────────────────
// Tool: get_geo_queue — danh sách bài GEO trong queue
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
    const data = await fetchInternal(ctx, `/api/geo/queue?${qs}`);
    const articles = (data?.articles || data?.results || []).map(a => ({
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
