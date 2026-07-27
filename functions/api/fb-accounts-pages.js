/**
 * Cloudflare Pages Function: GET /api/fb-accounts-pages
 * ------------------------------------------------------
 * Hỏi thẳng Meta xem token FB_ACCESS_TOKEN ĐANG dùng được tài khoản QC nào,
 * và mỗi tài khoản chạy quảng cáo được với Page nào (promote_pages).
 * → Dùng để biết "trình tạo QC tự động" hợp lệ với cặp (tkqc, page) nào.
 *
 * Response: { ok, source, accounts:[{ id, name, status, can_use, pages:[{id,name}] }] }
 *   - status: ACTIVE | DISABLED | UNSETTLED | ... (map từ account_status)
 *   - can_use: true nếu status ACTIVE và có ít nhất 1 page
 *   - source: "me" (token User) | "batch" (token System User / App)
 *
 * HAI ĐƯỜNG LẤY DỮ LIỆU — vì `/me` chỉ dùng được với token kiểu User:
 *   1. /me/adaccounts  — 1 call, token User. Nhanh nhất, thử trước.
 *   2. batch /act_{id} — token System User / App không có ngữ cảnh "me" nên /me trả
 *      lỗi 100/33 "Object with ID 'me' does not exist". Khi đó hỏi thẳng từng tài
 *      khoản trong danh sách quyền (lib/access.js) — gộp 1 batch request.
 *
 * Phân quyền: getIdentity — admin thấy mọi tài khoản; staff chỉ thấy tài khoản nhóm mình.
 */
import { getIdentity, canAccess, visibleAccounts } from "../lib/access.js";

const FB_API_VERSION = "v20.0";
const GRAPH = `https://graph.facebook.com/${FB_API_VERSION}`;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fbGet(path, params, token) {
  const qs = new URLSearchParams(params || {});
  qs.append("access_token", token);
  const r = await fetch(`${GRAPH}${path}?${qs}`, { signal: AbortSignal.timeout(25000) });
  const data = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
  if (!r.ok || data.error) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data;
}

const ACCOUNT_FIELDS =
  "account_id,name,account_status,promote_pages.limit(50){id,name},adspixels.limit(50){id,name}";

// Batch API: 1 HTTP request → nhiều node. Tài khoản nào lỗi thì bỏ qua, không làm
// hỏng cả danh sách (vd token mất quyền trên đúng 1 TK).
async function fbBatch(ids, token) {
  const batch = ids.map((id) => ({
    method: "GET",
    relative_url: `act_${id}?fields=${encodeURIComponent(ACCOUNT_FIELDS)}`,
  }));
  const body = new URLSearchParams({
    access_token: token,
    include_headers: "false",
    batch: JSON.stringify(batch),
  });
  const r = await fetch(`${GRAPH}/`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
  if (!r.ok || data.error) throw new Error(data.error?.message || `HTTP ${r.status}`);
  if (!Array.isArray(data)) throw new Error("Batch trả về không phải mảng");

  const out = [];
  data.forEach((entry, i) => {
    if (!entry || entry.code !== 200) return;
    let node;
    try { node = JSON.parse(entry.body); } catch { return; }
    if (!node || node.error) return;
    // act_{id} không luôn trả account_id → lấy từ danh sách đã hỏi làm nguồn chuẩn.
    out.push({ ...node, account_id: node.account_id || ids[i] });
  });
  if (!out.length) throw new Error("Token không đọc được tài khoản QC nào trong danh sách cấu hình");
  return out;
}

// account_status của Meta: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW,
// 8=PENDING_SETTLEMENT, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED, 201=ANY_ACTIVE, 202=ANY_CLOSED
const STATUS_MAP = {
  1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT", 9: "IN_GRACE_PERIOD", 100: "PENDING_CLOSURE",
  101: "CLOSED", 201: "ANY_ACTIVE", 202: "ANY_CLOSED",
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = env.FB_ACCESS_TOKEN;
  if (!token) return json({ ok: false, error: "FB_ACCESS_TOKEN chưa cấu hình" }, 500);

  const id = await getIdentity(context);
  if (id.role === "none") return json({ ok: false, error: "Không có quyền" }, 403);

  // Đường 1: /me/adaccounts (token User). Đường 2: batch act_{id} (token System User).
  let raw = [];
  let source = "me";
  let meErr = "";
  try {
    // 1 call: tài khoản token truy cập được + page chạy QC được (promote_pages) lồng sẵn.
    const res = await fbGet("/me/adaccounts", { fields: ACCOUNT_FIELDS, limit: "200" }, token);
    raw = res.data || [];
    if (!raw.length) meErr = "/me/adaccounts trả 0 tài khoản";
  } catch (err) {
    meErr = String(err?.message || err);
  }

  try {
    if (!raw.length) {
      // Chỉ hỏi những TK người này được xem → staff không tốn call cho TK người khác.
      const ids = visibleAccounts(id).map((a) => a.id);
      if (!ids.length) return json({ ok: true, role: id.role, email: id.email, source: "none", count: 0, accounts: [] });
      raw = await fbBatch(ids, token);
      source = "batch";
    }

    let accounts = raw.map((a) => {
      const pages = ((a.promote_pages && a.promote_pages.data) || []).map((p) => ({ id: p.id, name: p.name }));
      const pixels = ((a.adspixels && a.adspixels.data) || []).map((px) => ({ id: px.id, name: px.name || px.id }));
      const status = STATUS_MAP[a.account_status] || `UNKNOWN(${a.account_status})`;
      return {
        id: a.account_id,
        name: a.name,
        status,
        can_use: status === "ACTIVE" && pages.length > 0,
        pages,
        pixels,
      };
    });

    // Phân quyền: staff chỉ thấy tài khoản nhóm mình.
    if (!id.all) accounts = accounts.filter((a) => canAccess(id, a.id));

    return json({
      ok: true, role: id.role, email: id.email, source,
      // Giữ lại lý do phải rẽ sang batch — để chẩn đoán token mà không cần đọc log.
      note: source === "batch" && meErr ? `Bỏ qua /me: ${meErr.slice(0, 200)}` : undefined,
      count: accounts.length, accounts,
    });
  } catch (err) {
    const detail = meErr ? `${err?.message || err} (trước đó /me: ${meErr})` : String(err?.message || err);
    return json({ ok: false, error: String(detail).slice(0, 400) }, 502);
  }
}
