// Endpoint: POST /api/noma911/order
//
// Nhận 1 đơn đăng ký từ landing NOMA 911 (noma-landings _worker.js fan-out qua waitUntil).
// Server-to-server: KHÔNG có session cookie → _middleware.js cho qua khi header
// `X-Noma-Token` khớp env.NOMA911_INGEST_TOKEN. Function vẫn tự verify token lần nữa (defense in depth).
//
// Body (JSON, khớp `rec` trong landing worker):
//   { staff, combo, gift, source, province|address, phone, name, url, referrer, timestamp }
//
// Lưu vào D1 bảng noma911_orders. Idempotent-ish: không dedupe ở đây (giữ raw),
// stats.js sẽ tính cả tổng lượt lẫn số khách unique theo phone.

const COMBO_META = {
  "le-911":        { label: "1 chai NOMA 911",         amount: 199000 },
  "combo-2x911":   { label: "2 chai NOMA 911",         amount: 398000 },
  "combo-911-310": { label: "Combo NOMA 911 + 310",    amount: 398000 },
  "combo-911-922": { label: "Combo NOMA 911 + 922",    amount: 398000 }, // off khỏi landing, giữ cho đơn lịch sử
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// 'YYYY-MM-DD' theo giờ VN (UTC+7) từ epoch seconds.
function vnDate(epochSec) {
  const d = new Date((epochSec + 7 * 3600) * 1000);
  return d.toISOString().slice(0, 10);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Verify ingest token (middleware đã chặn, nhưng check lại cho chắc)
  const token = request.headers.get("X-Noma-Token");
  if (!env.NOMA911_INGEST_TOKEN || token !== env.NOMA911_INGEST_TOKEN) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const staff = String(d.staff || "").trim();
  const comboRaw = String(d.combo || "").trim();
  if (!staff) return json({ ok: false, error: "missing_staff" }, 400);
  if (!comboRaw) return json({ ok: false, error: "missing_combo" }, 400);

  const meta = COMBO_META[comboRaw] || { label: comboRaw, amount: 0 };

  // timestamp: nhận ISO string từ landing, fallback now
  let createdAt = Math.floor(Date.now() / 1000);
  if (d.timestamp) {
    const t = Date.parse(d.timestamp);
    if (!Number.isNaN(t)) createdAt = Math.floor(t / 1000);
  }

  const row = {
    staff,
    combo: comboRaw,
    combo_label: meta.label,
    gift: String(d.gift || "").slice(0, 100),
    source: String(d.source || "").slice(0, 120),
    province: String(d.province || d.address || "").slice(0, 200),
    phone: String(d.phone || "").replace(/\s/g, "").slice(0, 20),
    amount: meta.amount,
    url: String(d.url || "").slice(0, 500),
    referrer: String(d.referrer || "").slice(0, 500),
    created_at: createdAt,
    created_date: vnDate(createdAt),
    // IP khách do landing worker gửi kèm (d.ip = CF-Connecting-IP). CHỈ lưu D1, không đẩy Pancake.
    ip: String(d.ip || "").trim().slice(0, 64),
  };

  try {
    await env.DB.prepare(`
      INSERT INTO noma911_orders
        (staff, combo, combo_label, gift, source, province, phone, amount, url, referrer, created_at, created_date, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.staff, row.combo, row.combo_label, row.gift, row.source,
      row.province, row.phone, row.amount, row.url, row.referrer,
      row.created_at, row.created_date, row.ip
    ).run();

    // Fan-out song song sang CRM Doscom (D1 riêng) — KHÔNG block đơn chính, lỗi CRM bỏ qua.
    // CRM tự tính amount/created_date từ combo + timestamp (xem crm /api/noma911/order).
    if (env.CRM_INGEST_TOKEN && context.waitUntil) {
      context.waitUntil(
        fetch("https://crm-doscom.pages.dev/api/noma911/order", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Noma-Token": env.CRM_INGEST_TOKEN },
          body: JSON.stringify({
            staff: row.staff,
            combo: row.combo,
            gift: row.gift,
            source: row.source,
            province: row.province,
            phone: row.phone,
            url: row.url,
            referrer: row.referrer,
            timestamp: new Date(row.created_at * 1000).toISOString(),
          }),
        }).catch(() => {})
      );
    }

    return json({ ok: true, stored: { combo: row.combo, combo_label: row.combo_label, amount: row.amount, staff: row.staff } });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
