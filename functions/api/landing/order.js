// POST /api/landing/order — nhận đơn từ trang landing CÔNG KHAI /l/<slug>.
// Đọc cấu hình tích hợp (Pancake + Google Sheet) từ landing config trong D1 theo slug,
// rồi đẩy đơn sang Pancake CRM + Google Sheet. Public (middleware bypass).
//
// Body: { slug, name, phone, province, combo, gift, note, staff, source, url, timestamp }
// Trả:  { ok, sent: { pancake, sheet } }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request, env, ctx }) {
  if (!env.DB) return json({ ok: false, error: "DB binding missing" }, 500);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const slug = String(d.slug || "").trim();
  if (!slug) return json({ ok: false, error: "thiếu slug" }, 400);

  const name = String(d.name || "").trim();
  const phone = String(d.phone || "").trim();
  if (!name || !/^0\d{9}$/.test(phone)) return json({ ok: false, error: "thiếu tên hoặc SĐT không hợp lệ" }, 400);

  const row = await env.DB.prepare("SELECT config FROM landings WHERE slug = ?").bind(slug).first();
  if (!row) return json({ ok: false, error: "landing không tồn tại" }, 404);

  let cfg;
  try { cfg = JSON.parse(row.config || "{}"); } catch { cfg = {}; }
  const itg = (cfg && cfg.integrations) || {};

  const order = {
    name, phone,
    province: String(d.province || "").trim(),
    combo: String(d.combo || ""),
    gift: String(d.gift || ""),
    note: String(d.note || "").trim(),
    staff: String(d.staff || ""),
    source: String(d.source || ""),
    url: String(d.url || ""),
    timestamp: String(d.timestamp || ""),
  };

  const sent = { pancake: "skip", sheet: "skip" };

  // 1) Pancake CRM — body phẳng giống LadiPage/noma911.
  if (itg.pancakeShopId && itg.pancakeApiKey) {
    try {
      const noteParts = [
        order.note,
        order.staff ? ("Nhân sự: " + order.staff) : "",
        order.combo ? ("Gói: " + order.combo) : "",
        order.gift ? ("Quà: " + order.gift) : "",
        order.source ? ("Nguồn: " + order.source) : "",
      ].filter(Boolean);
      const body = {
        Name: name,
        Phone: phone,
        Address: order.province,
        Note: noteParts.join(" | "),
        san_pham: order.combo || cfg.brand || "",
      };
      const pcUrl = "https://pos.pancake.vn/api/v1/shops/" + encodeURIComponent(itg.pancakeShopId) +
        "/crm/Contact/records?api_key=" + encodeURIComponent(itg.pancakeApiKey);
      const r = await fetch(pcUrl, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      sent.pancake = r.ok ? "ok" : ("http_" + r.status);
    } catch (e) {
      sent.pancake = "error";
    }
  }

  // 2) Google Sheet (Apps Script Web App) — fire-and-forget.
  if (itg.sheetUrl) {
    sent.sheet = "sent";
    const p = fetch(itg.sheetUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...order }),
    }).then(() => {}).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  }

  return json({ ok: true, sent });
}
