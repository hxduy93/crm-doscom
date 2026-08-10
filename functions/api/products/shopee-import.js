// POST /api/products/shopee-import   (ENDPOINT ĐỌC — có bảo vệ giống các endpoint ghi)
// Dán link Shopee → trả về tên / giá / mô tả / ảnh (base64) để đổ thẳng vào trang
// "Đăng sản phẩm", rồi đi tiếp đường cũ: /api/products/generate → /api/products/publish.
//
// VÌ SAO PHẢI RENDER BẰNG TRÌNH DUYỆT (đo thật 2026-08-10, đừng thử lại kiểu cũ):
//   - Gọi API dữ liệu của Shopee (/api/v4/pdp/get_pc) từ máy chủ → 403 kèm
//     error 90309999 (thiếu chữ ký chống bot), kể cả từ IP dân cư Việt Nam.
//   - Tải HTML trang sản phẩm → 161KB nhưng RỖNG: không og:tag, không ld+json,
//     toàn bộ nội dung do JS dựng ở trình duyệt.
//   → Chỉ còn đường cho trình duyệt thật render rồi bóc DOM.
//     Ở đây dùng Cloudflare Browser Rendering REST API (không cần thêm thư viện).
//
// Body : { url: "https://shopee.vn/...-i.<shopid>.<itemid>", max_images?: number }
// Trả  : { ok, source:{shop_id,item_id,url}, product:{name,price,old_price,note,description},
//          images:[{ data:<base64>, media_type, src }], warnings:[] }
//
// Secret cần có: CF_BROWSER_TOKEN — API token Cloudflare có quyền Browser Rendering.
// (CF_ACCOUNT_ID đã có sẵn trong [vars] của wrangler.toml.)
import { getIdentity } from "../../lib/access.js";

const BR_TIMEOUT_MS = 60000;
const IMG_MAX = 12;              // trần số ảnh tải về
const IMG_MAX_BYTES = 5 * 1024 * 1024;
const CDN_HOSTS = ["down-vn.img.susercontent.com", "cf.shopee.vn", "down-aka-sg.img.susercontent.com"];

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// shopee.vn/<slug>-i.<shopid>.<itemid>  ·  cũng chấp nhận ?sp_atk=... phía sau
export function parseShopeeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (!/(^|\.)shopee\.vn$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/-i\.(\d+)\.(\d+)\/?$/);
  if (!m) return null;
  return { shop_id: m[1], item_id: m[2], url: `https://shopee.vn${u.pathname}` };
}

// "₫219.000" / "219.000₫" / "₫219.000 - ₫438.000" → [219000, 438000]
export function parsePrices(html) {
  const out = [];
  const re = /₫\s?([0-9][0-9.,]{2,})/g;
  let m;
  while ((m = re.exec(html))) {
    const n = Number(String(m[1]).replace(/[.,]/g, ""));
    if (Number.isFinite(n) && n >= 1000 && n <= 500000000) out.push(n);
  }
  return out;
}

// Gom link ảnh CDN Shopee. Bỏ đuôi biến thể (_tn = thumbnail) để lấy bản gốc.
export function parseImages(html) {
  const seen = new Set();
  const out = [];
  const re = new RegExp(
    "https?:\\\\?/\\\\?/(?:" + CDN_HOSTS.join("|").replace(/\./g, "\\.") + ")\\\\?/file\\\\?/([A-Za-z0-9._-]{8,})",
    "g");
  let m;
  while ((m = re.exec(html))) {
    const hash = m[1].replace(/_tn$/, "").replace(/\.(webp|jpg|jpeg|png)$/i, "");
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push(`https://down-vn.img.susercontent.com/file/${hash}`);
  }
  return out;
}

export function parseName(html) {
  // Ưu tiên og:title (JS chèn sau khi render), rồi <title>, rồi <h1>
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{3,300})["']/i);
  if (og) return cleanName(og[1]);
  const t = html.match(/<title[^>]*>([^<]{3,300})<\/title>/i);
  if (t) return cleanName(t[1]);
  const h1 = html.match(/<h1[^>]*>([\s\S]{3,300}?)<\/h1>/i);
  if (h1) return cleanName(stripTags(h1[1]));
  return "";
}

function cleanName(s) {
  return decodeEntities(String(s))
    .replace(/\s*\|\s*Shopee Việt Nam.*$/i, "")
    .replace(/^\s*Mua\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, " ");
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Mô tả: Shopee đặt trong khối sau tiêu đề "MÔ TẢ SẢN PHẨM". Lấy thô, AI sẽ viết lại.
export function parseDescription(html) {
  const i = html.search(/MÔ TẢ SẢN PHẨM/i);
  if (i < 0) return "";
  const chunk = html.slice(i, i + 30000);
  const text = decodeEntities(stripTags(chunk))
    .replace(/\s*\n\s*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text.slice(0, 6000);
}

// Trang chặn bot / bắt xác minh → nhận diện để báo lỗi cho ra lỗi.
function looksBlocked(html) {
  if (!html || html.length < 2000) return true;
  return /captcha|xác minh bạn không phải|verify you are human|Access denied|請驗證/i.test(html)
    && !/MÔ TẢ SẢN PHẨM/i.test(html);
}

async function renderHtml(env, url) {
  const token = (env.CF_BROWSER_TOKEN || "").trim();
  const account = (env.CF_ACCOUNT_ID || "").trim();
  if (!token) throw new Error("missing_CF_BROWSER_TOKEN");
  if (!account) throw new Error("missing_CF_ACCOUNT_ID");

  const body = {
    url,
    // Shopee dựng nội dung bằng JS → chờ mạng lắng rồi chờ thêm khối mô tả.
    gotoOptions: { waitUntil: "networkidle0", timeout: 45000 },
    waitForTimeout: 6000,
    setExtraHTTPHeaders: {
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    },
    viewport: { width: 1366, height: 900 },
  };

  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/content`,
    {
      method: "POST",
      headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BR_TIMEOUT_MS),
    });

  const txt = await r.text();
  if (!r.ok) {
    let msg = txt.slice(0, 300);
    try {
      const j = JSON.parse(txt);
      msg = (j.errors || []).map((e) => e.message).join("; ") || msg;
    } catch { /* giữ nguyên text */ }
    throw new Error(`browser_rendering_${r.status}: ${msg}`);
  }
  try {
    const j = JSON.parse(txt);
    if (j && j.success === false) {
      throw new Error("browser_rendering_failed: " + (j.errors || []).map((e) => e.message).join("; "));
    }
    return typeof j.result === "string" ? j.result : txt;
  } catch (e) {
    if (String(e.message || "").startsWith("browser_rendering")) throw e;
    return txt;   // một số bản trả HTML thô, không bọc JSON
  }
}

async function fetchImage(src) {
  const r = await fetch(src, {
    headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://shopee.vn/" },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  const type = r.headers.get("content-type") || "";
  if (!/^image\//i.test(type)) return null;
  const buf = await r.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > IMG_MAX_BYTES) return null;
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return { data: btoa(bin), media_type: type.split(";")[0], src };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Cùng lớp bảo vệ với /api/products/publish: Access bật thì theo Access,
  // chưa bật thì bắt buộc X-Products-Token.
  const id = await getIdentity(request, env);
  if (id.role === "open") {
    const tok = request.headers.get("x-products-token") || "";
    if (!env.PRODUCTS_TOKEN || tok !== env.PRODUCTS_TOKEN) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "body_not_json" }, 400);
  }

  const src = parseShopeeUrl(body.url);
  if (!src) {
    return json({
      ok: false,
      error: "link_khong_hop_le",
      hint: "Cần link sản phẩm shopee.vn dạng .../<tên>-i.<shopid>.<itemid>",
    }, 400);
  }

  let html;
  try {
    html = await renderHtml(env, src.url);
  } catch (e) {
    const m = String(e.message || e);
    const hint =
      m.includes("missing_CF_BROWSER_TOKEN")
        ? "Chưa nạp secret CF_BROWSER_TOKEN (API token Cloudflare có quyền Browser Rendering)."
        : m.includes("_401") || m.includes("_403")
          ? "Token Browser Rendering sai quyền, hoặc tài khoản chưa bật Browser Rendering."
          : "Trình duyệt của Cloudflare không mở được trang. Thử lại, hoặc kiểm tra link.";
    return json({ ok: false, error: m, hint }, 502);
  }

  if (looksBlocked(html)) {
    return json({
      ok: false,
      error: "shopee_chan_bot",
      hint: "Shopee trả trang xác minh cho IP Cloudflare. Thử lại sau vài phút; nếu lặp lại thì phải chuyển sang cách bookmarklet chạy trên trình duyệt của bạn.",
    }, 502);
  }

  const warnings = [];
  const name = parseName(html);
  if (!name) warnings.push("Không đọc được tên sản phẩm — nhập tay giúp.");

  const prices = parsePrices(html);
  const price = prices.length ? Math.min(...prices) : 0;
  const old_price = prices.length > 1 ? Math.max(...prices) : 0;
  if (!price) warnings.push("Không đọc được giá — nhập tay giúp.");

  const description = parseDescription(html);
  if (!description) warnings.push("Không đọc được phần MÔ TẢ SẢN PHẨM.");

  const wanted = Math.min(Number(body.max_images) || IMG_MAX, IMG_MAX);
  const urls = parseImages(html).slice(0, wanted);
  const images = [];
  for (const u of urls) {
    try {
      const im = await fetchImage(u);
      if (im) images.push(im);
    } catch { /* bỏ ảnh lỗi, không làm hỏng cả lần nhập */ }
  }
  if (!images.length) warnings.push("Không tải được ảnh nào từ CDN Shopee.");

  return json({
    ok: true,
    source: src,
    product: {
      name,
      price,
      old_price: old_price && old_price !== price ? old_price : 0,
      // note = tư liệu thô đưa cho AI viết bài, KHÔNG đăng thẳng lên web
      note: description,
      description,
    },
    images,
    warnings,
  });
}
