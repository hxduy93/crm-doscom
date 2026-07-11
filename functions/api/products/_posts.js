// Helper WordPress POSTS (bài viết) dùng cho đồng bộ bài viết noma.vn/doscom.vn → nomaauto.us.
// Khác _wc.js (sản phẩm, WooCommerce REST): bài viết đi qua WP REST v2 (/wp-json/wp/v2/posts)
// và xác thực bằng Application Password (Basic auth) — tái dùng creds WC_<SITE>_USER/APP_PWD.
//
// Ảnh trong bài: KHÔNG hotlink về web VN. Trước khi dịch, mọi <img> được thay src bằng placeholder
// (dịch không đụng URL, không tốn token cho URL dài); sau khi dịch thì copy ảnh sang WP Media của
// nomaauto.us rồi trả src mới về đúng vị trí cũ. Ảnh nào copy hỏng thì gỡ hẳn thẻ ảnh đó.

const wpAuth = (u, p) => "Basic " + btoa(`${u}:${p}`);

export const IMG_PLACEHOLDER_PREFIX = "__NOMA_IMG_";

function unwrapRendered(v) {
  if (v && typeof v === "object" && typeof v.rendered === "string") return v.rendered;
  return typeof v === "string" ? v : "";
}

// Liệt kê bài viết đã publish của 1 site (duyệt tối đa `maxPages` trang).
export async function listPosts(c, { perPage = 50, maxPages = 6 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      status: "publish",
      _fields: "id,slug,link,date,title,excerpt",
      _cb: String(Date.now()),
    });
    const r = await fetch(`${c.url}/wp-json/wp/v2/posts?${params}`, {
      headers: { Authorization: wpAuth(c.user, c.pwd), "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error(`WP posts list ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) break;
    for (const p of arr) {
      out.push({
        id: p.id,
        slug: p.slug,
        link: p.link,
        date: p.date,
        title: unwrapRendered(p.title),
        excerpt: unwrapRendered(p.excerpt),
      });
    }
    const totalPages = Number(r.headers.get("X-WP-TotalPages") || 1);
    if (page >= totalPages) break;
  }
  return out;
}

// Lấy 1 bài đầy đủ (nội dung + ảnh đại diện).
export async function getPostFull(c, id) {
  const f = "id,slug,link,date,title,content,excerpt,featured_media";
  const r = await fetch(`${c.url}/wp-json/wp/v2/posts/${id}?_fields=${f}&_cb=${Date.now()}`, {
    headers: { Authorization: wpAuth(c.user, c.pwd), "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(25000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WP post get ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return {
    id: d.id,
    slug: d.slug,
    link: d.link,
    title: unwrapRendered(d.title),
    content: unwrapRendered(d.content),
    excerpt: unwrapRendered(d.excerpt),
    featured_media: d.featured_media || 0,
  };
}

// URL file gốc của 1 media (dùng để copy ảnh đại diện sang site đích).
export async function getMediaUrl(c, mediaId) {
  if (!mediaId) return "";
  const r = await fetch(`${c.url}/wp-json/wp/v2/media/${mediaId}?_fields=source_url`, {
    headers: { Authorization: wpAuth(c.user, c.pwd) },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return "";
  const d = await r.json().catch(() => ({}));
  return d.source_url || "";
}

// Danh mục BÀI VIẾT của site (khác danh mục sản phẩm WooCommerce).
export async function fetchPostCategories(c) {
  const r = await fetch(`${c.url}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,count,parent`, {
    headers: { Authorization: wpAuth(c.user, c.pwd) },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`WP categories ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const arr = await r.json();
  return Array.isArray(arr) ? arr : [];
}

// Tag theo tên: tìm trước, chưa có thì tạo. Lỗi 1 tag không làm hỏng cả bài.
export async function resolveTags(c, names, slugify) {
  const ids = [];
  for (const name of (names || []).slice(0, 8)) {
    const n = String(name || "").trim();
    if (!n) continue;
    try {
      const s = await fetch(`${c.url}/wp-json/wp/v2/tags?search=${encodeURIComponent(n)}&per_page=10&_fields=id,name`, {
        headers: { Authorization: wpAuth(c.user, c.pwd) },
        signal: AbortSignal.timeout(15000),
      });
      if (s.ok) {
        const found = await s.json();
        const exact = (Array.isArray(found) ? found : []).find((t) => t.name.toLowerCase() === n.toLowerCase());
        if (exact) { ids.push(exact.id); continue; }
      }
      const cr = await fetch(`${c.url}/wp-json/wp/v2/tags`, {
        method: "POST",
        headers: { Authorization: wpAuth(c.user, c.pwd), "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, slug: slugify(n) }),
        signal: AbortSignal.timeout(15000),
      });
      if (cr.ok) { const t = await cr.json(); if (t.id) ids.push(t.id); }
    } catch { /* bỏ qua tag lỗi */ }
  }
  return ids;
}

export async function createPost(c, payload) {
  const r = await fetch(`${c.url}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: wpAuth(c.user, c.pwd), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WP post create ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

// ── Ảnh trong bài ────────────────────────────────────────────────────────────

// Thay src của mọi <img> bằng placeholder + bỏ srcset/sizes (srcset trỏ về web VN → phải bỏ,
// nếu không WP đích vẫn tải ảnh từ noma.vn). Trả { html, images:[{src}] } theo thứ tự xuất hiện.
export function extractImages(html, { limit = 10 } = {}) {
  const images = [];
  const seen = new Map();
  let out = String(html || "").replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i);
    const src = m ? m[1] : "";
    if (!src) return tag;
    let idx = seen.get(src);
    if (idx === undefined) {
      if (images.length >= limit) return ""; // vượt hạn mức → gỡ hẳn ảnh (không hotlink)
      idx = images.length;
      seen.set(src, idx);
      images.push({ src });
    }
    return tag
      .replace(/\ssrcset\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\ssizes\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\ssrc\s*=\s*["'][^"']+["']/i, ` src="${IMG_PLACEHOLDER_PREFIX}${idx}__"`);
  });
  out = cleanupOrphanFigures(out);
  return { html: out, images };
}

// Trả src thật vào chỗ placeholder. urls[i] rỗng/null (copy ảnh hỏng) → gỡ thẻ ảnh đó.
export function restoreImages(html, urls) {
  let out = String(html || "");
  (urls || []).forEach((url, i) => {
    const ph = `${IMG_PLACEHOLDER_PREFIX}${i}__`;
    if (url) out = out.split(ph).join(url);
  });
  // Placeholder còn sót = ảnh copy hỏng → bỏ cả thẻ <img> đó.
  out = out.replace(new RegExp(`<img\\b[^>]*${IMG_PLACEHOLDER_PREFIX}\\d+__[^>]*>`, "gi"), "");
  return cleanupOrphanFigures(out);
}

// <figure> rỗng (đã gỡ ảnh bên trong) thì bỏ luôn cả figure + figcaption.
function cleanupOrphanFigures(html) {
  return String(html || "").replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (block, inner) =>
    /<img\b/i.test(inner) ? block : ""
  );
}
