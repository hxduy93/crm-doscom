/**
 * Cloudflare Pages Function: GET /api/fb-accounts-pages
 * ------------------------------------------------------
 * Hỏi thẳng Meta xem token FB_ACCESS_TOKEN ĐANG dùng được tài khoản QC nào,
 * và mỗi tài khoản chạy quảng cáo được với Page nào (promote_pages).
 * → Dùng để biết "trình tạo QC tự động" hợp lệ với cặp (tkqc, page) nào.
 *
 * Response: { ok, accounts:[{ id, name, status, can_use, pages:[{id,name}] }] }
 *   - status: ACTIVE | DISABLED | UNSETTLED | ... (map từ account_status)
 *   - can_use: true nếu status ACTIVE và có ít nhất 1 page
 *
 * Phân quyền: getIdentity — admin thấy mọi tài khoản; staff chỉ thấy tài khoản nhóm mình.
 */
import { getIdentity, canAccess } from "../lib/access.js";

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

  try {
    // 1 call: tài khoản token truy cập được + page chạy QC được (promote_pages) lồng sẵn.
    const res = await fbGet("/me/adaccounts", {
      fields: "account_id,name,account_status,promote_pages.limit(50){id,name},adspixels.limit(50){id,name}",
      limit: "200",
    }, token);

    let accounts = (res.data || []).map((a) => {
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

    return json({ ok: true, role: id.role, email: id.email, count: accounts.length, accounts });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 400) }, 502);
  }
}
