// Endpoint: GET /api/noma911/stats?days=30  (hoặc &from=YYYY-MM-DD&to=YYYY-MM-DD)
//
// Trả thống kê đơn đăng ký landing NOMA 911 từ bảng noma911_orders.
// Đã được _middleware.js gate bằng session (chỉ user đăng nhập dashboard mới gọi được).
//
// Output:
//   { range, summary, by_combo[], by_staff[], by_source[], by_date[] }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// 'YYYY-MM-DD' giờ VN từ epoch seconds
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
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1), 365);

  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    from = vnDate(nowSec - (days - 1) * 86400);
  }
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    to = vnDate(nowSec);
  }

  const where = `created_date >= ? AND created_date <= ?`;
  const args = [from, to];

  try {
    const [summary, byCombo, byStaff, bySource, byDate] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) AS orders,
               COUNT(DISTINCT NULLIF(phone, '')) AS unique_customers,
               COALESCE(SUM(amount), 0) AS revenue
        FROM noma911_orders WHERE ${where}
      `).bind(...args).first(),

      env.DB.prepare(`
        SELECT combo, combo_label, COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS revenue
        FROM noma911_orders WHERE ${where}
        GROUP BY combo, combo_label ORDER BY orders DESC
      `).bind(...args).all(),

      env.DB.prepare(`
        SELECT staff, COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS revenue
        FROM noma911_orders WHERE ${where}
        GROUP BY staff ORDER BY orders DESC
      `).bind(...args).all(),

      env.DB.prepare(`
        SELECT source, COUNT(*) AS orders
        FROM noma911_orders WHERE ${where}
        GROUP BY source ORDER BY orders DESC
      `).bind(...args).all(),

      env.DB.prepare(`
        SELECT created_date, COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS revenue
        FROM noma911_orders WHERE ${where}
        GROUP BY created_date ORDER BY created_date ASC
      `).bind(...args).all(),
    ]);

    // Map staff slug → tên hiển thị
    const STAFF_LABEL = { duy: "Duy", pn: "Phương Nam" };
    const byStaffLabeled = (byStaff.results || []).map(r => ({
      ...r, staff_label: STAFF_LABEL[r.staff] || r.staff,
    }));

    return json({
      range: { from, to, days },
      summary: {
        orders: summary?.orders || 0,
        unique_customers: summary?.unique_customers || 0,
        revenue: summary?.revenue || 0,
      },
      by_combo: byCombo.results || [],
      by_staff: byStaffLabeled,
      by_source: bySource.results || [],
      by_date: byDate.results || [],
    });
  } catch (err) {
    return json({ error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
