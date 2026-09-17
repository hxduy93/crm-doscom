// Tính CPQC (chi phí quảng cáo) từ data/dashboard-data.json — ĐÚNG số CRM đang hiển thị.
// Hàm thuần, không gọi mạng, để test được (tests/api-worker-cpqc.test.mjs).
//
// Nguồn trong dashboard-data.json:
//   facebook VN  : ad_spend_by_staff[STAFF][SP].by_date      (đã gán SP: link landing → tên SP)
//   facebook VN  : ad_spend_excluded[STAFF].by_date          (không gán được SP → product=null)
//   facebook TH  : ad_spend_thailand.by_product[SP].by_date  (rổ riêng, không thuộc nhân sự VN)
//   google       : google_ads.by_category[NHÓM].by_date      (không tách theo nhân sự/SP)
//   campaign     : campaigns[] (có staff, cpqc_product, cpqc_source, daily[])

export const STAFF_LABEL = { DUY: "Duy", PHUONG_NAM: "Phương Nam" };
export const GROUPS = ["day", "staff", "product", "staff_product", "channel", "campaign"];

const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export function vnToday(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function parseQuery(params, now = Date.now()) {
  const errors = [];
  let to = params.get("to");
  let from = params.get("from");
  if (to && !isYmd(to)) errors.push("to phải dạng YYYY-MM-DD");
  if (from && !isYmd(from)) errors.push("from phải dạng YYYY-MM-DD");
  if (!isYmd(to)) to = vnToday(now);
  if (!isYmd(from)) from = to.slice(0, 8) + "01"; // mặc định: từ đầu tháng tới hôm nay
  if (from > to) errors.push("from phải <= to");
  const group = (params.get("group") || "staff_product").toLowerCase();
  if (!GROUPS.includes(group)) errors.push(`group phải là một trong: ${GROUPS.join(", ")}`);
  const channel = (params.get("channel") || "all").toLowerCase();
  if (!["all", "facebook", "google"].includes(channel)) errors.push("channel phải là all | facebook | google");
  const market = (params.get("market") || "vn").toLowerCase();
  if (!["vn", "th", "all"].includes(market)) errors.push("market phải là vn | th | all");
  return { from, to, group, channel, market, errors };
}

function sumRange(byDate, from, to, cb) {
  for (const d in byDate || {}) {
    if (d >= from && d <= to) cb(d, Number(byDate[d]) || 0);
  }
}

/** Dòng chi tiết nhỏ nhất: 1 dòng = 1 ngày × kênh × thị trường × nhân sự × sản phẩm. */
export function detailRows(data, { from, to, channel, market }) {
  const rows = [];
  const wantFb = channel === "all" || channel === "facebook";
  const wantGg = channel === "all" || channel === "google";
  const wantVn = market === "all" || market === "vn";
  const wantTh = market === "all" || market === "th";

  if (wantFb && wantVn) {
    for (const [staff, prods] of Object.entries(data.ad_spend_by_staff || {})) {
      for (const [product, b] of Object.entries(prods || {})) {
        sumRange(b.by_date, from, to, (date, spend) =>
          rows.push({ date, channel: "facebook", market: "vn", staff, product, spend }));
      }
    }
    for (const [staff, b] of Object.entries(data.ad_spend_excluded || {})) {
      sumRange(b.by_date, from, to, (date, spend) =>
        rows.push({ date, channel: "facebook", market: "vn", staff, product: null, spend }));
    }
  }
  if (wantFb && wantTh) {
    for (const [product, b] of Object.entries((data.ad_spend_thailand || {}).by_product || {})) {
      sumRange(b.by_date, from, to, (date, spend) =>
        rows.push({ date, channel: "facebook", market: "th", staff: null, product, spend }));
    }
  }
  if (wantGg && wantVn) {
    for (const [category, b] of Object.entries((data.google_ads || {}).by_category || {})) {
      sumRange(b.by_date, from, to, (date, spend) =>
        rows.push({ date, channel: "google", market: "vn", staff: null, product: null, google_category: category, spend }));
    }
  }
  return rows.filter((r) => r.spend > 0);
}

function campaignRows(data, { from, to, channel, market }) {
  if (channel === "google") return [];
  const accName = Object.fromEntries((data.accounts || []).map((a) => [String(a.id), a.name]));
  const out = [];
  for (const c of data.campaigns || []) {
    const mk = c.market === "th" ? "th" : "vn";
    if (market !== "all" && market !== mk) continue;
    let spend = 0, impressions = 0, clicks = 0, registrations = 0;
    for (const d of c.daily || []) {
      if (d.date < from || d.date > to) continue;
      spend += Number(d.spend) || 0;
      impressions += Number(d.impressions) || 0;
      clicks += Number(d.clicks) || 0;
      registrations += Number(d.registrations) || 0;
    }
    if (spend <= 0) continue;
    const accId = String(c.account_id || "").replace(/^act_/, "");
    out.push({
      campaign_id: String(c.id || ""),
      campaign_name: c.name || "",
      account_id: accId,
      account_name: accName[accId] || null,
      channel: "facebook",
      market: mk,
      staff: c.staff || null,
      staff_label: STAFF_LABEL[c.staff] || null,
      product: c.cpqc_product || null,
      product_source: c.cpqc_source || null, // "link" | "name" | null
      spend: Math.round(spend),
      impressions, clicks, registrations,
    });
  }
  return out.sort((a, b) => b.spend - a.spend);
}

const KEY_FIELDS = {
  day: ["date"],
  staff: ["channel", "market", "staff"],
  product: ["channel", "market", "product"],
  staff_product: ["channel", "market", "staff", "product"],
  channel: ["channel", "market"],
};

export function buildCpqc(data, q) {
  const detail = detailRows(data, q);
  const totals = { all: 0, facebook: 0, google: 0, facebook_unassigned: 0 };
  for (const r of detail) {
    totals.all += r.spend;
    totals[r.channel] += r.spend;
    if (r.channel === "facebook" && r.market === "vn" && r.product === null) totals.facebook_unassigned += r.spend;
  }
  for (const k in totals) totals[k] = Math.round(totals[k]);

  let rows;
  if (q.group === "campaign") {
    rows = campaignRows(data, q);
  } else {
    const fields = q.group === "day" ? ["date", "channel", "market", "staff", "product"] : KEY_FIELDS[q.group];
    const map = new Map();
    for (const r of detail) {
      const key = fields.map((f) => r[f] ?? "").join("|");
      let row = map.get(key);
      if (!row) {
        row = Object.fromEntries(fields.map((f) => [f, r[f] ?? null]));
        if ("staff" in row) row.staff_label = STAFF_LABEL[row.staff] || null;
        row.spend = 0;
        map.set(key, row);
      }
      row.spend += r.spend;
    }
    rows = [...map.values()].map((r) => ({ ...r, spend: Math.round(r.spend) }));
    rows.sort((a, b) => (q.group === "day" ? String(a.date).localeCompare(String(b.date)) || b.spend - a.spend : b.spend - a.spend));
  }
  return { totals, rows };
}
