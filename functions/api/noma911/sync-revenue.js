// Endpoint: POST /api/noma911/sync-revenue
//
// Đối chiếu lead landing (D1 noma911_orders) ↔ đơn POS Pancake (shop 1942196207) theo SĐT,
// để có DOANH THU THỰC (trạng thái giao + COD thật).
//
// Cách chạy: cron (GitHub Actions) gọi với header X-Test-Token = TEST_BYPASS_TOKEN
// (middleware bypass). Mỗi lần xử lý các lead CHƯA chốt cuối (pos_status NULL hoặc not in 3,5,6).
//
// ENV: NOMA_POS_API_KEY (key Pancake shop 1942196207), DB (D1).

const SHOP_ID = "1942196207";
const POS_BASE = "https://pos.pancake.vn/api/v1";
const CHUNK = 10;       // số SĐT search song song mỗi đợt
const MAX_PHONES = 120; // trần SĐT xử lý mỗi lần chạy (tránh quá thời gian Worker)

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Đơn có chứa sản phẩm Noma 911/922 (để không gán nhầm đơn SP khác cùng SĐT, vd đơn Shopee).
function isNomaOrder(o) {
  return (o.items || []).some(it => {
    const n = ((it.variation_info && it.variation_info.name) || (it.product && it.product.name) || "").toLowerCase();
    return n.includes("noma") || n.includes("911") || n.includes("922");
  });
}

// Doanh thu 1 đơn: ưu tiên COD → total sau giảm → total.
function orderRevenue(o) {
  for (const k of ["cod", "total_price_after_sub_discount", "total_price"]) {
    const v = o[k];
    if (v != null && Number(v) > 0) return Math.round(Number(v));
  }
  return 0;
}

// Chọn đơn POS đại diện cho 1 SĐT: chỉ xét đơn Noma; ưu tiên đã-giao(3) > đã-lên-đơn > còn lại; rồi mới nhất.
function pickOrder(orders) {
  const noma = (orders || []).filter(isNomaOrder);
  if (!noma.length) return null;
  const rank = (st) => (st === 3 ? 2 : ([4, 5, 6].includes(st) ? 0 : 1));
  noma.sort((a, b) => {
    const r = rank(b.status) - rank(a.status);
    if (r !== 0) return r;
    return String(b.inserted_at || "").localeCompare(String(a.inserted_at || ""));
  });
  return noma[0];
}

async function searchPhone(env, phone) {
  const url = `${POS_BASE}/shops/${SHOP_ID}/orders/get_orders`
    + `?api_key=${encodeURIComponent(env.NOMA_POS_API_KEY)}`
    + `&page=1&page_size=20&status=-1&search=${encodeURIComponent(phone)}`;
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return (j && j.data) || [];
}

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  if (!env.NOMA_POS_API_KEY) return json({ ok: false, error: "NOMA_POS_API_KEY missing" }, 500);

  // Các SĐT cần sync: chưa sync HOẶC chưa ở trạng thái cuối (giao/hoàn/huỷ).
  // Ưu tiên cái sync lâu nhất trước (synced_at NULL = ưu tiên cao nhất).
  const { results: rows } = await env.DB.prepare(`
    SELECT DISTINCT phone FROM noma911_orders
    WHERE phone IS NOT NULL AND phone != ''
      AND (pos_status IS NULL OR pos_status NOT IN (3, 5, 6))
    ORDER BY synced_at ASC
    LIMIT ${MAX_PHONES}
  `).all();

  const phones = (rows || []).map(r => r.phone);
  let checked = 0, matched = 0, unmatched = 0, errors = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  for (let i = 0; i < phones.length; i += CHUNK) {
    const batch = phones.slice(i, i + CHUNK);
    await Promise.all(batch.map(async (phone) => {
      checked++;
      let orders = null;
      try { orders = await searchPhone(env, phone); }
      catch { errors++; return; }
      if (orders == null) { errors++; return; }

      const best = pickOrder(orders);
      try {
        if (best) {
          await env.DB.prepare(
            `UPDATE noma911_orders SET pos_matched=1, pos_status=?, pos_cod=?, pos_order_id=?, synced_at=? WHERE phone=?`
          ).bind(best.status, orderRevenue(best), String(best.id), nowSec, phone).run();
          matched++;
        } else {
          // Không có đơn Noma cho SĐT này → đánh dấu đã sync nhưng chưa khớp.
          await env.DB.prepare(
            `UPDATE noma911_orders SET pos_matched=0, synced_at=? WHERE phone=?`
          ).bind(nowSec, phone).run();
          unmatched++;
        }
      } catch { errors++; }
    }));
  }

  return json({ ok: true, phones_checked: checked, matched, unmatched, errors, limit: MAX_PHONES });
}

// Cho phép GET để kiểm tra nhanh (chỉ báo trạng thái, không sync).
export async function onRequestGet() {
  return json({ ok: true, msg: "POST để chạy sync doanh thu thực (match SĐT → đơn POS)" });
}
