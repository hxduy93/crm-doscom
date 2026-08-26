// Dùng chung cho /api/thai-social/repost/* — menu "Dịch bài sang Thái".
//
// Dựa trên _lib.js của agent thai-social (cùng agent, cùng token ghi X-Thai-Token, cùng
// bảng fanpage thai_pages). Ở đây chỉ thêm những thứ riêng của bài dịch lại: trạng thái
// "đã hẹn giờ", chỗ cất ảnh, và luật kiểm giờ hẹn.

import { STATUS, nowSec } from "./_lib.js";

// Thêm một trạng thái so với bài sinh theo SKU: bài đã giao cho Facebook giữ, chờ tới giờ.
export const RSTATUS = { ...STATUS, SCHEDULED: "scheduled" };

// Bài đã đưa sang Facebook (published/scheduled) thì không sửa, không đăng lại từ CRM.
export const RPUBLISHABLE = [RSTATUS.REVIEW, RSTATUS.EDITED];

/* Giờ hẹn đăng. Facebook chỉ nhận lịch từ 10 phút tới 6 tháng kể từ lúc gọi API; gửi ngoài
   khoảng đó là Graph trả lỗi khó hiểu, nên chặn ngay ở đây và nói bằng tiếng Việt.
   Chừa 11 phút thay vì đúng 10 để không trượt vì mấy giây gọi mạng. */
export const SCHEDULE_MIN_LEAD = 11 * 60;
export const SCHEDULE_MAX_AHEAD = 180 * 86400;

export function checkScheduledAt(at, now = nowSec()) {
  const t = Number(at);
  if (!Number.isFinite(t) || t <= 0) return { error: "gio_hen_khong_hop_le" };
  if (t < now + SCHEDULE_MIN_LEAD) {
    return { error: "gio_hen_qua_gan", detail: "Facebook chỉ nhận lịch cách hiện tại ít nhất 10 phút. Chọn giờ muộn hơn, hoặc bấm Đăng ngay." };
  }
  if (t > now + SCHEDULE_MAX_AHEAD) {
    return { error: "gio_hen_qua_xa", detail: "Facebook chỉ nhận lịch trong vòng 6 tháng tới." };
  }
  return { at: Math.floor(t) };
}

/* ── Chỗ cất ảnh ────────────────────────────────────────────────────────────
   Ảnh đã vẽ lại nằm ở KV (binding INVENTORY), D1 chỉ giữ khoá. Một ảnh 1024px base64 nặng
   ~1,4MB — nhét vào D1 là phình bảng và mọi câu SELECT đều kéo theo. KV vốn là chỗ cache
   của CRM, giới hạn 25MB/giá trị, thừa sức.

   Khoá dựng từ TÊN FILE ảnh gốc, không phải cả URL: link scontent của Facebook có chữ ký
   hết hạn ở query nên cùng một tấm ảnh mỗi lần lấy lại ra URL khác — lấy cả URL làm khoá là
   không bao giờ trúng cache và lần nào cũng trả tiền vẽ lại. */
export const IMG_TTL = 7 * 86400;
const IMG_VER = "v1";

export function imageIdentity(src) {
  const s = String(src || "");
  let path = s;
  try { path = new URL(s).pathname; } catch { /* không phải URL thì lấy nguyên chuỗi */ }
  const last = path.split("/").filter(Boolean).pop() || "";
  const clean = last.replace(/[^\w.\-]/g, "").slice(-80);
  return clean || fnv1a(s);
}

// Hash ngắn, chỉ để đặt tên khoá KV khi tên file không dùng được. Không dùng cho bảo mật.
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

export const imageKey = (src) => `thai_repost:img:${IMG_VER}:${imageIdentity(src)}`;

export async function readImageCache(env, key) {
  if (!env || !env.INVENTORY) return null;
  try {
    const raw = await env.INVENTORY.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function writeImageCache(env, key, val) {
  if (!env || !env.INVENTORY) return false;
  try {
    await env.INVENTORY.put(key, JSON.stringify(val), { expirationTtl: IMG_TTL });
    return true;
  } catch { return false; }   // cache hỏng không được làm gãy cả bài
}

/* ── Hình dạng trả ra UI ────────────────────────────────────────────────────
   Bỏ base64 (nặng) khỏi danh sách; UI xem ảnh qua endpoint riêng khi cần. */
export function publicRepost(row, { withImages = false } = {}) {
  const parse = (s, fb) => { try { return JSON.parse(s || ""); } catch { return fb; } };
  const images = parse(row.images, []) || [];
  return {
    id: row.id,
    page_id: row.page_id,
    vn_date: row.vn_date,
    src_url: row.src_url,
    src_post_id: row.src_post_id || null,
    src_page_id: row.src_page_id || null,
    src_page_name: row.src_page_name || null,
    caption_vi: row.caption_vi || "",
    caption_th: row.caption_th || "",
    caption_vi_back: row.caption_vi_back || "",
    hashtags: parse(row.hashtags, []) || [],
    warnings: parse(row.warnings, []) || [],
    image_mode: row.image_mode || "auto",
    images: images.map((im, i) => ({
      idx: i,
      src: im.src,
      has_text: !!im.has_text,
      translated: !!im.translated,
      text_vi: im.text_vi || "",
      text_th: im.text_th || "",
      note: im.note || null,
      // Ảnh đã vẽ lại xem qua /api/thai-social/repost/image/:id/:idx — không nhồi base64 vào JSON.
      preview: im.translated ? `/api/thai-social/repost/image/${row.id}/${i}` : im.src,
      ...(withImages && im.kv_key ? { kv_key: im.kv_key } : {}),
    })),
    scheduled_at: row.scheduled_at || null,
    status: row.status,
    fb_post_id: row.fb_post_id || null,
    last_error: row.last_error || null,
    cost_usd: row.cost_usd || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Chữ thật sự đăng lên: caption + hashtag. Một chỗ duy nhất, để bản xem trước và bản đăng
// không bao giờ khác nhau.
export function fullMessage(row) {
  let tags = [];
  try { tags = JSON.parse(row.hashtags || "[]"); } catch { tags = []; }
  const line = tags.length ? "\n\n" + tags.map((t) => "#" + String(t).replace(/^#/, "").replace(/\s+/g, "")).join(" ") : "";
  return String(row.caption_th || "").trim() + line;
}
