/* ══════════════════════════════════════════════════════════════════════════════
   TỰ BÙ ĐƠN THÁI LAN CHƯA LÊN GOOGLE SHEET — chạy trong cron 9h sáng.

   Bối cảnh: hai landing Thái (noma955.click = máy dò D1, noma120.asia = NOMA 911)
   ghi đơn vào D1 `landing_leads` RỒI mới đẩy sang Google Sheet ở chế độ chạy nền.
   Kết quả đẩy được ghi ngược vào cột `pancake` của chính đơn đó:
       sheet_ok | sheet_ok_bu | sheet_http_<mã> | sheet_bad_reply | sheet_error
   Apps Script chết, hết quota, hoặc URL /exec đổi mà chưa cập nhật secret -> đơn
   nằm đủ trong D1 nhưng KHÔNG lên Sheet, người trực đơn nhìn Sheet tưởng không có
   khách. (Đã xảy ra thật 21/08/2026 khi URL /exec đổi.)

   Việc của module này, mỗi sáng:
     1. Tìm đơn 7 ngày gần nhất có dấu hỏng -> ĐẨY LẠI.
     2. Đơn nào bù được thì đánh dấu `sheet_ok_bu`, không bù lại lần sau.
     3. Còn sót -> ghi KV để dashboard hiện banner đỏ (xem functions/api/health/token-alert.js).

   ⚠ CHỈ bù đơn ĐÃ BIẾT LÀ HỎNG (`pancake` bắt đầu bằng 'sheet_'). Đơn cũ mang giá
     trị 'n/a' là KHÔNG RÕ trạng thái — bù mù là Sheet có hai dòng cho một khách,
     tệ hơn thiếu. Muốn bù nhóm đó thì soi tay bằng
     `noma911-th-appsscript/doi-soat-don-thai.mjs --bu --id <id>`.
   ══════════════════════════════════════════════════════════════════════════════ */

export const KV_ALERT_KEY = "th_sheet_alert:v1";

const NGAY_DO_LAI = 7;          // chỉ bù đơn trong 7 ngày — cũ hơn thì gọi khách cũng vô nghĩa
const TOI_DA_MOI_LAN = 50;      // chặn trên, phòng khi Sheet chết cả tuần

// Nhãn sản phẩm -> tab đích trong file Sheet "Data D1 Thái Lan".
const TAB = { N911TH: "NOMA 911 TH" };   // D1TH không gửi sheet_tab -> vào tab đầu tiên
const COD_MAC_DINH = { D1TH: 3590, N911TH: 0 };

async function daySangSheet(url, row) {
  // Cột thời gian trong Sheet là lúc Apps Script NHẬN được, không phải lúc khách đặt.
  // Không ghi rõ giờ gốc thì người gọi điện tưởng khách vừa đặt xong.
  const goc = new Date((row.created_at + 7 * 3600) * 1000).toISOString().replace("T", " ").slice(0, 19);
  const payload = {
    product: row.product_label || "",
    market: "TH",
    currency: "THB",
    name: row.name,
    phone: row.phone,
    province: row.province,
    note: `BÙ ĐƠN ${goc} (+07) | ${row.note || ""}`.trim(),
    source: row.source,
    url: row.url,
    referrer: row.referrer,
    amount: COD_MAC_DINH[row.product] || 0,
  };
  if (TAB[row.product]) payload.sheet_tab = TAB[row.product];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await res.text().catch(() => "");
  // Apps Script trả 200 kèm HTML lỗi trong nhiều trường hợp -> phải đọc đủ ok:true,
  // không tin mỗi mã HTTP.
  try { if (JSON.parse(raw).ok === true) return { ok: true }; } catch (e) { /* không phải JSON */ }
  return { ok: false, err: `${res.status}:${raw.slice(0, 120)}` };
}

export async function buDonThai(env) {
  if (!env.DB) return { skip: "thieu_binding_DB" };
  if (!env.TH_SHEET_URL) return { skip: "thieu_TH_SHEET_URL" };

  let rows = [];
  try {
    const q = await env.DB.prepare(
      `SELECT id, product, product_label, name, phone, province, note, source, url,
              referrer, pancake, created_at, created_date
         FROM landing_leads
        WHERE product IN ('D1TH','N911TH')
          AND created_at >= strftime('%s','now') - ?
          AND pancake LIKE 'sheet_%'
          AND pancake NOT IN ('sheet_ok','sheet_ok_bu')
        ORDER BY id ASC LIMIT ?`
    ).bind(NGAY_DO_LAI * 86400, TOI_DA_MOI_LAN).all();
    rows = (q && q.results) || [];
  } catch (e) {
    console.error("Doc D1 hong", String(e));
    return { loi: String(e).slice(0, 200) };
  }

  const bu = [], sot = [];
  for (const r of rows) {
    let kq;
    try { kq = await daySangSheet(env.TH_SHEET_URL, r); }
    catch (e) { kq = { ok: false, err: String(e).slice(0, 120) }; }

    try {
      await env.DB.prepare("UPDATE landing_leads SET pancake = ? WHERE id = ?")
        .bind(kq.ok ? "sheet_ok_bu" : "sheet_error_bu", r.id).run();
    } catch (e) { console.error("Khong ghi duoc trang thai", r.id, String(e)); }

    (kq.ok ? bu : sot).push({ id: r.id, phone: r.phone, product: r.product, err: kq.err });
  }

  /* Ghi KV cho banner. LUÔN ghi, kể cả khi sạch — để dashboard biết cảnh báo cũ đã
     hết hiệu lực thay vì treo mãi. TTL 36h: cron lỡ một buổi thì cảnh báo vẫn còn,
     nhưng không sống mãi nếu cron chết hẳn. */
  const canhBao = sot.length
    ? sot.slice(0, 5).map((x) => `• Đơn Thái #${x.id} (${x.phone}) chưa lên Sheet — ${x.err || "lỗi"}`)
    : [];
  if (sot.length > 5) canhBao.push(`• … và ${sot.length - 5} đơn nữa`);

  try {
    if (env.INVENTORY) {
      await env.INVENTORY.put(
        KV_ALERT_KEY,
        JSON.stringify({ at: Math.floor(Date.now() / 1000), bu: bu.length, sot: sot.length, lines: canhBao }),
        { expirationTtl: 36 * 3600 },
      );
    }
  } catch (e) { console.error("Khong ghi duoc KV canh bao", String(e)); }

  const kq = { quet: rows.length, da_bu: bu.length, con_sot: sot.length, sot };
  console.log("bu-don-thai", JSON.stringify(kq));
  return kq;
}
