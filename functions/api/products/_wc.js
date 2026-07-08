// Helper WooCommerce/WordPress dùng chung cho menu "Đăng sản phẩm".
// doscom.vn & noma.vn đều là WordPress + WooCommerce.
//   - Ảnh: upload WP Media (/wp-json/wp/v2/media) bằng Application Password (Basic auth).
//   - Sản phẩm: WooCommerce REST (/wp-json/wc/v3/products) bằng Consumer Key/Secret.
// Ý tưởng uploadMedia/slugify/inject figure tái dùng từ functions/api/geo/publish-wp.js.
//
// ENV cần (secret, KHÔNG hard-code): WC_DOSCOM_CK/CS/USER/APP_PWD, WC_NOMA_CK/CS/USER/APP_PWD.
// URL site là công khai nên để hằng số.

export const SITE_URL = { doscom: "https://doscom.vn", noma: "https://noma.vn" };

export function siteCreds(site, env) {
  const S = String(site || "").toUpperCase(); // DOSCOM | NOMA
  return {
    site,
    url: SITE_URL[site],
    user: env[`WC_${S}_USER`],
    pwd:  env[`WC_${S}_APP_PWD`],
    ck:   env[`WC_${S}_CK`],
    cs:   env[`WC_${S}_CS`],
  };
}

export function isConfigured(c) {
  return !!(c && c.url && c.ck && c.cs && c.user && c.pwd);
}

const wpAuth = (u, p) => "Basic " + btoa(`${u}:${p}`);
const wcAuth = (ck, cs) => "Basic " + btoa(`${ck}:${cs}`);

export function slugify(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function b64ToBytes(b64) {
  const raw = String(b64 || "");
  const bin = atob(raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Giá WooCommerce: giá gốc = regular (gạch), giá bán = sale. Không có giá gốc → chỉ regular.
export function priceFields(price, oldPrice) {
  const p = String(price || "").replace(/[^\d]/g, "");
  const o = String(oldPrice || "").replace(/[^\d]/g, "");
  if (o && p && Number(o) > Number(p)) return { regular_price: o, sale_price: p };
  return { regular_price: p || o || "" };
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function figureHtml(url, alt, caption) {
  const cap = caption
    ? `<figcaption style="text-align:center;font-style:italic;color:#666;font-size:.9em;margin-top:.4em">${esc(caption)}</figcaption>`
    : "";
  return `\n<figure class="wp-block-image aligncenter size-large" style="text-align:center;margin:1.1em auto;display:block"><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" style="display:block;margin:0 auto;max-width:100%;height:auto"/>${cap}</figure>\n`;
}

// Chèn 1 <figure> sau H2/H3 khớp `afterHeading` (khớp gần đúng, sau </p> đầu của section).
// Không tìm thấy heading → nối vào cuối bài.
export function injectFigure(html, afterHeading, url, alt, caption) {
  const fig = figureHtml(url, alt, caption);
  const norm = String(afterHeading || "").trim().toLowerCase().slice(0, 30);
  if (!norm) return html + fig;
  const re = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    if (t && (t.includes(norm) || norm.includes(t.slice(0, 30)))) {
      const insAt = m.index + m[0].length;
      const after = html.slice(insAt);
      const pEnd = after.search(/<\/p>/i);
      const pos = pEnd > -1 ? insAt + pEnd + 4 : insAt;
      return html.slice(0, pos) + fig + html.slice(pos);
    }
  }
  return html + fig;
}

export async function fetchCategories(c) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const u = `${c.url}/wp-json/wc/v3/products/categories?per_page=100&page=${page}&_fields=id,name,parent,count,slug`;
    const r = await fetch(u, { headers: { Authorization: wcAuth(c.ck, c.cs) }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`WC categories ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const arr = await r.json();
    out.push(...arr);
    if (!Array.isArray(arr) || arr.length < 100) break;
  }
  return out;
}

export async function uploadMedia(c, { bytes, filename, mime, alt, caption, title }) {
  const r = await fetch(`${c.url}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: wpAuth(c.user, c.pwd),
      "Content-Type": mime || "image/jpeg",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: bytes,
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`WP media ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const m = await r.json();
  if (alt || caption || title) {
    await fetch(`${c.url}/wp-json/wp/v2/media/${m.id}`, {
      method: "POST",
      headers: { Authorization: wpAuth(c.user, c.pwd), "Content-Type": "application/json" },
      body: JSON.stringify({ alt_text: alt || "", caption: caption || "", title: title || "" }),
    }).catch(() => {});
  }
  return { id: m.id, source_url: m.source_url };
}

export async function createProduct(c, payload) {
  const r = await fetch(`${c.url}/wp-json/wc/v3/products`, {
    method: "POST",
    headers: { Authorization: wcAuth(c.ck, c.cs), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WC product ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}
