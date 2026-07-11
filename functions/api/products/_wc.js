// Helper WooCommerce/WordPress dùng chung cho menu "Đăng sản phẩm".
// doscom.vn & noma.vn đều là WordPress + WooCommerce.
//   - Ảnh: upload WP Media (/wp-json/wp/v2/media) bằng Application Password (Basic auth).
//   - Sản phẩm: WooCommerce REST (/wp-json/wc/v3/products) bằng Consumer Key/Secret.
// Ý tưởng uploadMedia/slugify/inject figure tái dùng từ functions/api/geo/publish-wp.js.
//
// ENV cần (secret, KHÔNG hard-code): WC_DOSCOM_CK/CS/USER/APP_PWD, WC_NOMA_CK/CS/USER/APP_PWD.
// URL site là công khai nên để hằng số.

export const SITE_URL = {
  doscom: "https://doscom.vn",
  noma: "https://noma.vn",
  nomaauto: "https://nomaauto.us", // bản tiếng Anh (USD)
};

export const VND_USD_RATE = 26500;

// Đổi giá VND (chuỗi có dấu chấm) → USD chuỗi 2 số lẻ.
export function vndToUsd(vnd, rate) {
  const n = Number(String(vnd || "").replace(/[^\d]/g, ""));
  const r = Number(rate) || VND_USD_RATE;
  return n ? (n / r).toFixed(2) : "";
}

// Trường giá WooCommerce cho site USD (nomaauto): quy đổi từ VND.
export function usdPriceFields(price, oldPrice, rate) {
  const p = vndToUsd(price, rate), o = vndToUsd(oldPrice, rate);
  if (o && p && Number(o) > Number(p)) return { regular_price: o, sale_price: p };
  return { regular_price: p || o || "" };
}

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

// Suy ra từ khóa dự phòng từ tên sản phẩm khi AI không trả primary_keyword
// (để focus keyword Rank Math KHÔNG BAO GIỜ rỗng → không bị N/A).
export function deriveKeyword(name) {
  let s = String(name || "").split(/[-–—|(]/)[0];                     // bỏ phần model/biến thể sau gạch
  s = s.replace(/\b\d+[\s.]*(ml|l|g|kg|gb|tb|w|mah|cm|mm|inch|")?\b/gi, " "); // bỏ số + đơn vị
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s.split(" ").filter(Boolean).slice(0, 6).join(" ");
}

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

// Chèn ảnh theo VỊ TRÍ (sau H2 thứ i) — dùng cho bài đã dịch sang tiếng Anh
// (không match được after_heading tiếng Việt). figures = [{url, alt, caption}] theo thứ tự.
export function injectByPosition(html, figures) {
  let out = html;
  for (let i = 0; i < (figures || []).length; i++) {
    const fig = figureHtml(figures[i].url, figures[i].alt, figures[i].caption);
    const re = /<\/h2>/gi;
    let m, count = 0, hEnd = -1;
    while ((m = re.exec(out)) !== null) {
      if (count === i) { hEnd = m.index + m[0].length; break; }
      count++;
    }
    if (hEnd < 0) { out += fig; continue; }
    const after = out.slice(hEnd);
    const pe = after.search(/<\/p>/i);
    const pos = pe > -1 ? hEnd + pe + 4 : hEnd;
    out = out.slice(0, pos) + fig + out.slice(pos);
  }
  return out;
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

// Nhận diện sản phẩm NOMA (để menu "Sửa brandcore" chỉ áp brand core cho SP NOMA,
// bỏ qua SP Doscom trên cùng 1 web). Khớp "noma" trong tên/mô tả (không phân biệt hoa thường).
export function isNomaProduct(p) {
  const hay = `${p?.name || ""} ${p?.short_description || ""} ${p?.description || ""}`.toLowerCase();
  return /\bnoma\b/.test(hay);
}

// Liệt kê sản phẩm WooCommerce (1 trang). Trả { items, total, totalPages }.
export async function listProducts(c, { search = "", perPage = 50, page = 1, status = "publish" } = {}) {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    _fields: "id,name,permalink,status,description,short_description,categories",
    _cb: String(Date.now()), // cache-bust: tránh WP/CDN trả bản cũ sau khi vừa sửa
  });
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  const r = await fetch(`${c.url}/wp-json/wc/v3/products?${params}`, {
    headers: { Authorization: wcAuth(c.ck, c.cs), "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`WC list ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const arr = await r.json();
  return {
    items: Array.isArray(arr) ? arr : [],
    total: Number(r.headers.get("X-WP-Total") || 0),
    totalPages: Number(r.headers.get("X-WP-TotalPages") || 1),
  };
}

// Lấy 1 sản phẩm đầy đủ (dùng để backup trước khi ghi đè).
export async function getProduct(c, id) {
  const r = await fetch(`${c.url}/wp-json/wc/v3/products/${id}?_fields=id,name,permalink,status,description,short_description&_cb=${Date.now()}`, {
    headers: { Authorization: wcAuth(c.ck, c.cs), "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WC get ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}

// Cập nhật 1 sản phẩm (PUT). Giữ nguyên status hiện tại nếu payload không đổi status.
export async function updateProduct(c, id, payload) {
  const r = await fetch(`${c.url}/wp-json/wc/v3/products/${id}`, {
    method: "PUT",
    headers: { Authorization: wcAuth(c.ck, c.cs), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WC update ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  return d;
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
