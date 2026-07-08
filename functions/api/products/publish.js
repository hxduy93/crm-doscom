// POST /api/products/publish  (ENDPOINT GHI — có bảo vệ)
// Upload ảnh vào WP Media + tạo product WooCommerce trên doscom.vn / noma.vn / cả 2.
//
// Bảo vệ (red line: endpoint ghi phải có token): theo pattern getIdentity như optimizer.
//   - Access bật (đăng nhập) → cho ghi.
//   - Access chưa bật (role "open") → bắt buộc header X-Products-Token == env.PRODUCTS_TOKEN.
//
// Body: {
//   site: "doscom" | "noma" | "both",
//   categories: { doscom?: id, noma?: id },   // hoặc category_id cho 1 site
//   name, price, old_price,
//   status: "draft" | "publish",              // mặc định draft
//   seo_title, short_description, long_html, meta_description, tags: [],
//   images: [{ data: base64, media_type, alt?, caption?, role?, after_heading? }]
// }
import { getIdentity } from "../../lib/access.js";
import {
  siteCreds, isConfigured, uploadMedia, createProduct,
  slugify, b64ToBytes, priceFields, injectFigure, deriveKeyword,
} from "./_wc.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function publishToSite(site, env, data) {
  const c = siteCreds(site, env);
  if (!isConfigured(c)) throw new Error(`Chưa cấu hình secret WC_${site.toUpperCase()}_*`);

  const images = Array.isArray(data.images) ? data.images.slice(0, 20) : [];
  if (!images.length) throw new Error("Chưa có ảnh sản phẩm");

  const kw = String(data.primary_keyword || "").trim() || deriveKeyword(data.name);
  let featIdx = images.findIndex((im) => im.role === "featured");
  if (featIdx < 0) featIdx = 0;

  // 1) Upload từng ảnh vào WP Media. Ảnh đại diện có alt chứa keyword (tiêu chí Rank Math).
  const uploaded = [];
  for (let i = 0; i < images.length; i++) {
    const im = images[i];
    const mime = im.media_type || "image/jpeg";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const alt = i === featIdx && kw ? (kw + (im.alt ? ` — ${im.alt}` : "")) : (im.alt || data.name);
    const media = await uploadMedia(c, {
      bytes: b64ToBytes(im.data),
      filename: `${slugify(kw || data.name) || "san-pham"}-${i + 1}.${ext}`,
      mime, alt, caption: im.caption || "", title: data.name,
    });
    uploaded.push({ ...media, meta: im });
  }

  // 2) Gallery = tất cả, ảnh đại diện lên đầu.
  const ordered = [uploaded[featIdx], ...uploaded.filter((_, i) => i !== featIdx)];

  // 3) Chèn ảnh inline vào mô tả dài theo after_heading
  let html = data.long_html || data.short_description || "";
  uploaded.forEach((u) => {
    if (u.meta.after_heading) {
      html = injectFigure(html, u.meta.after_heading, u.source_url, u.meta.alt || data.name, u.meta.caption || "");
    }
  });

  // 4) Tạo product
  const catId = Number(data.category_id);
  const seoTitle = data.seo_title || data.name;
  const stockQty = Number(String(data.stock ?? "").replace(/[^\d]/g, ""));
  const soldQty = Number(String(data.sold ?? "").replace(/[^\d]/g, ""));
  const payload = {
    name: data.name,
    slug: slugify(kw || data.name),
    type: "simple",
    status: data.status === "publish" ? "publish" : "draft",
    ...priceFields(data.price, data.old_price),
    description: html,
    short_description: data.short_description || "",
    categories: catId ? [{ id: catId }] : [],
    images: ordered.map((u) => ({ id: u.id })),
    tags: (Array.isArray(data.tags) ? data.tags : []).filter(Boolean).map((t) => ({ name: String(t).slice(0, 50) })),
    // Tồn kho + đã bán
    ...(Number.isFinite(stockQty) && stockQty > 0
      ? { manage_stock: true, stock_quantity: stockQty, stock_status: "instock" }
      : {}),
    meta_data: [
      // Rank Math + Yoast: focus keyword + SEO title + meta description
      { key: "rank_math_focus_keyword", value: kw },
      { key: "rank_math_title", value: seoTitle },
      { key: "rank_math_description", value: data.meta_description || "" },
      { key: "_yoast_wpseo_focuskw", value: kw },
      { key: "_yoast_wpseo_title", value: seoTitle },
      { key: "_yoast_wpseo_metadesc", value: data.meta_description || "" },
      ...(Number.isFinite(soldQty) && soldQty > 0 ? [{ key: "total_sales", value: String(soldQty) }] : []),
    ],
  };

  const p = await createProduct(c, payload);
  return { site, id: p.id, url: p.permalink || p.link || "", status: p.status };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // --- bảo vệ endpoint ghi ---
  const id = await getIdentity(context);
  if (id.role === "open") {
    if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
      return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
    }
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }

  if (!body.name) return json({ ok: false, error: "Thiếu tên sản phẩm" }, 400);
  const targets = body.site === "both" ? ["doscom", "noma"] : [String(body.site || "").toLowerCase()];
  if (!targets.every((s) => s === "doscom" || s === "noma")) {
    return json({ ok: false, error: "site phải là doscom, noma hoặc both" }, 400);
  }

  const results = [];
  for (const s of targets) {
    try {
      const category_id = body.categories ? body.categories[s] : body.category_id;
      const r = await publishToSite(s, env, { ...body, category_id });
      results.push({ ok: true, ...r });
    } catch (e) {
      results.push({ ok: false, site: s, error: String(e.message || e) });
    }
  }

  const allOk = results.length > 0 && results.every((r) => r.ok);
  return json({ ok: allOk, results }, allOk ? 200 : 502);
}
