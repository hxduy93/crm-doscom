// Dùng chung cho mọi endpoint /api/thai-social/*.
//
// Khuôn response theo quy ước agent MỚI của dự án: { ok, data? , error? }.

export const STATUS = {
  REVIEW: "pending_review",
  EDITED: "edited",
  PUBLISHED: "published",
  DISCARDED: "discarded",
};

// Chỉ hai trạng thái này được phép đăng. Bài đã đăng / đã bỏ thì không.
export const PUBLISHABLE = [STATUS.REVIEW, STATUS.EDITED];

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const ok = (data) => json({ ok: true, data });
export const fail = (error, status = 400, extra) => json({ ok: false, error, ...(extra || {}) }, status);

/* Cổng TRONG. Cloudflare Access là cổng ngoài, nhưng theo red line dự án mọi endpoint
   GHI dữ liệu phải có token riêng — thiếu nó thì ai lọt qua Access cũng ghi được.
   Trả null nếu hợp lệ, hoặc Response 401. */
export function requireToken(request, env) {
  const t = env && env.THAI_SOCIAL_TOKEN;
  if (!t) return fail("missing_server_token", 500);
  if (request.headers.get("X-Thai-Token") !== t) return fail("unauthorized", 401);
  return null;
}

export function requireDB(env) {
  if (!env || !env.DB) return fail("D1 binding 'DB' missing", 500);
  return null;
}

export const nowSec = () => Math.floor(Date.now() / 1000);

/* Ngày theo giờ Việt Nam (UTC+7) — khớp cách toàn bộ CRM quy ngày.
   Nhận epoch giây hoặc để trống lấy hiện tại. */
export function vnDate(epochSec) {
  const ms = (epochSec == null ? Date.now() : epochSec * 1000) + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Giờ VN 0-23.
export function vnHour(epochSec) {
  const ms = (epochSec == null ? Date.now() : epochSec * 1000) + 7 * 3600 * 1000;
  return new Date(ms).getUTCHours();
}

// Thứ theo chuẩn ISO: 1 = thứ Hai … 7 = Chủ nhật.
export function vnWeekday(epochSec) {
  const ms = (epochSec == null ? Date.now() : epochSec * 1000) + 7 * 3600 * 1000;
  const d = new Date(ms).getUTCDay(); // 0 = CN
  return d === 0 ? 7 : d;
}

export function parseWeekdays(s) {
  return String(s || "")
    .split(",")
    .map((x) => parseInt(x, 10))
    .filter((n) => n >= 1 && n <= 7);
}

export const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/* Trạng thái token của một page — để UI nói rõ TRƯỚC khi user bấm Đăng rồi mới thấy lỗi.
   Không bao giờ trả chính token ra client. */
export function tokenStatus(row, atSec) {
  if (!row || !row.page_token) return "missing";
  const exp = Number(row.token_expires_at || 0);
  if (exp && exp <= (atSec == null ? nowSec() : atSec)) return "expired";
  return "ok";
}

// Bỏ mọi trường nhạy cảm trước khi trả page ra ngoài.
export function publicPage(row, atSec) {
  return {
    page_id: row.page_id,
    name: row.name,
    active: !!row.active,
    post_hour_vn: row.post_hour_vn,
    weekdays: parseWeekdays(row.weekdays),
    default_sku_main: row.default_sku_main || null,
    default_sku_addon: row.default_sku_addon || null,
    token_status: tokenStatus(row, atSec),
    token_expires_at: row.token_expires_at || null,
  };
}

// Bài trả ra UI: bỏ base64 (nặng), thay bằng cờ có/không ảnh.
export function publicPost(row, { withImage = false } = {}) {
  let tags = [];
  try { tags = JSON.parse(row.hashtags || "[]"); } catch { tags = []; }
  const out = {
    id: row.id,
    page_id: row.page_id,
    vn_date: row.vn_date,
    source: row.source,
    sku_main: row.sku_main,
    sku_addon: row.sku_addon || null,
    angle: row.angle || null,
    caption_th: row.caption_th || "",
    caption_vi: row.caption_vi || "",
    hashtags: tags,
    image_url: row.image_url || null,          // ảnh sản phẩm đã tách nền, để trình duyệt ghép
    has_image: !!(row.image_base64 || row.image_url),
    has_poster: !!row.image_base64,             // đã có ảnh ghép hoàn chỉnh chưa
    poster_title_th: row.poster_title_th || "",
    poster_sub_th: row.poster_sub_th || "",
    poster_title_vi: row.poster_title_vi || "",
    poster_sub_vi: row.poster_sub_vi || "",
    scene_prompt: row.scene_prompt || "",
    status: row.status,
    fb_post_id: row.fb_post_id || null,
    last_error: row.last_error || null,
    cost_usd: row.cost_usd || 0,
    updated_at: row.updated_at,
  };
  if (withImage) {
    if (row.image_base64) out.image_base64 = row.image_base64;
    if (row.bg_base64) out.bg_base64 = row.bg_base64;
  }
  return out;
}
