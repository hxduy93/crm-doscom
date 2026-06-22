/**
 * Cloudflare Pages Function: GET /api/fb-test-page
 * -------------------------------------------------
 * Kiểm chứng THẬT việc một tài khoản QC có chạy được với một Page hay không —
 * bằng cách thử TẠO 1 adcreative (nơi Meta validate quyền quảng cáo của page),
 * rồi XOÁ ngay. Không tạo campaign/adset, không tốn tiền.
 *
 * Đồng thời trả về CHỦ SỞ HỮU của FB_ACCESS_TOKEN (/me) — để biết vì sao
 * promote_pages liệt kê page đó (thường do token là tài khoản admin của page).
 *
 *   GET /api/fb-test-page?account=<id>            → test TẤT CẢ promote_pages của tkqc
 *   GET /api/fb-test-page?account=<id>&page=<id>  → test đúng 1 page (kể cả page
 *                                                    KHÔNG nằm trong promote_pages)
 *
 * Response: { ok, token_owner:{id,name}, account, results:[
 *   { page_id, page_name, ok, verdict, creative_id?, error? } ] }
 *   - verdict: "CHẠY ĐƯỢC" | "PAGE KHÔNG DÙNG ĐƯỢC" | "LỖI KHÁC (xem error)"
 *
 * Phân quyền: getIdentity + canAccess — staff chỉ test được tkqc nhóm mình.
 */
import { getIdentity, canAccess } from "../lib/access.js";

const FB_API_VERSION = "v20.0";
const GRAPH = `https://graph.facebook.com/${FB_API_VERSION}`;
// Ảnh test 320x320 (PNG đặc, base64) — upload thẳng bytes lên Meta để tạo creative
// test, KHÔNG phụ thuộc URL ngoài (placehold.co từng bị Meta chặn fetch).
const TEST_IMG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAUAAAAFACAIAAABC8jL9AAACtklEQVR42u3TQQkAAAgEwStjMuNbwg7+hIFJsLCpHuCpSAAGBgwMGBgMDBgYMDBgYDAwYGDAwGBgwMCAgQEDg4EBAwMGBgwMBgYMDBgYDAwYGDAwYGAwMGBgwMCAgcHAgIEBA4OBAQMDBgYMDAYGDAwYGAysAhgYMDBgYDAwYGDAwICBwcCAgQEDg4EBAwMGBgwMBgYMDBgYMDAYGDAwYGAwMGBgwMCAgcHAgIEBAwMGBgMDBgYMDAYGDAwGBgwMGBgwMBgYMDBgYMDAYGDAwICBwcCAgQEDg4EBAwMGBgwMBgYMDBgYMDAYGDAwYGAwMGBgwMCAgcHAgIEBA4OBAQMDBgYDAwYGDAwYGAwMGBgwMBhYBTAwYGDAwGBgwMCAgQEDg4EBAwMGBgMDBgYMDBgYDAwYGDAwYGAwMGBgwMBgYMDAgIEBA4OBAQMDBgYMDAYGDAwYGAwMGBgwMGBgMDBgYMDAYGDAwICBAQODgQEDAwYGDAwGBgwMGBgMDBgYMDBgYDAwYGDAwICBwcCAgQEDg4EBAwMGBgwMBgYMDBgYMDAYGDAwYGAwMGBgwMCAgcHAgIEBA4OBAQMDBgYMDAYGDAwYGDAwGBgwMGBgMDBgYMDAgIHBwICBAQMDBgYDAwYGDAwGBgwMGBgwMBgYMDBgYDCwBGBgwMCAgcHAgIEBAwMGBgMDBgYMDAYGDAwYGDAwGBgwMGBgwMBgYMDAgIHBwICBAQMDBgYDAwYGDAwYGAwMGBgwMBgYMDBgYMDAYGDAwICBwcAqgIEBAwMGBgMDBgYMDBgYDAwYGDAwGBgwMGBgwMBgYMDAgIEBA4OBAQMDNwvJDtHuCYu/UgAAAABJRU5ErkJggg==";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fbGet(path, params, token) {
  const qs = new URLSearchParams(params || {});
  qs.append("access_token", token);
  const r = await fetch(`${GRAPH}${path}?${qs}`, { signal: AbortSignal.timeout(20000) });
  const data = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
  if (!r.ok || data.error) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data;
}

async function fbPost(path, body, token) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    params.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  params.append("access_token", token);
  const r = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
  if (!r.ok || data.error) {
    const e = data.error || {};
    const err = new Error(e.error_user_msg || e.message || `HTTP ${r.status}`);
    err.fb = e; // giữ code/subcode để phân loại
    throw err;
  }
  return data;
}

async function fbDelete(path, token) {
  const qs = new URLSearchParams({ access_token: token });
  await fetch(`${GRAPH}${path}?${qs}`, { method: "DELETE", signal: AbortSignal.timeout(15000) }).catch(() => {});
}

// Đoán nguyên nhân lỗi: do quyền page hay do thứ khác (ảnh/link...).
function classify(err) {
  const msg = String(err?.message || "");
  const sub = err?.fb?.error_subcode;
  const code = err?.fb?.code;
  // Các tín hiệu lỗi quyền page của Meta
  if (/page|authoriz|permission|không.*quyền|advertise.*page|cannot use this page/i.test(msg) ||
      code === 200 || sub === 1885183) {
    return "PAGE KHÔNG DÙNG ĐƯỢC";
  }
  return "LỖI KHÁC (xem error)";
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = env.FB_ACCESS_TOKEN;
  if (!token) return json({ ok: false, error: "FB_ACCESS_TOKEN chưa cấu hình" }, 500);

  const id = await getIdentity(context);
  if (id.role === "none") return json({ ok: false, error: "Không có quyền" }, 403);

  const url = new URL(request.url);
  const acct = String(url.searchParams.get("account") || "").replace(/^act_/, "");
  const onePage = String(url.searchParams.get("page") || "").trim();
  if (!acct) return json({ ok: false, error: "Thiếu ?account=" }, 400);
  if (!canAccess(id, acct)) return json({ ok: false, error: "Không có quyền trên tài khoản này" }, 403);

  // Cách 1: chủ sở hữu token
  let token_owner = null;
  try { token_owner = await fbGet("/me", { fields: "id,name" }, token); }
  catch (e) { token_owner = { error: String(e.message || e) }; }

  // Danh sách page cần test
  let pages;
  try {
    if (onePage) {
      pages = [{ id: onePage, name: "(chỉ định)" }];
    } else {
      const a = await fbGet(`/act_${acct}`, { fields: "promote_pages.limit(50){id,name}" }, token);
      pages = ((a.promote_pages && a.promote_pages.data) || []).map((p) => ({ id: p.id, name: p.name }));
      if (pages.length === 0) {
        return json({ ok: true, token_owner, account: acct, note: "Tkqc không có promote_pages — truyền &page=<id> để test trực tiếp.", results: [] });
      }
    }
  } catch (e) {
    return json({ ok: false, token_owner, error: String(e.message || e) }, 502);
  }

  // Upload 1 ảnh test (bytes) → image_hash, dùng chung cho mọi page của tkqc này.
  let testHash = null;
  try {
    const img = await fbPost(`/act_${acct}/adimages`, { bytes: TEST_IMG_B64 }, token);
    const imgs = img.images || {};
    const first = imgs[Object.keys(imgs)[0]];
    testHash = first && first.hash;
  } catch (e) {
    return json({ ok: false, token_owner, account: acct, error: "Không tạo được ảnh test (adimages): " + String(e.message || e) }, 502);
  }
  if (!testHash) return json({ ok: false, token_owner, account: acct, error: "adimages không trả image_hash" }, 502);

  // Cách 2: thử tạo creative rồi xoá
  const results = [];
  for (const p of pages) {
    try {
      const creative = await fbPost(`/act_${acct}/adcreatives`, {
        name: "PAGE-TEST (auto-xoá)",
        object_story_spec: {
          page_id: p.id,
          link_data: {
            link: "https://doscom.vn",
            message: "test quyền page (sẽ xoá)",
            name: "test",
            image_hash: testHash,
            call_to_action: { type: "LEARN_MORE", value: { link: "https://doscom.vn" } },
          },
        },
      }, token);
      await fbDelete(`/${creative.id}`, token); // dọn ngay
      results.push({ page_id: p.id, page_name: p.name, ok: true, verdict: "CHẠY ĐƯỢC", creative_id: creative.id });
    } catch (e) {
      results.push({ page_id: p.id, page_name: p.name, ok: false, verdict: classify(e), error: String(e.message || e).slice(0, 300) });
    }
  }

  return json({ ok: true, token_owner, account: acct, results });
}
