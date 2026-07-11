// POST /api/products/sync-us
// Đồng bộ sản phẩm NOMA từ web tiếng Việt (noma.vn / doscom.vn) sang nomaauto.us (bản tiếng Anh).
//
// mode "list"  : so sánh SKU giữa nguồn và nomaauto.us → trả SP CÒN THIẾU bên US + danh mục US.
//                Body: { source: "noma"|"doscom" }
//                Trả: { ok, source, missing:[{id,name,sku,permalink}], present:[sku], us_categories:[{id,name}] }
//
// mode "sync"  : (ENDPOINT GHI — có token) tạo SP trên nomaauto.us từ SP nguồn.
//                Body: { source, ids:[id...], category_id?, status?: "draft"|"publish" }
//                Mỗi SP: đọc bản nguồn → sửa brandcore (VN) → DỊCH sang EN → sửa brandcore (EN)
//                        → đổi giá VND→USD → copy ẢNH ĐẠI DIỆN → tạo product (mặc định DRAFT).
//                Trả REPORT: { ok, created, failed, items[], cost_usd }
//
// An toàn: mặc định tạo DRAFT để người dùng duyệt trên WP trước khi publish. Không đụng SP nguồn.
import { getIdentity } from "../../lib/access.js";
import { translateToEN } from "./_translate.js";
import { findSkuCode } from "../geo/_utils/noma-sku-specs.js";
import { applyFixes, deterministicFixes, NOMA_FORBIDDEN_EN } from "../geo/_utils/noma-brandcore.js";
import {
  siteCreds, isConfigured, listProducts, getProductFull, createProduct,
  copyImageFromUrl, fetchCategories, usdPriceFields, slugify, deriveKeyword, isNomaProduct,
} from "./_wc.js";

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

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }

  const source = String(body.source || "noma").toLowerCase();
  const mode = String(body.mode || "list");
  if (!["noma", "doscom"].includes(source)) return json({ ok: false, error: "source phải là noma hoặc doscom" }, 400);

  const src = siteCreds(source, env);
  const us = siteCreds("nomaauto", env);
  if (!isConfigured(src)) return json({ ok: false, error: `Site nguồn '${source}' chưa cấu hình WooCommerce` }, 400);
  if (!isConfigured(us)) return json({ ok: false, error: "nomaauto.us chưa cấu hình WooCommerce (WC_NOMAAUTO_*)" }, 400);

  try {
    // ── SO SÁNH ──
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
