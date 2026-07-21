// GET /api/landing-leads?from=YYYY-MM-DD&to=YYYY-MM-DD  (hoặc ?days=30)
// Lead từ CÁC LANDING NGOÀI NOMA 911 (Máy dò D1, Máy ghi âm DR1…), đọc bảng
// landing_leads trong D1 crm-doscom-db — do chính landing ghi vào khi khách đăng ký.
//
// Vì sao tách khỏi /api/noma911/stats: bảng noma911_orders gắn chặt combo NOMA
// và có cột đối soát POS riêng; trộn 2 nguồn vào 1 truy vấn sẽ làm hỏng thống kê
// combo đang chạy. Dashboard gọi cả 2 rồi CỘNG lại ở phía giao diện.
//
// Trả: { range, total, by_staff[], by_product[], by_landing[], by_date[] }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function vnDate(epochSec) {
  return new Date((epochSec + 7 * 3600) * 1000).toISOString().slice(0, 10);
}

const STAFF_LABEL = { duy: "Duy", pn: "Phương Nam" };

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  const url = new URL(request.url);
  const nowSec = Math.floor(Date.now() / 1000);
  let from = url.searchParams.get("from");
  let to = url.searchParams.get("to");
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1), 365);
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) from = vnDate(nowSec - (days - 1) * 86400);
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) to = vnDate(nowSec);

  const where = "created_date >= ? AND created_date <= ?";
  const args = [from, to];

  try {
    const [total, byStaff, byProduct, byLanding, byDate] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS leads FROM landing_leads WHERE ${where}`).bind(...args).first(),
      env.DB.prepare(`SELECT staff, COUNT(*) AS leads FROM landing_leads WHERE ${where} GROUP BY staff ORDER BY leads DESC`).bind(...args).all(),
      env.DB.prepare(`SELECT product, product_label, COUNT(*) AS leads FROM landing_leads WHERE ${where} GROUP BY product, product_label ORDER BY leads DESC`).bind(...args).all(),
      env.DB.prepare(`SELECT landing, staff, product, COUNT(*) AS leads FROM landing_leads WHERE ${where} GROUP BY landing, staff, product ORDER BY leads DESC`).bind(...args).all(),
      env.DB.prepare(`SELECT created_date, COUNT(*) AS leads FROM landing_leads WHERE ${where} GROUP BY created_date ORDER BY created_date ASC`).bind(...args).all(),
    ]);

    return json({
      ok: true,
      range: { from, to, days },
      total: total?.leads || 0,
      by_staff: (byStaff.results || []).map(r => ({
        staff: r.staff,
        staff_label: STAFF_LABEL[r.staff] || r.staff,
        leads: r.leads,
      })),
      by_product: byProduct.results || [],
      by_landing: byLanding.results || [],
      by_date: byDate.results || [],
    });
  } catch (e) {
    // Bảng chưa có (chưa chạy migration) → trả rỗng thay vì 500, để dashboard
    // vẫn hiện được phần NOMA thay vì hỏng cả cột Lead.
    const msg = String(e.message || e);
    if (/no such table/i.test(msg)) {
      return json({ ok: true, range: { from, to, days }, total: 0, by_staff: [], by_product: [], by_landing: [], by_date: [] });
    }
    return json({ ok: false, error: msg }, 502);
  }
}
