// GET /api/landing-leads?from=YYYY-MM-DD&to=YYYY-MM-DD&market=vn|th|all  (hoặc ?days=30)
// Lead từ CÁC LANDING NGOÀI NOMA 911 (Máy dò D1, Máy ghi âm DR1, D1 bản Thái…), đọc
// bảng landing_leads trong D1 crm-doscom-db — do chính landing ghi vào khi khách đăng ký.
//
// Vì sao tách khỏi /api/noma911/stats: bảng noma911_orders gắn chặt combo NOMA
// và có cột đối soát POS riêng; trộn 2 nguồn vào 1 truy vấn sẽ làm hỏng thống kê
// combo đang chạy. Dashboard gọi cả 2 rồi CỘNG lại ở phía giao diện.
//
// Trả: { market, range, total, by_staff[], by_product[], by_landing[], by_date[] }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function vnDate(epochSec) {
  return new Date((epochSec + 7 * 3600) * 1000).toISOString().slice(0, 10);
}

const STAFF_LABEL = { duy: "Duy", pn: "Phương Nam", th: "Thái Lan" };

/* Mã sản phẩm thuộc THỊ TRƯỜNG THÁI LAN.
   Liệt kê TƯỜNG MINH, cố ý không suy đoán theo hậu tố kiểu /TH$/: mã sản phẩm Việt
   hoàn toàn có thể kết thúc bằng "TH" và sẽ bị xếp nhầm thị trường mà không ai hay.
   Mở thêm landing Thái (vd DR1 bản Thái) thì thêm mã vào đúng đây, không rải chỗ khác. */
export const TH_PRODUCTS = ["D1TH", "N911TH"];

export function isThaiProduct(product) {
  return TH_PRODUCTS.indexOf(String(product == null ? "" : product)) !== -1;
}

// 'vn' | 'th' | bất kỳ thứ gì khác -> 'all'. Giao diện cũ chưa truyền tham số này vẫn
// phải chạy, nên giá trị lạ KHÔNG được thành lỗi 400.
export function resolveMarket(raw) {
  const m = String(raw == null ? "" : raw).toLowerCase();
  return (m === "vn" || m === "th") ? m : "all";
}

/* Mệnh đề lọc theo thị trường, dùng chung cho cả 5 truy vấn để không có truy vấn nào
   lỡ quên bộ lọc — đó chính là cách lead Thái lọt vào dòng tổng của bảng Việt Nam.
   `product IS NULL OR` ở nhánh vn KHÔNG thừa: trong SQL, `NULL NOT IN ('D1TH')` cho ra
   NULL chứ không phải TRUE, nên dòng product rỗng sẽ rơi khỏi CẢ vn LẪN th và phá vỡ
   bất biến vn + th = all. Cột đang NOT NULL nên chưa xảy ra, nhưng bất biến này là thứ
   giao diện dựa vào để tin rằng không mất lead nào. */
export function marketFilter(market) {
  const ph = TH_PRODUCTS.map(() => "?").join(",");
  if (market === "th") return { sql: ` AND product IN (${ph})`, args: [...TH_PRODUCTS] };
  if (market === "vn") return { sql: ` AND (product IS NULL OR product NOT IN (${ph}))`, args: [...TH_PRODUCTS] };
  return { sql: "", args: [] };
}

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

  /* market không hợp lệ -> coi như 'all' thay vì trả lỗi: giao diện cũ chưa truyền tham
     số này vẫn phải chạy. Bù lại response nói rõ market đã áp dụng, để bên gọi biết bộ
     lọc của mình có được nhận hay đã bị bỏ qua. */
  const market = resolveMarket(url.searchParams.get("market"));
  const mf = marketFilter(market);

  const where = "created_date >= ? AND created_date <= ?" + mf.sql;
  const args = [from, to, ...mf.args];

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
      market,
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
      return json({ ok: true, market, range: { from, to, days }, total: 0, by_staff: [], by_product: [], by_landing: [], by_date: [] });
    }
    return json({ ok: false, error: msg }, 502);
  }
}
