// GET /api/lark/tiktok?days=30
// Tổng hợp doanh thu TikTok Shop theo ngày + theo shop, đọc từ Lark Base
// "Hiep_Tiktokshop_Auto" → bảng shop_doanh_thu_theo_ngay.
//
// Bảng này nhẹ (~200 dòng) nên gọi thẳng, không cache — số luôn tươi.
// Phần video nặng hơn nhiều nằm riêng ở /api/lark/tiktok-videos (có cache).
//
// days: số ngày gần nhất (mặc định 30, 0 = tất cả).
//
// Trả: { ok, range, days_count, totals, by_source, by_shop[], daily[] }

import { listRecords, resolveAppToken } from "../../lib/lark.js";

const TABLE_DAILY = "tblSb6i92nfrNXHu";   // shop_doanh_thu_theo_ngay

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Lark trả số dưới dạng CHUỖI ("1012499") → phải ép về number trước khi cộng.
function num(v) {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// epoch ms → "YYYY-MM-DD" theo giờ VN (+07), để khớp cách đọc ngày của người dùng.
function toVnDate(ms) {
  if (!ms) return null;
  return new Date(Number(ms) + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// Cột "Shop" là link field: [{ text: "Noma Auto", ... }]
function shopName(f) {
  const s = f["Shop"];
  if (Array.isArray(s)) return s[0]?.text || "—";
  if (s && typeof s === "object") return s.text || "—";
  return typeof s === "string" && s ? s : "—";
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const q = new URL(request.url).searchParams;
  const days = q.has("days") ? Math.max(0, Number(q.get("days")) || 0) : 30;

  try {
    const { appToken } = await resolveAppToken(env, env.INVENTORY, {
      wiki: env.LARK_WIKI_TOKEN,
      base: env.LARK_BASE_TOKEN,
    });
    const out = await listRecords(env, env.INVENTORY, appToken, TABLE_DAILY, { maxRecords: 2000 });

    // Gom theo ngày (1 ngày có thể có nhiều dòng — mỗi shop 1 dòng).
    const byDate = new Map();
    const byShop = new Map();
    let minDate = null, maxDate = null;

    for (const rec of out.records) {
      const f = rec.fields;
      const date = toVnDate(f["Ngày dữ liệu"]);
      if (!date) continue;
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;

      const shop = shopName(f);
      const row = {
        gmv: num(f["Tổng GMV"]),
        revenue: num(f["Tổng doanh thu (Gross Revenue)"]),
        orders: num(f["Số đơn hàng"]),
        visitors: num(f["Visitors"]),
        page_views: num(f["Page views"]),
        refunds: num(f["Refunds"]),
        gmv_video: num(f["GMV từ Video"]),
        gmv_live: num(f["GMV từ LIVE"]),
        gmv_card: num(f["GMV từ Product Card"]),
        gmv_other: num(f["GMV từ nguồn khác"]),
      };

      if (!byDate.has(date)) byDate.set(date, { date, shops: {}, ...blank() });
      addInto(byDate.get(date), row);
      byDate.get(date).shops[shop] = (byDate.get(date).shops[shop] || 0) + row.gmv;

      if (!byShop.has(shop)) byShop.set(shop, { shop, days: 0, ...blank() });
      addInto(byShop.get(shop), row);
      byShop.get(shop).days++;
    }

    // Mới nhất trước, rồi cắt theo `days`.
    let daily = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (days > 0) daily = daily.slice(0, days);

    // Tổng chỉ tính trên khoảng đã cắt (khớp với bảng người dùng đang nhìn).
    const totals = blank();
    for (const d of daily) addInto(totals, d);

    // by_shop phải tính lại theo đúng khoảng đang xem, không dùng bản gộp toàn kỳ.
    const keep = new Set(daily.map((d) => d.date));
    const shopInRange = new Map();
    for (const rec of out.records) {
      const f = rec.fields;
      const date = toVnDate(f["Ngày dữ liệu"]);
      if (!date || !keep.has(date)) continue;
      const shop = shopName(f);
      if (!shopInRange.has(shop)) shopInRange.set(shop, { shop, days: 0, ...blank() });
      addInto(shopInRange.get(shop), {
        gmv: num(f["Tổng GMV"]),
        revenue: num(f["Tổng doanh thu (Gross Revenue)"]),
        orders: num(f["Số đơn hàng"]),
        visitors: num(f["Visitors"]),
        page_views: num(f["Page views"]),
        refunds: num(f["Refunds"]),
        gmv_video: num(f["GMV từ Video"]),
        gmv_live: num(f["GMV từ LIVE"]),
        gmv_card: num(f["GMV từ Product Card"]),
        gmv_other: num(f["GMV từ nguồn khác"]),
      });
      shopInRange.get(shop).days++;
    }

    return json({
      ok: true,
      range: {
        start: daily.length ? daily[daily.length - 1].date : null,
        end: daily.length ? daily[0].date : null,
        data_from: minDate,
        data_to: maxDate,
      },
      days_count: daily.length,
      totals,
      by_source: {
        video: totals.gmv_video,
        live: totals.gmv_live,
        product_card: totals.gmv_card,
        other: totals.gmv_other,
      },
      by_shop: [...shopInRange.values()].sort((a, b) => b.gmv - a.gmv),
      daily,
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e), code: e.code ?? null }, 502);
  }
}

function blank() {
  return {
    gmv: 0, revenue: 0, orders: 0, visitors: 0, page_views: 0, refunds: 0,
    gmv_video: 0, gmv_live: 0, gmv_card: 0, gmv_other: 0,
  };
}

function addInto(acc, r) {
  for (const k of Object.keys(blank())) acc[k] += r[k] || 0;
  return acc;
}
