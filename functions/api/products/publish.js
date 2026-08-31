// POST /api/products/publish  (ENDPOINT GHI — có bảo vệ)
// Upload ảnh vào WP Media + tạo product WooCommerce trên doscom.vn / noma.vn / cả 2.
//
// Bảo vệ (red line: endpoint ghi phải có token): theo pattern getIdentity như optimizer.
//   - Access bật (đăng nhập) → cho ghi.
//   - Access chưa bật (role "open") → bắt buộc header X-Products-Token == env.PRODUCTS_TOKEN.
//
// Body: {
//   site: "doscom" | "noma" | "nomaauto" | "all",
//   categories: { doscom?: id, noma?: id, nomaauto?: id },   // hoặc category_id cho 1 site
//   nomaauto = bản tiếng Anh: tự dịch nội dung + đổi giá VND→USD (÷ env.VND_USD_RATE, mặc định 26500)
//             + CHỈ đăng ảnh đại diện (nền trắng), bỏ ảnh phụ/poster + không chèn ảnh inline vào bài
//   name, price, old_price,
//   status: "draft" | "publish",              // mặc định draft
//   seo_title, short_description, long_html, meta_description, tags: [],
//   images: [{ data: base64, media_type, alt?, caption?, role?, after_heading? }]
// }
import { getIdentity } from "../../lib/access.js";
import { translateToEN } from "./_translate.js";
import {
  siteCreds, isConfigured, uploadMedia, createProduct, updateProduct,
  productSlug, b64ToBytes, priceFields, usdPriceFields, injectFigure, injectByPosition, deriveKeyword,
  chuanHoaBienThe, variationPayload, createVariations,
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

  // Biến thể: lọc sạch TRƯỚC khi dịch, để bản EN dịch đúng danh sách thật sẽ đăng.
  let bienThe = chuanHoaBienThe(data.variants);
  const coBienThe = bienThe.length > 0;
  let tenThuocTinh = String(data.variant_attribute || "").trim() || "Phân loại";

  // nomaauto.us = bản tiếng Anh: dịch nội dung + đổi giá VND→USD.
  const isEN = site === "nomaauto";
  let content, giaFn;
  if (isEN) {
    const en = await translateToEN(env, {
      name: data.name, seo_title: data.seo_title, short_description: data.short_description,
      long_html: data.long_html, meta_description: data.meta_description,
      tags: data.tags, primary_keyword: data.primary_keyword,
      ...(coBienThe ? { variant_attribute: tenThuocTinh, variant_options: bienThe.map((v) => v.option) } : {}),
    });
    content = { ...data, ...en };
    if (coBienThe) {
      tenThuocTinh = en.variant_attribute || tenThuocTinh;
      // translateToEN đã bảo đảm cùng độ dài/thứ tự, lệch thì nó trả lại bản tiếng Việt.
      bienThe = bienThe.map((v, i) => ({ ...v, option: en.variant_options[i] || v.option }));
    }
    giaFn = (p, o) => usdPriceFields(p, o, env.VND_USD_RATE);
  } else {
    content = data;
    giaFn = priceFields;
  }
  const pf = giaFn(data.price, data.old_price);

  const kw = String(content.primary_keyword || "").trim() || deriveKeyword(content.name);
  // URL sản phẩm (cả 3 web): tên SP + công dụng. Bản EN dùng name/keyword đã dịch.
  const slug = productSlug(content.name, kw);

  // nomaauto.us: CHỈ đăng ảnh đại diện (nền trắng) + text — bỏ toàn bộ ảnh phụ/poster.
  const workImages = isEN
    ? [images.find((im) => im.role === "featured") || images[0]].filter(Boolean)
    : images;
  let featIdx = workImages.findIndex((im) => im.role === "featured");
  if (featIdx < 0) featIdx = 0;

  // 1) Upload ảnh. Ảnh đại diện có alt chứa keyword (tiêu chí Rank Math).
  const uploaded = [];
  for (let i = 0; i < workImages.length; i++) {
    const im = workImages[i];
    const mime = im.media_type || "image/jpeg";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const alt = i === featIdx && kw ? (kw + (im.alt ? ` — ${im.alt}` : "")) : (im.alt || content.name);
    const media = await uploadMedia(c, {
      bytes: b64ToBytes(im.data),
      filename: `${slug || "product"}-${i + 1}.${ext}`,
      mime, alt, caption: im.caption || "", title: content.name,
    });
    uploaded.push({ ...media, meta: im });
  }
  const ordered = [uploaded[featIdx], ...uploaded.filter((_, i) => i !== featIdx)];

  // 2) Chèn ảnh inline vào bài. Bản EN đã dịch → heading tiếng Việt không match → chèn theo vị trí.
  let html = content.long_html || content.short_description || "";
  const inlineImgs = uploaded.filter((u) => u.meta.after_heading);
  if (isEN) {
    html = injectByPosition(html, inlineImgs.map((u) => ({ url: u.source_url, alt: kw || content.name, caption: "" })));
  } else {
    inlineImgs.forEach((u) => {
      html = injectFigure(html, u.meta.after_heading, u.source_url, u.meta.alt || content.name, u.meta.caption || "");
    });
  }

  // 3) Tạo product
  const catId = Number(data.category_id);
  const seoTitle = content.seo_title || content.name;
  const stockQty = Number(String(data.stock ?? "").replace(/[^\d]/g, ""));
  const soldQty = Number(String(data.sold ?? "").replace(/[^\d]/g, ""));
  /* Sản phẩm cha của hàng có biến thể KHÔNG mang giá và tồn kho: WooCommerce lấy hai
     thứ đó từ từng biến thể. Gửi kèm regular_price ở cha thì trang sản phẩm hiện một
     mức giá cứng không đổi theo lựa chọn của khách, còn tồn kho ở cha chặn luôn biến
     thể còn hàng. Nên khi có biến thể thì bỏ cả pf lẫn khối manage_stock bên dưới. */
  const payload = {
    name: content.name,
    slug,
    type: coBienThe ? "variable" : "simple",
    status: data.status === "publish" ? "publish" : "draft",
    ...(coBienThe ? {} : pf),
    ...(coBienThe
      ? { attributes: [{ name: tenThuocTinh, position: 0, visible: true, variation: true, options: bienThe.map((v) => v.option) }] }
      : {}),
    description: html,
    short_description: content.short_description || "",
    categories: catId ? [{ id: catId }] : [],
    images: ordered.map((u) => ({ id: u.id })),
    tags: (Array.isArray(content.tags) ? content.tags : []).filter(Boolean).map((t) => ({ name: String(t).slice(0, 50) })),
    ...(!coBienThe && Number.isFinite(stockQty) && stockQty > 0
      ? { manage_stock: true, stock_quantity: stockQty, stock_status: "instock" }
      : {}),
    meta_data: [
      { key: "rank_math_focus_keyword", value: kw },
      { key: "rank_math_title", value: seoTitle },
      { key: "rank_math_description", value: content.meta_description || "" },
      { key: "_yoast_wpseo_focuskw", value: kw },
      { key: "_yoast_wpseo_title", value: seoTitle },
      { key: "_yoast_wpseo_metadesc", value: content.meta_description || "" },
      ...(Number.isFinite(soldQty) && soldQty > 0 ? [{ key: "total_sales", value: String(soldQty) }] : []),
    ],
  };

  const p = await createProduct(c, payload);
  if (!coBienThe) return { site, id: p.id, url: p.permalink || p.link || "", status: p.status };

  /* Tạo biến thể ở request thứ hai (WooCommerce không nhận chung với sản phẩm).

     Hỏng ở bước này là trạng thái tệ nhất: sản phẩm cha type "variable" mà không có
     biến thể nào thì trang web hiện nút "Đọc tiếp" thay vì "Thêm vào giỏ" — khách vào
     xem được nhưng KHÔNG mua được, và nhìn trong wp-admin vẫn thấy sản phẩm bình thường.
     Nên nếu đang định đăng công khai thì hạ về nháp trước khi báo lỗi, đừng để hàng
     chết nằm ngoài web. */
  try {
    const created = await createVariations(c, p.id, bienThe.map((v) => variationPayload(tenThuocTinh, v, giaFn)));
    return {
      site, id: p.id, url: p.permalink || p.link || "", status: p.status,
      variants: created.length, variant_attribute: tenThuocTinh,
    };
  } catch (e) {
    let haNhap = "";
    if (payload.status === "publish") {
      try {
        await updateProduct(c, p.id, { status: "draft" });
        haNhap = " — đã hạ sản phẩm về NHÁP để không có hàng không mua được nằm ngoài web";
      } catch {
        haNhap = ` — CẢNH BÁO: hạ về nháp cũng thất bại, vào wp-admin ẩn sản phẩm #${p.id} ngay`;
      }
    }
    throw new Error(`Tạo sản phẩm #${p.id} xong nhưng biến thể lỗi: ${e.message}${haNhap}`);
  }
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
  const targets = body.site === "all" ? ["doscom", "noma", "nomaauto"] : [String(body.site || "").toLowerCase()];
  const VALID = new Set(["doscom", "noma", "nomaauto"]);
  if (!targets.every((s) => VALID.has(s))) {
    return json({ ok: false, error: "site phải là doscom, noma, nomaauto hoặc all" }, 400);
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
