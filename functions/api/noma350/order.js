// POST /api/noma350/order
// Nhận 1 đơn từ landing NOMA 350 (repo noma350-landing → Pages Function /api/order).
//
// Landing KHÔNG gọi thẳng endpoint này từ trình duyệt: nó đi qua một Function trung gian
// của chính nó để giữ token phía server. onRequestOptions vẫn có, phòng khi cần gọi
// cross-origin trực tiếp.
//
// Giá chốt ở đây theo COMBO_META — `amount` client gửi lên bị bỏ qua. Đây là lớp chốt giá
// thứ hai (lớp đầu ở Function của landing); cố ý, để kênh khác gọi thẳng vẫn đúng tiền.

const COMBO_META = {
  "le-350":        { label: "1 chai NOMA 350 vệ sinh phanh đĩa", amount: 159000 },
  "combo-2x350":   { label: "2 chai NOMA 350 vệ sinh phanh đĩa", amount: 318000 },
  "combo-350-911": { label: "NOMA 350 + NOMA 911 tẩy ố kính",    amount: 378000 },
  "combo-350-922": { label: "NOMA 350 + NOMA 922 phủ nano kính", amount: 378000 },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

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

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  // Token RIÊNG của 350 — không dùng chung NOMA911_INGEST_TOKEN hay NOMA680_INGEST_TOKEN.
  // Lộ token landing này không được phép kéo theo landing kia.
  if (request.headers.get("X-Noma-Token") !== env.NOMA350_INGEST_TOKEN) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const staff = clip(b.staff, 40);
  if (!staff) return json({ ok: false, error: "missing_staff" }, 400);

  const meta = COMBO_META[b.combo];
  if (!meta) return json({ ok: false, error: "missing_combo" }, 400);

  const now = Math.floor(Date.now() / 1000);
  const createdDate = new Date((now + 7 * 3600) * 1000).toISOString().slice(0, 10);
  const phone = clip(b.phone, 20).replace(/\s/g, "");

  // IP + trình duyệt của KHÁCH, do landing gửi kèm trong payload. KHÔNG đọc
  // CF-Connecting-IP ở đây được: lời gọi này là landing worker -> CRM, nên IP
  // nhìn thấy là của Cloudflare chứ không phải của khách.
  const clientIp = clip(b.ip, 45) || null;
  const clientUa = clip(b.user_agent, 300) || null;

  try {
    // INSERT OR IGNORE + unique(created_date, phone, combo): khách bấm gửi 2 lần chỉ
    // thành 1 đơn, doanh thu không bị cộng đôi.
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO noma350_orders
         (staff, combo, combo_label, gift, name, note, source, province, phone, amount,
          url, referrer, created_at, created_date, ip, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      staff,
      b.combo,
      meta.label,
      clip(b.gift, 100),
      clip(b.name, 120),
      clip(b.note, 500),
      clip(b.source, 120) || "landing-350",
      clip(b.province || b.address, 200),
      phone,
      meta.amount,
      clip(b.url, 500),
      clip(b.referrer, 500),
      now,
      createdDate,
      clientIp,
      clientUa
    ).run();

    const written = (res && res.meta && res.meta.changes) || 0;

    return json({
      ok: true,
      duplicate: written === 0,
      stored: { combo: b.combo, combo_label: meta.label, amount: meta.amount, staff },
    });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
