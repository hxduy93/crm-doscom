// Đẩy bài lên Facebook Page qua Graph API.
//
// Đây là NƠI DUY NHẤT trong repo gọi Graph API để đăng bài. Bước sinh bài và endpoint
// lịch KHÔNG được import file này — xem tests/thai-social.test.mjs, có test khoá lại.
//
// Khuôn lấy từ post_to_page() của repo fb-group-seeding-agent (bản Python đang chạy thật):
//   có ảnh  → POST /{page_id}/photos  với caption + url|source
//   chỉ chữ → POST /{page_id}/feed    với message
//
// Token: PAGE Access Token, KHÁC token quảng cáo FB_ACCESS_TOKEN đang dùng trong CRM.
// Cần quyền pages_manage_posts + pages_read_engagement.

const API = "v21.0";

/* Phân loại lỗi Graph để UI nói đúng việc cần làm. Lỗi token thì bảo đi cấp lại token,
   đừng bắt user đoán từ một câu tiếng Anh của Facebook. */
export function classifyGraphError(err) {
  const code = Number(err && err.code);
  const sub = Number(err && err.error_subcode);
  // 190 = token hỏng/hết hạn; 102 = phiên hết hạn; 463/467 = token expired/invalid
  if (code === 190 || code === 102 || sub === 463 || sub === 467) return "token";
  if (code === 200 || code === 10 || code === 3) return "permission";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "rate_limit";
  return "other";
}

async function graphPost(path, payload) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null && v !== "") body.set(k, String(v));
  }
  const res = await fetch(`https://graph.facebook.com/${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || data.error) {
    const e = (data && data.error) || {};
    const kind = classifyGraphError(e);
    const err = new Error(e.message || `Graph API HTTP ${res.status}`);
    err.kind = kind;
    err.fbCode = e.code || null;
    throw err;
  }
  return data;
}

/* Đăng một bài. Trả { fb_post_id }.

   imageBytes — bytes ảnh, gửi multipart qua tham số `source`. ĐÂY LÀ ĐƯỜNG CHÍNH.
   imageUrl   — chỉ dùng khi ảnh nằm ở một host CÔNG KHAI ngoài CRM.

   Vì sao không truyền `url` trỏ về chính CRM: crm-doscom.pages.dev nằm sau Cloudflare
   Access, nên Facebook đi lấy ảnh sẽ nhận 302 về trang đăng nhập chứ không phải ảnh —
   đo thật 24/08/2026, mọi file trong /sku-images/ đều trả 302. Bài sẽ lên mà không có
   ảnh, hoặc hỏng hẳn. Nên ảnh thư viện được Function tự đọc bằng binding ASSETS rồi
   gửi bytes; đường đó không đi qua Access. */
export async function postToPage({ pageId, pageToken, message, imageUrl, imageBytes, imageType }) {
  if (!pageId) throw Object.assign(new Error("thiếu page_id"), { kind: "config" });
  if (!pageToken) throw Object.assign(new Error("fanpage chưa có Page Access Token"), { kind: "token" });

  if (imageBytes) {
    const form = new FormData();
    form.set("caption", message);
    form.set("access_token", pageToken);
    const type = imageType || "image/png";
    const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
    form.set("source", new Blob([imageBytes], { type }), `post.${ext}`);
    const res = await fetch(`https://graph.facebook.com/${API}/${pageId}/photos`, { method: "POST", body: form });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data || data.error) {
      const e = (data && data.error) || {};
      const err = new Error(e.message || `Graph API HTTP ${res.status}`);
      err.kind = classifyGraphError(e);
      err.fbCode = e.code || null;
      throw err;
    }
    return { fb_post_id: data.post_id || data.id || null };
  }

  if (imageUrl) {
    const r = await graphPost(`${pageId}/photos`, { caption: message, url: imageUrl, access_token: pageToken });
    return { fb_post_id: r.post_id || r.id || null };
  }

  const r = await graphPost(`${pageId}/feed`, { message, access_token: pageToken });
  return { fb_post_id: r.id || null };
}

// Kiểm token còn sống + đúng page. Dùng lúc user nhập token, để sai thì biết ngay.
export async function verifyPageToken(pageId, pageToken) {
  const url = `https://graph.facebook.com/${API}/${pageId}?fields=name&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || data.error) {
    const e = (data && data.error) || {};
    return { ok: false, kind: classifyGraphError(e), message: e.message || `HTTP ${res.status}` };
  }
  return { ok: true, name: data.name };
}

export function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ══════════ BÀI NHIỀU ẢNH + HẸN GIỜ ══════════════════════════════════════════
   Dùng cho menu "Dịch bài sang Thái": bài gốc thường có nhiều ảnh, và người duyệt muốn
   chọn giờ đăng.

   Đường đi bắt buộc của Facebook cho cả hai việc:
     1. Từng ảnh → POST /{page}/photos với published=false  → trả về photo id (chưa lên tường)
     2. POST /{page}/feed với attached_media[i]={"media_fbid":id}
        · đăng ngay   → không gửi gì thêm
        · hẹn giờ     → published=false + scheduled_publish_time=<epoch giây>

   HẸN GIỜ LÀ VIỆC CỦA FACEBOOK, KHÔNG PHẢI CỦA CRM. Không có cron nào của mình đứng chờ tới
   giờ rồi đăng: người duyệt bấm MỘT lần, bài nằm trong mục "Bài đã lên lịch" của Meta
   Business Suite. Nhờ vậy vẫn giữ nguyên luật cũ của tính năng — CRM không bao giờ tự đăng —
   mà lịch vẫn chạy kể cả khi Pages/Worker chết. */

// Đẩy MỘT ảnh lên dạng chưa đăng. Trả photo id để ghép vào bài.
export async function uploadUnpublishedPhoto({ pageId, pageToken, bytes, imageType, imageUrl }) {
  if (bytes) {
    const form = new FormData();
    form.set("published", "false");
    form.set("access_token", pageToken);
    const type = imageType || "image/png";
    const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
    form.set("source", new Blob([bytes], { type }), `anh.${ext}`);
    const res = await fetch(`https://graph.facebook.com/${API}/${pageId}/photos`, { method: "POST", body: form });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data || data.error || !data.id) {
      const e = (data && data.error) || {};
      const err = new Error(e.message || `Graph API HTTP ${res.status} khi tải ảnh lên`);
      err.kind = classifyGraphError(e);
      err.fbCode = e.code || null;
      throw err;
    }
    return String(data.id);
  }
  const r = await graphPost(`${pageId}/photos`, { published: "false", url: imageUrl, access_token: pageToken });
  if (!r || !r.id) throw Object.assign(new Error("Facebook không trả về id ảnh"), { kind: "other" });
  return String(r.id);
}

/* Đăng bài lên tường (hoặc xếp lịch). images: [{ bytes, imageType } | { imageUrl }].
   scheduledAt: epoch GIÂY, để trống = đăng ngay.
   Trả { fb_post_id, scheduled }. */
export async function postArticleToPage({ pageId, pageToken, message, images = [], scheduledAt = null }) {
  if (!pageId) throw Object.assign(new Error("thiếu page_id"), { kind: "config" });
  if (!pageToken) throw Object.assign(new Error("fanpage chưa có Page Access Token"), { kind: "token" });

  const mediaIds = [];
  for (const im of images) {
    if (!im) continue;
    mediaIds.push(await uploadUnpublishedPhoto({
      pageId, pageToken,
      bytes: im.bytes || null, imageType: im.imageType || null, imageUrl: im.imageUrl || null,
    }));
  }

  const payload = { message, access_token: pageToken };
  mediaIds.forEach((id, i) => { payload[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  if (scheduledAt) {
    payload.published = "false";
    payload.scheduled_publish_time = String(Math.floor(scheduledAt));
  }

  const r = await graphPost(`${pageId}/feed`, payload);
  return { fb_post_id: r.id || null, scheduled: !!scheduledAt, photo_ids: mediaIds };
}
