// Đọc BÀI GỐC trên fanpage Việt từ cái link người dùng dán vào.
//
// Chỉ ĐỌC. File này không đăng gì — đăng bài vẫn là việc riêng của _graph.js.
//
// Khó nhất không phải gọi Graph API mà là biết bài nào: Facebook đang trả về đủ kiểu link
// và phần lớn KHÔNG chứa id số nữa. Ba nhóm gặp thật:
//   1. Có id số   — /permalink.php?story_fbid=123&id=456, /{page_id}/posts/123 → ghép thẳng.
//   2. pfbid…     — link "Sao chép liên kết" của Facebook từ 2022 trở đi. pfbid KHÔNG tra
//                   được qua Graph API. Phải biết fanpage rồi dò trong các bài gần đây,
//                   so `permalink_url` để tìm đúng bài.
//   3. Link rút gọn — fb.watch/…, /share/p/… → đi theo redirect lấy link thật rồi quay lại 1-2.
//
// Token đọc: KHÁC token đăng bài của fanpage Thái.
//   FB_PAGE_READ_TOKEN (nếu đặt) → FB_ACCESS_TOKEN (token quảng cáo đang có sẵn trong CRM).
// Đây là token NGƯỜI DÙNG của một quản trị viên; từ nó lấy ra page token của từng fanpage
// (xem khối ngay dưới — Facebook bắt buộc page token mới đọc được bài).

const API = "v21.0";
const GRAPH = `https://graph.facebook.com/${API}`;

const POST_FIELDS =
  "id,message,story,created_time,permalink_url,from{id,name},full_picture," +
  "attachments{media_type,type,title,description,media,subattachments}";

export function readToken(env) {
  return (env && (env.FB_PAGE_READ_TOKEN || env.FB_ACCESS_TOKEN)) || "";
}

/* ĐỌC BÀI PHẢI DÙNG PAGE ACCESS TOKEN, KHÔNG PHẢI TOKEN NGƯỜI DÙNG.

   Đo thật 26/08/2026 với token của quản trị viên có ĐỦ quyền (pages_read_engagement,
   pages_read_user_content, pages_manage_posts): gọi /{page_id}/posts bằng token NGƯỜI DÙNG
   trả 190 / subcode 2069032 — "Lệnh gọi này cần mã truy cập Trang đối với trải nghiệm Trang
   mới". Đủ quyền vẫn không đọc được; Facebook bắt buộc token của chính Trang.

   Nên đường đi là: token người dùng → /me/accounts lấy PAGE TOKEN của fanpage nguồn → mọi
   lời gọi đọc bài dùng page token đó. Token người dùng chỉ còn dùng để lấy danh sách trang. */

// Danh sách fanpage token này quản trị. KHÔNG trả access_token ra ngoài — xem sourcePages().
async function fetchAccounts(token, withToken) {
  const fields = withToken ? "id,name,category,access_token" : "id,name,category";
  const out = [];
  let url = `${GRAPH}/me/accounts?fields=${fields}&limit=100&access_token=${encodeURIComponent(token)}`;
  for (let page = 0; page < 3 && url; page++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.error) {
      const e = (data && data.error) || {};
      const err = new Error(e.message || `Graph API HTTP ${res.status}`);
      err.kind = "graph";
      throw err;
    }
    out.push(...(data.data || []));
    url = (data.paging && data.paging.next) || null;
  }
  return out;
}

/* Danh sách fanpage cho ô chọn "fanpage nguồn". Không bao giờ kèm token.
   Cache KV 6 giờ: danh sách gần như không đổi, mà mỗi lần mở trang gọi lại Facebook là phí. */
export async function sourcePages(env) {
  const token = readToken(env);
  if (!token) {
    throw Object.assign(new Error("Chưa có token đọc fanpage. Đặt secret FB_PAGE_READ_TOKEN."), { kind: "no_token" });
  }
  const KEY = "thai_repost:src_pages:v1";
  if (env.INVENTORY) {
    try {
      const raw = await env.INVENTORY.get(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* cache hỏng thì hỏi thẳng Facebook */ }
  }
  const rows = (await fetchAccounts(token, false))
    .map((p) => ({ id: String(p.id), name: p.name || String(p.id), category: p.category || "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  if (env.INVENTORY) {
    try { await env.INVENTORY.put(KEY, JSON.stringify(rows), { expirationTtl: 6 * 3600 }); } catch {}
  }
  return rows;
}

/* Page token của một fanpage nguồn. Trả null nếu token đang dùng vốn đã LÀ page token
   (khi đó /me/accounts không gọi được) — chỗ gọi cứ dùng tiếp token gốc. */
async function pageAccessToken(env, pageId) {
  const token = readToken(env);
  if (!token || !pageId) return null;
  try {
    const rows = await fetchAccounts(token, true);
    const hit = rows.find((p) => String(p.id) === String(pageId));
    return (hit && hit.access_token) || null;
  } catch { return null; }
}

/* Bóc link thành mảnh nhận dạng được. KHÔNG gọi mạng — tách riêng để test được.

   Trả { pageRef, postId, pfbid, photoId, fullId, shortlink } (thiếu cái nào thì undefined). */
export function parseFbPostUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return {};

  let u;
  try { u = new URL(s.startsWith("http") ? s : `https://${s}`); } catch { return {}; }

  const host = u.hostname.replace(/^www\.|^m\.|^web\./, "").toLowerCase();
  const okHost = host === "facebook.com" || host === "fb.com" || host === "fb.watch"
                 || host.endsWith(".facebook.com");
  if (!okHost) return {};

  const parts = u.pathname.split("/").filter(Boolean);
  const q = u.searchParams;

  // fb.watch/abc/ và facebook.com/share/... — phải đi theo redirect mới biết bài nào.
  if (host === "fb.watch" || parts[0] === "share") return { shortlink: u.toString() };

  // /permalink.php?story_fbid=…&id=…  ·  /story.php?…
  const story = q.get("story_fbid");
  const owner = q.get("id");
  if (story) {
    if (/^\d+$/.test(story)) return { pageRef: owner || undefined, postId: story };
    return { pageRef: owner || undefined, pfbid: story };
  }

  // /photo.php?fbid=…  ·  /photo/?fbid=…
  const fbid = q.get("fbid");
  if (fbid && /^\d+$/.test(fbid)) return { pageRef: owner || undefined, photoId: fbid };

  // /{pageRef}/posts/{id}  ·  /{pageRef}/videos/{id}  ·  /{pageRef}/photos/{album}/{id}
  const i = parts.findIndex((p) => p === "posts" || p === "videos" || p === "photos" || p === "reel");
  if (i >= 0) {
    const pageRef = i > 0 ? parts[i - 1] : undefined;
    const tail = parts.slice(i + 1).filter((p) => p !== "" && !/^a\.\d+$/.test(p));
    const id = tail[tail.length - 1] || "";
    if (/^pfbid[\w-]+$/i.test(id)) return { pageRef, pfbid: id };
    if (/^\d+$/.test(id)) {
      if (parts[i] === "photos") return { pageRef, photoId: id };
      return { pageRef, postId: id };
    }
    return { pageRef };
  }

  // Dán thẳng id kiểu 123_456
  if (parts.length === 1 && /^\d+_\d+$/.test(parts[0])) return { fullId: parts[0] };

  return {};
}

async function graphGet(path, params, token) {
  const qs = new URLSearchParams(params || {});
  qs.set("access_token", token);
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { signal: AbortSignal.timeout(25000) });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || data.error) {
    const e = (data && data.error) || {};
    const err = new Error(e.message || `Graph API HTTP ${res.status}`);
    err.fbCode = e.code || null;
    err.graph = true;
    throw err;
  }
  return data;
}

// Tên fanpage trên URL (vd "NomaVietnam") → page id số. Cần cho đường dò pfbid.
async function pageRefToId(ref, token) {
  if (!ref) return null;
  if (/^\d+$/.test(ref)) return ref;
  if (/^(profile\.php|people|pg|pages)$/i.test(ref)) return null;
  try {
    const r = await graphGet(encodeURIComponent(ref), { fields: "id" }, token);
    return r && r.id ? String(r.id) : null;
  } catch { return null; }
}

/* Dò bài theo pfbid: lấy các bài gần đây của fanpage rồi so permalink_url.
   Graph trả permalink_url CŨNG ở dạng pfbid nên so chuỗi là khớp được.

   Dừng ở 100 bài: dò sâu hơn thì mỗi lần dán nhầm link phải trả giá bằng 10 lời gọi Graph,
   mà bài cần dịch lại gần như luôn là bài mới đăng. */
async function findByPfbid(pageId, pfbid, token, maxPosts = 100) {
  const key = String(pfbid).toLowerCase();
  const hit = (list) => (list || []).find((p) =>
    String(p.permalink_url || "").toLowerCase().includes(key));

  let data = await graphGet(`${pageId}/posts`, { fields: POST_FIELDS, limit: "25" }, token);
  let seen = 0;
  for (let round = 0; round < 4; round++) {
    const found = hit(data && data.data);
    if (found) return found;
    seen += ((data && data.data) || []).length;
    const next = data && data.paging && data.paging.next;
    if (!next || seen >= maxPosts) break;
    // Trang kế: Graph đã ký sẵn cả token vào URL → gọi thẳng.
    const res = await fetch(next, { signal: AbortSignal.timeout(25000) });
    data = await res.json().catch(() => null);
    if (!data || data.error || !data.data) break;
  }
  return null;
}

// Gom ảnh từ attachments. Album thì ảnh nằm trong subattachments.
export function collectImages(post, max = 6) {
  const out = [];
  const push = (src) => {
    const s = String(src || "");
    if (!s || out.includes(s)) return;
    if (out.length < max) out.push(s);
  };
  const walk = (node) => {
    if (!node) return;
    const media = node.media || {};
    if (media.image && media.image.src) push(media.image.src);
    for (const sub of (node.subattachments && node.subattachments.data) || []) walk(sub);
  };
  for (const a of (post.attachments && post.attachments.data) || []) walk(a);
  if (!out.length && post.full_picture) push(post.full_picture);
  return out;
}

/* Lấy bài gốc. Trả { post_id, page_id, page_name, message, permalink, images[], created_time }.

   Ném Error có .kind để chỗ gọi nói đúng việc cần làm:
     no_token · bad_url · need_page · not_found · graph */
export async function fetchSourcePost(env, { url, srcPageId }) {
  const token = readToken(env);
  if (!token) {
    throw Object.assign(
      new Error("Chưa có token đọc bài gốc. Đặt secret FB_PAGE_READ_TOKEN (hoặc FB_ACCESS_TOKEN) "
              + "bằng token có quyền trên chính fanpage Việt đó."),
      { kind: "no_token" });
  }

  let parsed = parseFbPostUrl(url);

  // Link rút gọn: đi theo redirect một lần để lấy link thật.
  if (parsed.shortlink) {
    let finalUrl = "";
    try {
      const r = await fetch(parsed.shortlink, { redirect: "follow", signal: AbortSignal.timeout(15000) });
      finalUrl = r.url || "";
    } catch { /* mạng hỏng thì rơi xuống báo bad_url bên dưới */ }
    const again = parseFbPostUrl(finalUrl);
    if (again.postId || again.pfbid || again.photoId || again.fullId) parsed = again;
    else {
      throw Object.assign(
        new Error("Link rút gọn không mở ra được bài cụ thể. Mở bài trên Facebook rồi copy link trên thanh địa chỉ."),
        { kind: "bad_url" });
    }
  }

  if (!parsed.postId && !parsed.pfbid && !parsed.photoId && !parsed.fullId) {
    throw Object.assign(
      new Error("Không đọc được link này. Cần link một BÀI trên fanpage, dạng "
              + "facebook.com/<fanpage>/posts/… hoặc facebook.com/permalink.php?story_fbid=…"),
      { kind: "bad_url" });
  }

  /* SỐ ĐỨNG TRƯỚC "/posts/" TRONG LINK KHÔNG CHẮC LÀ ID FANPAGE.

     Đo thật 26/08/2026 trên fanpage "Noma Việt Nam" (id 1101583133049069): permalink của
     bài lại là facebook.com/122117794587378629/posts/122117757075378629 — số đầu KHÔNG có
     trong /me/accounts, nên không tra ra page token nào. Đó chính là lúc ô "Fanpage nguồn"
     có việc: nó nói cho hệ thống biết token của trang nào mới đọc được bài này.

     Hai id khác nhau nên phải giữ RIÊNG:
       linkRef — số/tên lấy từ link, dùng để ghép id bài
       ownerId — fanpage thật, dùng để lấy PAGE TOKEN (ưu tiên ô người dùng chọn) */
  const linkRef = /^\d+$/.test(parsed.pageRef || "") ? parsed.pageRef
                : await pageRefToId(parsed.pageRef, token);
  const ownerId = srcPageId || linkRef;

  /* Token đọc bài. Thử page token của trang người dùng chọn trước, rồi tới trang đoán từ
     link. Không ra cái nào thì dùng tạm token gốc — nếu nó vốn đã là page token thì chạy,
     còn không Facebook trả 2069032 và wrapNotFound() dịch thành "chọn Fanpage nguồn". */
  const tok = (srcPageId && await pageAccessToken(env, srcPageId))
              || (linkRef && await pageAccessToken(env, linkRef))
              || token;

  // Id bài đầy đủ luôn là {gì đó}_{post_id}. Id bài TRẦN không tra được (Graph trả
  // "(#12) singular statuses API is deprecated") nên đừng phí một lời gọi cho nó.
  const pageId = ownerId;
  let node = null;

  if (parsed.fullId) {
    node = await graphGet(parsed.fullId, { fields: POST_FIELDS }, tok);
  } else if (parsed.postId) {
    /* Thử cả hai cách ghép: theo số trên link (đo thật là CHẠY khi có đúng page token) và
       theo fanpage người dùng chọn. Một trong hai trúng là xong. */
    const candidates = [...new Set([
      linkRef ? `${linkRef}_${parsed.postId}` : null,
      srcPageId ? `${srcPageId}_${parsed.postId}` : null,
    ].filter(Boolean))];
    if (!candidates.length) {
      throw Object.assign(
        new Error("Link không cho biết bài thuộc fanpage nào. Chọn Fanpage nguồn ở ô bên trái rồi bấm lại."),
        { kind: "need_page" });
    }
    let lastErr = null;
    for (const id of candidates) {
      try { node = await graphGet(id, { fields: POST_FIELDS }, tok); break; }
      catch (e) { lastErr = e; }
    }
    if (!node) throw wrapNotFound(lastErr);
  } else if (parsed.photoId) {
    // Node ảnh: caption nằm ở `name`, ảnh ở `images[0].source`.
    try {
      const ph = await graphGet(parsed.photoId, { fields: "id,name,created_time,link,images,from{id,name}" }, tok);
      node = {
        id: ph.id, message: ph.name || "", created_time: ph.created_time,
        permalink_url: ph.link, from: ph.from,
        full_picture: (ph.images && ph.images[0] && ph.images[0].source) || null,
      };
    } catch (e) { throw wrapNotFound(e); }
  } else if (parsed.pfbid) {
    if (!pageId) {
      throw Object.assign(
        new Error("Link dạng pfbid không tra thẳng được. Chọn Fanpage nguồn ở ô bên trái để hệ thống "
                + "dò trong các bài gần đây của đúng trang đó."),
        { kind: "need_page" });
    }
    node = await findByPfbid(pageId, parsed.pfbid, tok);
    if (!node) {
      throw Object.assign(
        new Error("Không tìm thấy bài này trong 100 bài gần nhất của fanpage. Bài quá cũ, hoặc token "
                + "không có quyền đọc fanpage đó."),
        { kind: "not_found" });
    }
  }

  if (!node || !node.id) throw Object.assign(new Error("Graph API không trả về bài nào."), { kind: "not_found" });

  const message = String(node.message || node.story || "").trim();
  return {
    post_id: String(node.id),
    page_id: (node.from && node.from.id) || pageId || null,
    page_name: (node.from && node.from.name) || null,
    message,
    permalink: node.permalink_url || String(url),
    created_time: node.created_time || null,
    images: collectImages(node),
  };
}

function wrapNotFound(e) {
  const msg = String((e && e.message) || "");
  /* "cần mã truy cập Trang" (code 190 / subcode 2069032) không phải thiếu quyền: nghĩa là
     lời gọi đang chạy bằng token NGƯỜI DÙNG, mà fanpage đó ở trải nghiệm Trang mới nên
     Facebook chỉ chấp nhận page token. Xảy ra khi không biết fanpage nguồn là trang nào →
     bảo người dùng chọn ở ô Fanpage nguồn, đừng bắt họ đi xin thêm quyền vô ích. */
  if (/mã truy cập Trang|Page access token|2069032/i.test(msg)) {
    return Object.assign(
      new Error("Facebook đòi mã truy cập của chính Trang. Chọn đúng Fanpage nguồn ở ô bên trái rồi bấm lại."),
      { kind: "need_page" });
  }
  const denied = /permission|not have|OAuth|access token/i.test(msg);
  const err = new Error(denied
    ? `Token không có quyền đọc bài này (${msg}). Dùng token của người quản trị chính fanpage đó.`
    : `Không đọc được bài gốc: ${msg}`);
  err.kind = denied ? "graph" : "not_found";
  return err;
}

/* Tải ảnh gốc về bytes. Trả null nếu không tải được / không phải ảnh — chỗ gọi phải coi
   như ảnh đó giữ nguyên link, đừng đăng bừa một mảng byte hỏng. */
export async function downloadImage(src, maxBytes = 8 * 1024 * 1024) {
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\//.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 100 || buf.byteLength > maxBytes) return null;
    return { bytes: new Uint8Array(buf), type: type === "image/jpg" ? "image/jpeg" : type };
  } catch { return null; }
}
