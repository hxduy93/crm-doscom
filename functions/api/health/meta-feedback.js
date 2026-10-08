/**
 * GET /api/health/meta-feedback
 *
 * Canh giữ đường ĐẨY NGƯỢC đơn chốt về Meta (Conversions API). Đây là đường dễ
 * chết âm thầm nhất trong cả hệ thống: token hết hạn hoặc pixel bị khoá thì Meta
 * vẫn trả HTTP 200 cho vài dạng lỗi, job vẫn "chạy xong", mà không một đơn nào
 * tới đích. Hậu quả không thấy ngay — nó hiện ra sau vài tuần dưới dạng Meta tối
 * ưu sai tệp khách, lúc đó tiền đã tiêu rồi.
 *
 * Nên endpoint này KHÔNG tin vào việc "job có chạy không". Nó hỏi bốn câu:
 *   1. Job có chạy trong 26 giờ qua không?        (KV meta_capi:last_run)
 *   2. Lần chạy cuối có đơn nào bị Meta từ chối?  (KV + D1 meta_capi_sends)
 *   3. Token Conversions API còn ghi được không?  (thăm dò LIVE, xem dưới)
 *   4. 7 ngày qua đã đẩy được bao nhiêu đơn?      (D1)
 *
 * Cách thăm dò token mà KHÔNG ghi sự kiện rác vào báo cáo: gửi /events với payload
 * CỐ Ý thiếu `event_name`. Token sống thì Meta báo lỗi THAM SỐ (subcode 2804019);
 * token chết thì báo lỗi QUYỀN. Cách này không tạo chuyển đổi nào.
 *
 * Trả về:
 *   { ok, state, popup, title, lines[], detail{} }
 *   state: 'ok' | 'tre' | 'hong' | 'chua_bat' | 'khong_ro'
 *   popup: true  -> CRM bật hộp thoại giữa màn hình khi mở trang
 */

const DA81_PIXEL = "922958632515102";   // Pixel DA8.1 — công khai, nằm trong HTML landing
const HEARTBEAT_KEY = "meta_capi:last_run";
const PROBE_KEY = "meta_capi:token_probe";
const PROBE_TTL = 3 * 3600;             // 3h — token không chết theo phút
const STALE_HOURS = 26;                 // cron chạy 9h/15h mỗi ngày; chừa 2h trễ

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function gioVN(epochSec) {
  if (!epochSec) return null;
  return new Date((epochSec + 7 * 3600) * 1000).toISOString().replace("T", " ").slice(0, 16);
}

/* Thăm dò token Conversions API. Trả 'ok' | 'chet' | 'chua_co' | 'khong_ro'.
   Kết quả cache 3h trong KV để mỗi lần mở CRM không gọi Meta một lần. */
async function thamDoToken(env) {
  const token = env.META_CAPI_TOKEN_DA81;
  if (!token) return { tinhTrang: "chua_co", note: "Chưa đặt secret META_CAPI_TOKEN_DA81 cho CRM" };

  if (env.INVENTORY) {
    try {
      const cached = await env.INVENTORY.get(PROBE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) { /* cache lỗi thì cứ hỏi Meta */ }
  }

  let kq;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${DA81_PIXEL}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [{}] }),   // CỐ Ý thiếu event_name — xem ghi chú đầu file
        signal: AbortSignal.timeout(8000),
      }
    );
    const body = await res.json().catch(() => ({}));
    const err = (body && body.error) || {};
    if (res.ok) {
      // Không nên xảy ra (payload rỗng mà nhận?) — coi như ghi được.
      kq = { tinhTrang: "ok", note: "Meta nhận payload rỗng" };
    } else if (err.error_subcode === 2804019 || /event_name/i.test(err.error_user_msg || err.message || "")) {
      kq = { tinhTrang: "ok", note: "Meta báo thiếu tham số → token ghi được vào pixel" };
    } else {
      kq = {
        tinhTrang: "chet",
        note: `Meta từ chối: ${(err.error_user_msg || err.message || "không rõ")}`.slice(0, 200),
      };
    }
  } catch (e) {
    kq = { tinhTrang: "khong_ro", note: "Không gọi được Graph API: " + String(e).slice(0, 120) };
  }

  if (env.INVENTORY && kq.tinhTrang !== "khong_ro") {
    try { await env.INVENTORY.put(PROBE_KEY, JSON.stringify(kq), { expirationTtl: PROBE_TTL }); }
    catch (e) { /* không cache được cũng không sao */ }
  }
  return kq;
}

// Số đơn đã đẩy / lỗi, đọc từ nhật ký D1. Nuốt lỗi: bảng chưa có thì coi như rỗng.
async function docNhatKy(env) {
  const rong = { tong7: 0, ok7: 0, loi7: 0, loi24: 0, theoSuKien: [], ganNhat: [], cuoiOk: null };
  if (!env.DB) return rong;
  const now = Math.floor(Date.now() / 1000);
  try {
    const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];

    const tong = await q(
      `SELECT status, COUNT(*) n FROM meta_capi_sends WHERE sent_at >= ? GROUP BY status`,
      now - 7 * 86400
    );
    const theoSuKien = await q(
      `SELECT event_name, COUNT(*) n, SUM(COALESCE(value_vnd,0)) tien
         FROM meta_capi_sends WHERE sent_at >= ? AND status='ok' GROUP BY event_name`,
      now - 7 * 86400
    );
    const loi24 = await q(
      `SELECT COUNT(*) n FROM meta_capi_sends WHERE sent_at >= ? AND status <> 'ok'`,
      now - 86400
    );
    const cuoiOk = await q(
      `SELECT sent_at, event_name, order_id FROM meta_capi_sends
        WHERE status='ok' ORDER BY sent_at DESC LIMIT 1`
    );
    const ganNhat = await q(
      `SELECT event_name, order_id, value_vnd, status, err, sent_at, matched
         FROM meta_capi_sends ORDER BY sent_at DESC LIMIT 12`
    );

    let ok7 = 0, loi7 = 0;
    for (const r of tong) (r.status === "ok" ? (ok7 += r.n) : (loi7 += r.n));
    return {
      tong7: ok7 + loi7, ok7, loi7,
      loi24: (loi24[0] && loi24[0].n) || 0,
      theoSuKien,
      ganNhat: ganNhat.map((r) => ({ ...r, luc: gioVN(r.sent_at) })),
      cuoiOk: cuoiOk[0] ? { ...cuoiOk[0], luc: gioVN(cuoiOk[0].sent_at) } : null,
    };
  } catch (e) {
    return { ...rong, loiDoc: String(e).slice(0, 160) };
  }
}


/* Luật xếp loại tách thành HÀM THUẦN và export ra ngoài để kiểm được bằng node:
   đây là phần dễ sai nhất (thứ tự ghi đè giữa các loại lỗi) mà cũng là phần
   không thể thử bằng cách mở trang — muốn thấy trạng thái "đã ngừng" thì phải
   đợi job ngừng thật 26 tiếng. */
export function xepLoai({ nhip, token, nhatKy, now }) {
  const gioTuLanChay = nhip && nhip.at ? (now - Number(nhip.at)) / 3600 : null;
  const lines = [];
  let state = "ok";

  // 'chua_bat' KHÔNG bật popup: lúc mới dựng, job chưa chạy lần nào là chuyện bình
  // thường; bật popup thì ngày nào mở CRM cũng bị chặn mặt bằng tin không cần làm gì.
  if (!nhip && (!nhatKy || nhatKy.tong7 === 0)) {
    state = "chua_bat";
    lines.push("Job đẩy đơn về Meta chưa chạy lần nào — đường này chưa được bật.");
  } else if (gioTuLanChay !== null && gioTuLanChay > STALE_HOURS) {
    state = "tre";
    lines.push(`Job không chạy đã ${Math.round(gioTuLanChay)} giờ (đáng lẽ 2 lần/ngày). Đơn chốt từ đó tới nay CHƯA về Meta.`);
  }

  if (token && token.tinhTrang === "chet") {
    state = "hong";
    lines.push("Token Conversions API không ghi được vào pixel DA8.1 nữa — mọi đơn đẩy lên đều bị Meta từ chối. " + (token.note || ""));
  } else if (token && token.tinhTrang === "chua_co") {
    if (state === "ok") state = "khong_ro";
    lines.push("CRM chưa có secret META_CAPI_TOKEN_DA81 nên không tự kiểm được token.");
  }

  if (nhatKy && nhatKy.loi24 > 0) {
    state = "hong";
    lines.push(`${nhatKy.loi24} đơn bị Meta từ chối trong 24 giờ qua.`);
  }
  if (nhip && Number(nhip.fail) > 0) {
    state = "hong";
    lines.push(`Lần chạy cuối có ${nhip.fail} đơn lỗi.` + (nhip.err ? ` Lỗi: ${String(nhip.err).slice(0, 160)}` : ""));
  }

  if (state === "ok") {
    lines.push(`Đường đẩy đang chạy. 7 ngày qua: ${(nhatKy && nhatKy.ok7) || 0} đơn đã về Meta.`);
  }
  // Chỉ chặn mặt khi đường đẩy ĐANG hỏng hoặc ĐÃ ngừng — hai trạng thái càng biết
  // muộn càng mất tiền.
  return { state, lines, gioTuLanChay, popup: state === "hong" || state === "tre" };
}

export async function onRequestGet(context) {
  const { env } = context;
  const now = Math.floor(Date.now() / 1000);

  let nhip = null;
  if (env.INVENTORY) {
    try {
      const raw = await env.INVENTORY.get(HEARTBEAT_KEY);
      if (raw) nhip = JSON.parse(raw);
    } catch (e) { /* đọc nhịp lỗi -> coi như chưa chạy */ }
  }

  const [token, nhatKy] = await Promise.all([thamDoToken(env), docNhatKy(env)]);

  const xep = xepLoai({ nhip, token, nhatKy, now });
  const { state, lines, gioTuLanChay } = xep;

  const TIEU_DE = {
    ok: "Đẩy đơn về Meta: đang chạy",
    tre: "Đẩy đơn về Meta: ĐÃ NGỪNG CHẠY",
    hong: "Đẩy đơn về Meta: ĐANG LỖI",
    chua_bat: "Đẩy đơn về Meta: chưa bật",
    khong_ro: "Đẩy đơn về Meta: chưa kiểm được",
  };

  return json({
    ok: true,
    state,
    // Chỉ chặn mặt người dùng khi đường đẩy ĐANG hỏng hoặc đã ngừng — hai trạng
    // thái mà càng biết muộn càng mất tiền.
    popup: xep.popup,
    title: TIEU_DE[state],
    lines,
    detail: {
      pixel: DA81_PIXEL,
      token: token,
      lanChayCuoi: nhip && nhip.at ? { luc: gioVN(Number(nhip.at)), ...nhip } : null,
      gioTuLanChay: gioTuLanChay === null ? null : Math.round(gioTuLanChay * 10) / 10,
      nguongTre: STALE_HOURS,
      nhatKy,
    },
  });
}
