// /api/products/sale-images — menu "Ảnh sale" (ảnh đại diện sản phẩm theo đợt sale).
//
// GET  ?img=<url>   Proxy ảnh cho canvas trên trình duyệt. Ảnh doscom.vn/noma.vn khác origin →
//                   vẽ lên canvas là canvas bị "bẩn", không xuất được file. CHỈ nhận ảnh của
//                   chính 2 web (isProxyableImage) — nhận link tuỳ ý là thành cổng SSRF.
//
// POST (body JSON, luôn trả JSON):
//   { site, mode:"list" }
//       → { ok, site, products:[{id,name,sku,type,permalink,regular_price,sale_price,
//            featured:{id,src}|null, sale:{...}|null, sale_mismatch}], sale_count }   (ĐỌC, không token)
//   { site, mode:"apply", campaign, kind:"frame"|"upload", items:[{id, image_b64, mime}] }
//       → lưu ảnh gốc vào KV → upload WP Media → đặt làm ảnh đại diện (giữ gallery)
//         → xoá ảnh sale CŨ của chính tool nếu có.   (GHI, cần token)
//   { site, mode:"restore", ids:[..] }
//       → trả ảnh đại diện cũ → xoá VĨNH VIỄN file ảnh sale khỏi Media → xoá bản ghi KV.
//         Chủ dự án chốt 14/09/2026: gỡ là xoá luôn file.   (GHI, cần token)
//   { site, mode:"forget", id }
//       → chỉ xoá bản ghi KV (SP đã bị đổi ảnh tay, không gỡ tự động được).   (GHI, cần token)
//
// Bảo vệ (red line endpoint GHI phải có token): Access role != "open" → cho qua;
// "open" → cần X-Products-Token == env.PRODUCTS_TOKEN.
import { getIdentity } from "../../lib/access.js";
import {
  siteCreds, isConfigured, listProducts, getProductFull, updateProduct,
  uploadMedia, deleteMedia, b64ToBytes,
} from "./_wc.js";
import {
  SALE_SITES, stateKey, statePrefix, planApply, planRestore,
  imagesWithFeatured, saleFilename, extFromMime, isProxyableImage,
} from "../../lib/sale-images.js";

const MAX_ITEMS = 3;          // ảnh gửi base64 — UI gửi từng SP một, trần này chặn body quá nặng
const MAX_RESTORE = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 10;         // 10 × 100 SP/trang

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readState(env, site, id) {
  if (!env.INVENTORY) return null;
  const raw = await env.INVENTORY.get(stateKey(site, id)).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Metadata KV (≤1024 byte) để mode list đọc trạng thái mọi SP bằng 1 lần list, không get từng key.
async function writeState(env, site, state) {
  // orig_src cần cho UI (xem trước dựng từ ảnh gốc + ô "ảnh cũ" ở tab Gỡ); link quá dài thì bỏ
  // để không vượt trần metadata — bản đầy đủ vẫn nằm trong value.
  const origSrc = String(state.orig_src || "");
  const meta = {
    sale_id: state.sale_id, orig_id: state.orig_id, campaign: String(state.campaign || "").slice(0, 60),
    kind: state.kind, at: state.at, orig_src: origSrc.length <= 600 ? origSrc : "",
  };
  await env.INVENTORY.put(stateKey(site, state.id), JSON.stringify(state), { metadata: meta });
}

async function listStates(env, site) {
  const out = new Map();
  if (!env.INVENTORY) return out;
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await env.INVENTORY.list({ prefix: statePrefix(site), cursor });
    for (const k of r.keys || []) {
      const id = Number(k.name.slice(statePrefix(site).length));
      if (id) out.set(id, k.metadata || {});
    }
    if (r.list_complete || !r.cursor) break;
    cursor = r.cursor;
  }
  return out;
}

// ── GET: proxy ảnh ──
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const src = url.searchParams.get("img") || "";
  if (!isProxyableImage(src)) return json({ ok: false, error: "Chỉ nhận ảnh https của doscom.vn / noma.vn" }, 400);
  try {
    const r = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0 crm-doscom" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return json({ ok: false, error: `Tải ảnh lỗi ${r.status}` }, 502);
    if (!isProxyableImage(r.url || src)) return json({ ok: false, error: "Ảnh chuyển hướng ra ngoài 2 web" }, 400);
    const type = (r.headers.get("content-type") || "").split(";")[0];
    if (!/^image\//i.test(type)) return json({ ok: false, error: "Không phải file ảnh" }, 400);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return json({ ok: false, error: "Ảnh quá lớn" }, 413);
    return new Response(buf, { headers: { "content-type": type, "cache-control": "private, max-age=600" } });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}

// ── POST ──
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "body_not_json" }, 400); }
  if (!body || typeof body !== "object") return json({ ok: false, error: "body_not_json" }, 400);

  const site = String(body.site || "").toLowerCase();
  if (!SALE_SITES.includes(site)) return json({ ok: false, error: `Web không hỗ trợ: '${site}' (chỉ doscom, noma)` }, 400);
  const mode = String(body.mode || "list");
  if (!["list", "apply", "restore", "forget"].includes(mode)) return json({ ok: false, error: `mode không hợp lệ: ${mode}` }, 400);

  if (mode !== "list") {
    const identity = await getIdentity(context);
    if (identity.role === "open") {
      if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
        return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
      }
    }
    // Không có KV thì không lưu được ảnh gốc → gắn vào là mất đường trả lại. Chặn hẳn.
    if (!env.INVENTORY) return json({ ok: false, error: "Thiếu KV INVENTORY — không lưu được ảnh gốc nên không cho ghi" }, 500);
  }

  const c = siteCreds(site, env);
  if (!isConfigured(c)) return json({ ok: false, error: `Web '${site}' chưa cấu hình credential WooCommerce/WordPress` }, 400);

  try {
    if (mode === "list") return json(await doList(c, env, site));
    if (mode === "apply") return json(await doApply(c, env, site, body));
    if (mode === "restore") return json(await doRestore(c, env, site, body));
    const id = Number(body.id);
    if (!id) return json({ ok: false, error: "Thiếu id" }, 400);
    await env.INVENTORY.delete(stateKey(site, id));
    return json({ ok: true, site, id, forgotten: true });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}

async function doList(c, env, site) {
  const fields = "id,name,sku,type,status,permalink,regular_price,sale_price,images";
  const [states, all] = await Promise.all([
    listStates(env, site),
    (async () => {
      const out = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { items, totalPages } = await listProducts(c, { perPage: 100, page, fields });
        out.push(...items);
        if (page >= totalPages || !items.length) break;
      }
      return out;
    })(),
  ]);

  const products = all.map((p) => {
    const f = (p.images || [])[0];
    const sale = states.get(p.id) || null;
    return {
      id: p.id, name: p.name, sku: p.sku || "", type: p.type, permalink: p.permalink,
      regular_price: p.regular_price || "", sale_price: p.sale_price || "",
      featured: f ? { id: f.id, src: f.src } : null,
      sale,
      sale_mismatch: !!(sale && (!f || f.id !== sale.sale_id)),
    };
  });
  // Bản ghi sale của SP không còn trong danh sách (đã xoá/ẩn) → vẫn báo để người dùng biết.
  const orphan = [...states.keys()].filter((id) => !all.some((p) => p.id === id));
  return { ok: true, site, products, sale_count: states.size, orphan_sale_ids: orphan };
}

async function doApply(c, env, site, body) {
  const campaign = String(body.campaign || "").trim().slice(0, 60);
  if (!campaign) return { ok: false, error: "Thiếu tên đợt sale" };
  const kind = body.kind === "upload" ? "upload" : "frame";
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return { ok: false, error: "Thiếu ảnh" };

  const out = [];
  for (const it of items) {
    const id = Number(it && it.id);
    const ext = extFromMime(it && it.mime);
    if (!id) { out.push({ id: null, applied: false, error: "thiếu id" }); continue; }
    if (!ext) { out.push({ id, applied: false, error: "chỉ nhận ảnh JPG/PNG/WEBP" }); continue; }

    let bytes;
    try { bytes = b64ToBytes(it.image_b64); } catch { bytes = null; }
    if (!bytes || !bytes.length) { out.push({ id, applied: false, error: "ảnh rỗng/hỏng" }); continue; }
    if (bytes.length > MAX_IMAGE_BYTES) { out.push({ id, applied: false, error: "ảnh quá 8MB" }); continue; }

    let p;
    try { p = await getProductFull(c, id); }
    catch (e) { out.push({ id, applied: false, error: `đọc SP lỗi: ${String(e.message || e)}` }); continue; }

    const prev = await readState(env, site, id);
    const plan = planApply(p.images, prev);

    let media;
    try {
      media = await uploadMedia(c, {
        bytes, mime: it.mime, filename: saleFilename(campaign, p.name, ext),
        alt: p.name, title: `Ảnh sale ${campaign} — ${p.name}`,
      });
    } catch (e) {
      out.push({ id, name: p.name, permalink: p.permalink, applied: false, error: String(e.message || e) });
      continue;
    }

    // Ghi KV TRƯỚC khi đổi ảnh: đổi xong mà ghi hỏng thì mất dấu ảnh gốc.
    const state = {
      id, site, name: p.name, campaign, kind,
      orig_id: plan.orig_id, orig_src: plan.orig_src,
      sale_id: media.id, sale_src: media.source_url,
      at: new Date().toISOString(),
    };
    try {
      await writeState(env, site, state);
    } catch (e) {
      await deleteMedia(c, media.id);
      out.push({ id, name: p.name, permalink: p.permalink, applied: false, error: `không lưu được ảnh gốc (KV): ${String(e.message || e)}` });
      continue;
    }

    try {
      await updateProduct(c, id, { images: imagesWithFeatured(p.images, media.id) });
    } catch (e) {
      // Hoàn nguyên: trả bản ghi cũ + dọn file vừa up để thư viện không mọc ảnh mồ côi.
      if (prev) await writeState(env, site, prev).catch(() => {});
      else await env.INVENTORY.delete(stateKey(site, id)).catch(() => {});
      await deleteMedia(c, media.id);
      out.push({ id, name: p.name, permalink: p.permalink, applied: false, error: String(e.message || e) });
      continue;
    }

    let oldDeleted = null;
    if (plan.delete_old_sale_id && plan.delete_old_sale_id !== media.id) {
      const d = await deleteMedia(c, plan.delete_old_sale_id);
      oldDeleted = d.ok ? true : d.error;
    }
    out.push({
      id, name: p.name, permalink: p.permalink, applied: true,
      sale_src: media.source_url, orig_src: plan.orig_src,
      old_sale_deleted: oldDeleted,
      note: plan.mismatch ? "Ảnh đại diện từng bị đổi tay — lấy ảnh hiện tại làm ảnh gốc" : "",
    });
  }

  const applied = out.filter((x) => x.applied).length;
  return { ok: true, site, campaign, applied, failed: out.length - applied, items: out };
}

async function doRestore(c, env, site, body) {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean).slice(0, MAX_RESTORE);
  if (!ids.length) return { ok: false, error: "Thiếu danh sách SP" };

  const out = [];
  for (const id of ids) {
    const state = await readState(env, site, id);
    let p;
    try { p = await getProductFull(c, id); }
    catch (e) { out.push({ id, restored: false, error: `đọc SP lỗi: ${String(e.message || e)}` }); continue; }

    const plan = planRestore(p.images, state);
    if (!plan.ok) { out.push({ id, name: p.name, permalink: p.permalink, restored: false, skipped: plan.reason }); continue; }

    try {
      await updateProduct(c, id, { images: plan.images });
    } catch (e) {
      const msg = String(e.message || e);
      const hint = /image|attachment|ảnh/i.test(msg) ? " — có thể ảnh gốc đã bị xoá khỏi thư viện Media" : "";
      out.push({ id, name: p.name, permalink: p.permalink, restored: false, error: msg + hint });
      continue;
    }

    const d = await deleteMedia(c, state.sale_id);
    await env.INVENTORY.delete(stateKey(site, id)).catch(() => {});
    out.push({
      id, name: p.name, permalink: p.permalink, restored: true,
      orig_src: state.orig_src, media_deleted: d.ok, media_error: d.ok ? "" : d.error,
    });
  }

  const restored = out.filter((x) => x.restored).length;
  return { ok: true, site, restored, skipped: out.filter((x) => x.skipped).length, failed: out.filter((x) => x.error).length, items: out };
}
