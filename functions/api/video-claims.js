/**
 * Cloudflare Pages Function: /api/video-claims
 * ---------------------------------------------
 * Sổ NHẬN video TikTok (D1 bảng video_claims). Mục đích: 2 nhân sự không cùng
 * chạy ads trên 1 video.
 *
 * Nhận video KHÔNG xảy ra lúc tick, mà lúc bấm "Chạy Ads luôn" — CRM hiện popup
 * chọn nhân sự rồi mới ghi sổ, để tick nhầm không khoá oan video.
 *
 *   GET    /api/video-claims
 *          → { ok, claims:[{video_key, staff, staff_name, claimed_at, releasable_until, ...}],
 *              release_window_s }
 *
 *   POST   /api/video-claims        (ghi nhận — cần token khi Access chưa bật)
 *          body { staff:"DUY"|"PHUONG_NAM", videos:[{ key|link, title?, product?, shop? }] }
 *          → { ok, staff, claimed:[key], conflicts:[{ key, staff, staff_name }] }
 *          Video người khác đang giữ KHÔNG bị ghi đè — trả về trong conflicts.
 *
 *   DELETE /api/video-claims        (gỡ nhận — chỉ trong RELEASE_WINDOW_S giây đầu)
 *          body { staff, keys:[key] }
 *          → { ok, released:[key], denied:[{ key, reason }] }
 *
 * Phân quyền: theo đúng khuôn /api/uploaded-videos — getIdentity, và khi Access
 * chưa bật (role "open") thì endpoint GHI bắt buộc header X-Optimizer-Token
 * (red line "endpoint ghi dữ liệu phải có token").
 * Lưu ý: token chỉ chặn ghi bậy từ ngoài, KHÔNG chứng minh danh tính — 2 nhân sự
 * dùng chung 1 mã. Đây là công cụ điều phối nội bộ, không phải hàng rào bảo mật.
 */
import { getIdentity } from "../lib/access.js";

// Mã nhân sự → tên hiển thị. Mã khớp field `staff` trong lib/access.js để sau này
// bật Cloudflare Access là đối chiếu được ngay, không phải map lần nữa.
export const STAFF = { DUY: "Duy", PHUONG_NAM: "Nam" };

// Bấm nhầm thì có 1 phút để gỡ. Quá hạn phải sửa thẳng trong D1 — cố ý làm chặt
// để "đã nhận" là cam kết thật, không phải nút bấm chơi.
export const RELEASE_WINDOW_S = 60;

const MAX_CLAIMS_PER_CALL = 100;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Link TikTok → id video. Đây là KHOÁ duy nhất của 1 video trong sổ nhận.
// Chấp nhận cả khi truyền THẲNG id (chuỗi toàn số) — lối gỡ nhận gửi lên đúng
// khoá mà server đã trả về, không kèm link nữa.
export function videoKeyFromLink(link) {
  const s = String(link || "").trim();
  if (!s) return null;
  const m = s.match(/\/video\/(\d+)/);
  if (m) return m[1];
  return /^\d+$/.test(s) ? s : null;
}

// Tách danh sách xin nhận thành: được nhận / vướng người khác.
// activeByKey: Map(video_key → { staff }) của các dòng ĐANG giữ (released_at IS NULL).
// Video mình đang giữ sẵn thì vẫn tính là "được nhận" (bấm lại lần 2 không lỗi).
export function partitionClaims(requested, activeByKey, staff) {
  const claimed = [];
  const conflicts = [];
  const seen = new Set();
  for (const item of requested) {
    const key = item && item.key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const held = activeByKey.get(key);
    if (held && held.staff !== staff) {
      conflicts.push({ key, staff: held.staff, staff_name: STAFF[held.staff] || held.staff });
    } else {
      claimed.push(item);
    }
  }
  return { claimed, conflicts };
}

// Được gỡ không? Chỉ chính người đã nhận, và chỉ trong RELEASE_WINDOW_S giây đầu.
export function canRelease(row, staff, nowSec, windowSec = RELEASE_WINDOW_S) {
  if (!row) return { ok: false, reason: "chưa ai nhận video này" };
  if (row.released_at) return { ok: false, reason: "đã gỡ trước đó" };
  if (row.staff !== staff) {
    return { ok: false, reason: `video này do ${STAFF[row.staff] || row.staff} nhận, không gỡ hộ được` };
  }
  const age = nowSec - Number(row.claimed_at || 0);
  if (age > windowSec) {
    return { ok: false, reason: `quá hạn gỡ (chỉ gỡ được trong ${windowSec} giây đầu, đã ${age}s)` };
  }
  return { ok: true };
}

// Chuẩn hoá 1 dòng client gửi lên → { key, link, title, product, shop } hoặc null.
export function normalizeVideo(v) {
  if (!v) return null;
  const key = videoKeyFromLink(v.key || v.link);
  if (!key) return null;
  const str = (x) => (x == null ? null : String(x).slice(0, 300));
  return { key, link: str(v.link), title: str(v.title), product: str(v.product), shop: str(v.shop) };
}

// Endpoint ghi → phải có token khi Access chưa bật. Trả null nếu hợp lệ.
async function guardWrite(context) {
  const id = await getIdentity(context);
  if (id.role === "open") {
    const sent = context.request.headers.get("X-Optimizer-Token");
    if (!context.env.OPTIMIZER_TOKEN || sent !== context.env.OPTIMIZER_TOKEN) {
      return { err: json({ ok: false, error: "Sai hoặc thiếu mã CRM (X-Optimizer-Token)" }, 401) };
    }
  }
  return { id };
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

// Đọc các dòng ĐANG giữ theo danh sách khoá. D1 không nhận mảng → dựng IN (?,?,…).
async function activeClaimsFor(db, keys) {
  const map = new Map();
  if (!keys.length) return map;
  const holes = keys.map(() => "?").join(",");
  const res = await db.prepare(
    `SELECT video_key, staff, claimed_at FROM video_claims
      WHERE released_at IS NULL AND video_key IN (${holes})`
  ).bind(...keys).all();
  for (const r of (res && res.results) || []) map.set(String(r.video_key), r);
  return map;
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  try {
    const res = await env.DB.prepare(
      `SELECT video_key, staff, link, title, product, shop, claimed_at
         FROM video_claims
        WHERE released_at IS NULL
        ORDER BY claimed_at DESC
        LIMIT 2000`
    ).all();
    const claims = ((res && res.results) || []).map((r) => ({
      ...r,
      staff_name: STAFF[r.staff] || r.staff,
      releasable_until: Number(r.claimed_at) + RELEASE_WINDOW_S,
    }));
    return json({ ok: true, count: claims.length, release_window_s: RELEASE_WINDOW_S, claims });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "Body không phải JSON" }, 400);

  const staff = String(body.staff || "").toUpperCase();
  if (!STAFF[staff]) {
    return json({ ok: false, error: `Nhân sự không hợp lệ: '${body.staff}'. Chỉ nhận ${Object.keys(STAFF).join(" | ")}` }, 400);
  }
  const videos = (Array.isArray(body.videos) ? body.videos : [])
    .map(normalizeVideo).filter(Boolean).slice(0, MAX_CLAIMS_PER_CALL);
  if (!videos.length) {
    return json({ ok: false, error: "Không có video hợp lệ (thiếu link hoặc link không có id video)" }, 400);
  }

  const guard = await guardWrite(context);
  if (guard.err) return guard.err;

  try {
    const active = await activeClaimsFor(env.DB, videos.map((v) => v.key));
    const { claimed, conflicts } = partitionClaims(videos, active, staff);

    if (claimed.length) {
      const now = Math.floor(Date.now() / 1000);
      // Đã lọc hết dòng của người khác ở trên → OR REPLACE chỉ đụng dòng trống
      // hoặc dòng của chính mình. Không cần upsert điều kiện cho rối.
      const stmt = env.DB.prepare(
        `INSERT OR REPLACE INTO video_claims
           (video_key, staff, link, title, product, shop, claimed_at, claimed_by, released_at, released_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
      );
      await env.DB.batch(claimed.map((v) => stmt.bind(
        v.key, staff, v.link, v.title, v.product, v.shop, now, guard.id?.email || null
      )));
    }

    return json({
      ok: true,
      staff,
      staff_name: STAFF[staff],
      release_window_s: RELEASE_WINDOW_S,
      claimed: claimed.map((v) => v.key),
      conflicts,
    });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "Body không phải JSON" }, 400);

  const staff = String(body.staff || "").toUpperCase();
  if (!STAFF[staff]) return json({ ok: false, error: `Nhân sự không hợp lệ: '${body.staff}'` }, 400);

  const keys = (Array.isArray(body.keys) ? body.keys : [])
    .map((k) => videoKeyFromLink(k)).filter(Boolean).slice(0, MAX_CLAIMS_PER_CALL);
  if (!keys.length) return json({ ok: false, error: "keys rỗng" }, 400);

  const guard = await guardWrite(context);
  if (guard.err) return guard.err;

  try {
    const holes = keys.map(() => "?").join(",");
    const res = await env.DB.prepare(
      `SELECT video_key, staff, claimed_at, released_at FROM video_claims WHERE video_key IN (${holes})`
    ).bind(...keys).all();
    const byKey = new Map(((res && res.results) || []).map((r) => [String(r.video_key), r]));

    const now = Math.floor(Date.now() / 1000);
    const released = [], denied = [];
    for (const key of keys) {
      const verdict = canRelease(byKey.get(key), staff, now);
      if (verdict.ok) released.push(key); else denied.push({ key, reason: verdict.reason });
    }

    if (released.length) {
      const stmt = env.DB.prepare(
        `UPDATE video_claims SET released_at = ?, released_by = ?
          WHERE video_key = ? AND released_at IS NULL AND staff = ?`
      );
      await env.DB.batch(released.map((k) => stmt.bind(now, guard.id?.email || staff, k, staff)));
    }

    return json({ ok: true, staff, released, denied });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
