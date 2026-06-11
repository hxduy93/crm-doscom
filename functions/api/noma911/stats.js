// GET /api/noma911/stats?days=90  (hoặc &from=YYYY-MM-DD&to=YYYY-MM-DD)
// Đọc thống kê đơn đăng ký landing NOMA 911 từ D1 RIÊNG của CRM (binding DB = crm-doscom-db).
// Port từ facebookadsallinone — CRM độc lập, KHÔNG gọi API dashboard cũ.
// Output: { range, summary, by_combo[], by_staff[], by_gift[], by_source[], by_date[], actual }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

function vnDate(epochSec) {
  return new Date((epochSec + 7 * 3600) * 1000).toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: "D1 binding 'DB' missing" }, 500);

  const url = new URL(request.url);
  const nowSec = Math.floor(Date.now() / 1000);
  let from = url.searchParams.get("from");
  let to = url.searchParams.get("to");
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "90", 10) || 90, 1), 365);
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) from = vnDate(nowSec - (days - 1) * 86400);
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) to = vnDate(nowSec);

  const where = `created_date >= ? AND created_date <= ?`;
  const args = [from, to];

  try {
    const [summary, byCombo, byStaff, byGift, bySource, byDate, actual] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS orders, COUNT(DISTINCT NULLIF(phone,'')) AS unique_customers, COALESCE(SUM(amount),0) AS revenue FROM noma911_orders WHERE ${where}`).bind(...args).first(),
      env.DB.prepare(`SELECT combo, combo_label, COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue FROM noma911_orders WHERE ${where} GROUP BY combo, combo_label ORDER BY orders DESC`).bind(...args).all(),
      env.DB.prepare(`SELECT staff, COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue FROM noma911_orders WHERE ${where} GROUP BY staff ORDER BY orders DESC`).bind(...args).all(),
      env.DB.prepare(`SELECT CASE WHEN gift IS NULL OR gift='' THEN '(không quà)' ELSE gift END AS gift_key, COUNT(*) AS orders FROM noma911_orders WHERE ${where} GROUP BY gift_key ORDER BY orders DESC`).bind(...args).all(),
      env.DB.prepare(`SELECT source, COUNT(*) AS orders FROM noma911_orders WHERE ${where} GROUP BY source ORDER BY orders DESC`).bind(...args).all(),
      env.DB.prepare(`SELECT created_date, COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue FROM noma911_orders WHERE ${where} GROUP BY created_date ORDER BY created_date ASC`).bind(...args).all(),
      env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN pos_status=3 THEN pos_cod ELSE 0 END),0) AS rev_delivered, COALESCE(SUM(CASE WHEN pos_status NOT IN (4,5,6) THEN pos_cod ELSE 0 END),0) AS rev_booked, SUM(CASE WHEN pos_status=3 THEN 1 ELSE 0 END) AS cnt_delivered, SUM(CASE WHEN pos_status NOT IN (4,5,6) THEN 1 ELSE 0 END) AS cnt_booked, COUNT(*) AS cnt_matched FROM (SELECT pos_order_id, pos_status, pos_cod FROM noma911_orders WHERE ${where} AND pos_matched=1 AND pos_order_id IS NOT NULL GROUP BY pos_order_id)`).bind(...args).first(),
    ]);

    const STAFF_LABEL = { duy: "Duy", pn: "Phương Nam" };
    const byStaffLabeled = (byStaff.results || []).map(r => ({ ...r, staff_label: STAFF_LABEL[r.staff] || r.staff }));
    const GIFT_LABEL = { noma250: "NOMA 250", noma692: "NOMA 692" };
    const byGiftLabeled = (byGift.results || []).map(r => ({ gift: r.gift_key, gift_label: GIFT_LABEL[r.gift_key] || r.gift_key, orders: r.orders }));

    return json({
      range: { from, to, days },
      summary: { orders: summary?.orders || 0, unique_customers: summary?.unique_customers || 0, revenue: summary?.revenue || 0 },
      by_combo: byCombo.results || [],
      by_staff: byStaffLabeled,
      by_gift: byGiftLabeled,
      by_source: bySource.results || [],
      by_date: byDate.results || [],
      actual: {
        revenue_delivered: actual?.rev_delivered || 0,
        revenue_booked: actual?.rev_booked || 0,
        orders_delivered: actual?.cnt_delivered || 0,
        orders_booked: actual?.cnt_booked || 0,
        orders_matched: actual?.cnt_matched || 0,
        conversion_rate: (summary?.orders ? Math.round((actual?.cnt_delivered || 0) / summary.orders * 1000) / 10 : 0),
      },
    });
  } catch (err) {
    return json({ error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
