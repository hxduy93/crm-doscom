// POST /api/noma911/order
// Nhận 1 đơn đăng ký từ landing NOMA 911 (noma-landings _worker.js fan-out).
// Bảo vệ bằng header X-Noma-Token == env.NOMA911_INGEST_TOKEN. Lưu vào D1 RIÊNG của CRM.
// Port từ facebookadsallinone — CRM tự thu đơn, độc lập dashboard cũ.

const COMBO_META = {
  "le-911":        { label: "1 chai NOMA 911",      amount: 199000 },
  "combo-2x911":   { label: "2 chai NOMA 911",      amount: 398000 },
  "combo-911-310": { label: "Combo NOMA 911 + 310", amount: 398000 },
  "combo-911-922": { label: "Combo NOMA 911 + 922", amount: 398000 },
  "le-922":        { label: "1 chai NOMA 922",      amount: 199000 },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

function vnDate(epochSec) {
  return new Date((epochSec + 7 * 3600) * 1000).toISOString().slice(0, 10);
}

// Cho phép preflight CORS (landing khác origin POST sang)
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Noma-Token",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

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
  };

  try {
    await env.DB.prepare(`
      INSERT INTO noma911_orders
        (staff, combo, combo_label, gift, source, province, phone, amount, url, referrer, created_at, created_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.staff, row.combo, row.combo_label, row.gift, row.source,
      row.province, row.phone, row.amount, row.url, row.referrer,
      row.created_at, row.created_date
    ).run();
    return json({ ok: true, stored: { combo: row.combo, combo_label: row.combo_label, amount: row.amount, staff: row.staff } });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
