// POST /api/products/sync-us
// Đồng bộ từ web tiếng Việt (noma.vn / doscom.vn) sang nomaauto.us (bản tiếng Anh).
// Hai loại nội dung, chọn bằng `kind`:
//   kind "product" (mặc định) — SẢN PHẨM WooCommerce, dò trùng theo mã SKU trong tên.
//   kind "post"               — BÀI VIẾT WordPress, dò trùng theo bảng D1 `us_post_sync`
//                               (bài viết không có SKU nên phải ghi map nguồn→US khi đồng bộ).
//
// mode "list"  : so sánh nguồn ↔ nomaauto.us → trả phần CÒN THIẾU bên US + danh mục US.
//                Body: { source: "noma"|"doscom", kind? }
//                Trả (product): { ok, missing:[{id,name,sku,permalink}], present:[sku], us_categories }
//                Trả (post)   : { ok, missing:[{id,name,date,permalink}], us_categories }
//
// mode "sync"  : (ENDPOINT GHI — có token) tạo nội dung trên nomaauto.us từ bản nguồn.
//                Body: { source, kind?, ids:[id...], category_id?, status?: "draft"|"publish" }
//                Mỗi SP  : đọc gốc → sửa brandcore (VN) → DỊCH → sửa brandcore (EN)
//                          → đổi giá VND→USD → copy ẢNH ĐẠI DIỆN → tạo product.
//                Mỗi BÀI : đọc gốc → sửa brandcore (VN) → tách ảnh ra placeholder → DỊCH
//                          → sửa brandcore (EN) → COPY ảnh (đại diện + ảnh trong bài) sang US
//                          → trả ảnh về đúng vị trí → tạo post + ghi map D1.
//                Trả REPORT: { ok, created, failed, items[], cost_usd }
//
// An toàn: mặc định tạo DRAFT để người dùng duyệt trên WP trước khi publish. Không đụng bản nguồn.
import { getIdentity } from "../../lib/access.js";
import { translateToEN } from "./_translate.js";
import { findSkuCode } from "../geo/_utils/noma-sku-specs.js";
import { applyFixes, deterministicFixes, NOMA_FORBIDDEN_EN } from "../geo/_utils/noma-brandcore.js";
import {
  siteCreds, isConfigured, listProducts, getProductFull, createProduct,
  copyImageFromUrl, fetchCategories, usdPriceFields, slugify, deriveKeyword, isNomaProduct,
} from "./_wc.js";
import {
  listPosts, getPostFull, getMediaUrl, fetchPostCategories, resolveTags, createPost,
  extractImages, restoreImages,
} from "./_posts.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Liệt kê SP NOMA của 1 site kèm mã SKU dò từ tên.
async function listNoma(c, site) {
  const out = [];
  const isMixed = site === "doscom"; // doscom.vn trộn cả SP an ninh
  for (let page = 1; page <= 6; page++) {
    const { items, totalPages } = await listProducts(c, { search: isMixed ? "NOMA" : "", perPage: 50, page });
    for (const p of items) {
      if (isMixed && !isNomaProduct(p)) continue;
      out.push({ id: p.id, name: p.name, permalink: p.permalink, sku: findSkuCode(p.name) });
    }
    if (page >= totalPages || !items.length) break;
  }
  return out;
}

// Làm sạch brandcore bằng cặp sửa deterministic (thay chuỗi nguyên văn → giữ layout).
function cleanBrandcore(html, list) {
  const pairs = deterministicFixes(html, list);
  return applyFixes(html, pairs).fixed;
}

// Bỏ ẢNH CHÈN TRONG BÀI khi đồng bộ sang nomaauto.us.
// Lý do: quy ước nomaauto.us = CHỈ text + ảnh đại diện. Nếu giữ <img> của bài gốc thì src vẫn
// trỏ về noma.vn → trang US hotlink ảnh từ web VN (hỏng nếu web VN đổi/xoá ảnh). Chỉ bỏ thẻ ảnh,
// giữ nguyên toàn bộ chữ + cấu trúc <p>/<h2>/<ul> của bài.
export function stripInlineImages(html) {
  return String(html || "")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "")
    .replace(/<img\b[^>]*\/?>/gi, "");
}

// Excerpt của WP là HTML (<p>...</p> + "[…]") → lấy chữ trần cho phần dịch.
export function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\[…\]|\[&hellip;\]|\[\.\.\.\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ID bài NGUỒN đã đồng bộ sang US (bài viết không có SKU → phải tra bảng map D1).
async function syncedSourceIds(env, source) {
  const { results } = await env.DB.prepare(
    `SELECT source_post_id FROM us_post_sync WHERE source_site = ?`
  ).bind(source).all();
  return new Set((results || []).map((r) => Number(r.source_post_id)));
}

// Đồng bộ 1 BÀI VIẾT: gốc → brandcore VN → tách ảnh → dịch → brandcore EN → copy ảnh → tạo post.
async function syncOnePost(env, { src, us, source, id, catId, status }) {
  const p = await getPostFull(src, id);

  const vnTitle = cleanBrandcore(p.title || "", undefined);
  const vnExcerpt = cleanBrandcore(stripTags(p.excerpt || ""), undefined);
  const vnHtml = cleanBrandcore(p.content || "", undefined);

  // Thay src ảnh bằng placeholder TRƯỚC khi dịch: AI không đụng vào URL, và bài EN không bao giờ
  // hotlink ảnh từ noma.vn (src thật chỉ gắn lại sau khi ảnh đã nằm trên nomaauto.us).
  const { html: vnHtmlPh, images } = extractImages(vnHtml, { limit: 10 });

  const en = await translateToEN(env, {
    name: vnTitle, seo_title: vnTitle, short_description: vnExcerpt,
    long_html: vnHtmlPh, meta_description: "", tags: [], primary_keyword: "",
  }, { kind: "post" });

  const enTitle = cleanBrandcore(en.name || vnTitle, NOMA_FORBIDDEN_EN);
  const enExcerpt = stripTags(cleanBrandcore(en.short_description || "", NOMA_FORBIDDEN_EN));
  const enMeta = cleanBrandcore(en.meta_description || "", NOMA_FORBIDDEN_EN);
  const kw = String(en.primary_keyword || "").trim() || deriveKeyword(enTitle);
  const slug = slugify(kw || enTitle) || `noma-post-${id}`;

  // Copy ảnh trong bài sang WP Media của nomaauto.us; ảnh nào hỏng → restoreImages gỡ thẻ đó.
  const urls = [];
  for (let i = 0; i < images.length; i++) {
    try {
      const m = await copyImageFromUrl(us, images[i].src, {
        alt: enTitle, title: enTitle, filename: `${slug}-${i + 1}`,
      });
      urls.push(m.source_url);
    } catch { urls.push(""); }
  }
  const enHtml = restoreImages(cleanBrandcore(en.long_html || "", NOMA_FORBIDDEN_EN), urls);

  // Ảnh đại diện.
  let featured = 0;
  const fUrl = await getMediaUrl(src, p.featured_media).catch(() => "");
  if (fUrl) {
    try {
      const m = await copyImageFromUrl(us, fUrl, { alt: kw || enTitle, title: enTitle, filename: slug });
      featured = m.id;
    } catch { /* thiếu ảnh đại diện không chặn đăng bài */ }
  }

  const tagIds = await resolveTags(us, en.tags, slugify);

  const np = await createPost(us, {
    title: enTitle,
    content: enHtml,
    excerpt: enExcerpt,
    slug,
    status,
    categories: catId ? [catId] : [],
    tags: tagIds,
    ...(featured ? { featured_media: featured } : {}),
    meta: {
      _yoast_wpseo_metadesc: enMeta,
      _yoast_wpseo_focuskw: kw,
      _yoast_wpseo_title: enTitle,
      rank_math_description: enMeta,
      rank_math_focus_keyword: kw,
      rank_math_title: enTitle,
    },
  });

  await env.DB.prepare(
    `INSERT OR REPLACE INTO us_post_sync
       (source_site, source_post_id, source_title, us_post_id, us_title, us_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(source, id, p.title || "", np.id, enTitle, np.link || "", Math.floor(Date.now() / 1000)).run();

  return {
    source_id: id, source_name: p.title,
    us_id: np.id, us_name: enTitle, us_url: np.link || "",
    status: np.status,
    image_copied: !!featured,
    images_in_body: urls.filter(Boolean).length,
    cost_usd: en.cost_usd || 0,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }

  const source = String(body.source || "noma").toLowerCase();
  const mode = String(body.mode || "list");
  const kind = String(body.kind || "product").toLowerCase();
  if (!["noma", "doscom"].includes(source)) return json({ ok: false, error: "source phải là noma hoặc doscom" }, 400);
  if (!["product", "post"].includes(kind)) return json({ ok: false, error: "kind phải là product hoặc post" }, 400);

  const src = siteCreds(source, env);
  const us = siteCreds("nomaauto", env);
  if (!isConfigured(src)) return json({ ok: false, error: `Site nguồn '${source}' chưa cấu hình WooCommerce` }, 400);
  if (!isConfigured(us)) return json({ ok: false, error: "nomaauto.us chưa cấu hình WooCommerce (WC_NOMAAUTO_*)" }, 400);
  if (kind === "post" && !env.DB) {
    return json({ ok: false, error: "Thiếu binding D1 'DB' — không tra được bài đã đồng bộ" }, 500);
  }

  try {
    // ── SO SÁNH: BÀI VIẾT (đã đồng bộ = có trong bảng map D1) ──
    if (mode === "list" && kind === "post") {
      const [srcPosts, syncedIds, cats] = await Promise.all([
        listPosts(src),
        syncedSourceIds(env, source),
        fetchPostCategories(us).catch(() => []),
      ]);
      const missing = srcPosts
        .filter((p) => !syncedIds.has(Number(p.id)))
        .map((p) => ({ id: p.id, name: stripTags(p.title), date: p.date, permalink: p.link }));
      return json({
        ok: true, source, kind,
        source_count: srcPosts.length,
        us_count: syncedIds.size,
        missing,
        us_categories: cats.map((c) => ({ id: c.id, name: c.name })),
      });
    }

    // ── ĐỒNG BỘ: BÀI VIẾT (ghi) ──
    if (mode === "sync" && kind === "post") {
      const identity = await getIdentity(context);
      if (identity.role === "open") {
        if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
          return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
        }
      }
      if (env.USE_CLAUDE === "false") return json({ ok: false, error: "AI đang tắt (USE_CLAUDE=false) — không dịch được" }, 503);

      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 10) : [];
      if (!ids.length) return json({ ok: false, error: "Thiếu ids" }, 400);
      const catId = Number(body.category_id) || 0;
      const status = body.status === "publish" ? "publish" : "draft";

      const items = [];
      let created = 0, failed = 0, cost = 0;
      for (const id of ids) {
        try {
          const it = await syncOnePost(env, { src, us, source, id, catId, status });
          cost += it.cost_usd || 0;
          created++;
          items.push(it);
        } catch (e) {
          failed++;
          items.push({ source_id: id, error: String(e.message || e) });
        }
      }
      return json({
        ok: true, source, kind, created, failed,
        cost_usd: Number(cost.toFixed(6)),
        items,
        generated_at: new Date().toISOString(),
      });
    }

    // ── SO SÁNH: SẢN PHẨM ──
    if (mode === "list") {
      const [srcList, usList, cats] = await Promise.all([
        listNoma(src, source),
        listNoma(us, "nomaauto"),
        fetchCategories(us).catch(() => []),
      ]);
      const usSkus = new Set(usList.map((p) => p.sku).filter(Boolean));
      const missing = srcList.filter((p) => p.sku && !usSkus.has(p.sku));
      return json({
        ok: true, source,
        source_count: srcList.length,
        us_count: usList.length,
        present: [...usSkus].sort(),
        missing,
        us_categories: cats.map((c) => ({ id: c.id, name: c.name })),
      });
    }

    // ── ĐỒNG BỘ (ghi) ──
    if (mode === "sync") {
      const identity = await getIdentity(context);
      if (identity.role === "open") {
        if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
          return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
        }
      }
      if (env.USE_CLAUDE === "false") return json({ ok: false, error: "AI đang tắt (USE_CLAUDE=false) — không dịch được" }, 503);

      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 10) : [];
      if (!ids.length) return json({ ok: false, error: "Thiếu ids" }, 400);
      const catId = Number(body.category_id) || 0;
      const status = body.status === "publish" ? "publish" : "draft";

      const items = [];
      let created = 0, failed = 0, cost = 0;

      for (const id of ids) {
        try {
          const p = await getProductFull(src, id);
          const sku = findSkuCode(p.name);

          // 1) Sửa brandcore trên bản VN trước khi dịch (để bản EN sạch từ gốc).
          const vnDesc = cleanBrandcore(p.description || "", undefined);
          const vnShort = cleanBrandcore(p.short_description || "", undefined);
          const vnName = cleanBrandcore(p.name || "", undefined);

          // 2) Dịch sang tiếng Anh.
          const en = await translateToEN(env, {
            name: vnName, seo_title: vnName, short_description: vnShort,
            long_html: vnDesc, meta_description: "", tags: [], primary_keyword: "",
          });
          cost += en.cost_usd || 0;

          // 3) Sửa brandcore trên bản EN (bắt cụm cấm tiếng Anh nếu dịch lỡ sinh ra).
          //    + BỎ ảnh chèn trong bài (nomaauto.us = chỉ text + ảnh đại diện, không hotlink ảnh noma.vn).
          const enName = cleanBrandcore(en.name || vnName, NOMA_FORBIDDEN_EN);
          const enShort = stripInlineImages(cleanBrandcore(en.short_description || "", NOMA_FORBIDDEN_EN));
          const enHtml = stripInlineImages(cleanBrandcore(en.long_html || "", NOMA_FORBIDDEN_EN));
          const enMeta = cleanBrandcore(en.meta_description || "", NOMA_FORBIDDEN_EN);

          const kw = String(en.primary_keyword || "").trim() || deriveKeyword(enName);

          // 4) Giá VND → USD.
          const pf = usdPriceFields(p.regular_price || "", "", env.VND_USD_RATE);
          if (p.sale_price && p.regular_price) {
            Object.assign(pf, usdPriceFields(p.sale_price, p.regular_price, env.VND_USD_RATE));
          }

          // 5) Copy ẢNH ĐẠI DIỆN (nomaauto.us chỉ đăng ảnh đại diện — theo quy ước sẵn có).
          const srcImg = Array.isArray(p.images) && p.images.length ? p.images[0] : null;
          const imgIds = [];
          if (srcImg && srcImg.src) {
            const m = await copyImageFromUrl(us, srcImg.src, {
              alt: kw || enName,
              title: enName,
              filename: slugify(kw || enName) || `noma-${sku || id}`,
            });
            imgIds.push({ id: m.id });
          }

          // 6) Tạo product trên nomaauto.us (mặc định DRAFT để duyệt).
          const np = await createProduct(us, {
            name: enName,
            slug: slugify(kw || enName),
            type: "simple",
            status,
            ...pf,
            description: enHtml,
            short_description: enShort,
            categories: catId ? [{ id: catId }] : [],
            images: imgIds,
            tags: (Array.isArray(en.tags) ? en.tags : []).filter(Boolean).map((t) => ({ name: String(t).slice(0, 50) })),
            meta_data: [
              { key: "rank_math_focus_keyword", value: kw },
              { key: "rank_math_title", value: enName },
              { key: "rank_math_description", value: enMeta },
              { key: "_yoast_wpseo_focuskw", value: kw },
              { key: "_yoast_wpseo_title", value: enName },
              { key: "_yoast_wpseo_metadesc", value: enMeta },
            ],
          });

          created++;
          items.push({
            source_id: id, sku, source_name: p.name,
            us_id: np.id, us_name: enName, us_url: np.permalink || np.link || "",
            status: np.status, image_copied: imgIds.length > 0,
          });
        } catch (e) {
          failed++;
          items.push({ source_id: id, error: String(e.message || e) });
        }
      }

      return json({
        ok: true, source, created, failed,
        cost_usd: Number(cost.toFixed(6)),
        items,
        generated_at: new Date().toISOString(),
      });
    }

    return json({ ok: false, error: `mode không hợp lệ: ${mode}` }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}
