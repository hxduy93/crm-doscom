// POST /api/products/fix-images
// Menu "Sửa ảnh hỏng" — vá ảnh 404 trong MÔ TẢ sản phẩm (bài viết), không đụng ảnh đại diện/gallery.
//
// Vì sao cần: noma.vn đã nạp lại thư viện media (file chuyển sang /uploads/2026/03/…) nhưng mô tả
// sản phẩm còn trỏ đường dẫn cũ (/uploads/2025/10|11|12/…) → ảnh trong bài 404, mất sạch ảnh minh hoạ.
//
// Bảo vệ (red line: endpoint GHI phải có token): Access role != "open" → cho qua; "open" → cần X-Products-Token.
//
// Body:
//   { site, mode: "scan", ids?: [..] }
//     → đọc SP (mặc định: mọi SP NOMA) → lấy URL ảnh trong description/short_description
//       → kiểm tra ảnh nào 404 → tìm ảnh thay thế CÙNG TÊN trong thư viện media.
//     Trả: { ok, site, scanned, checked_urls, products:[{id,name,permalink,broken,fixable,
//              images:[{src, replacement, match}] }] }   // match: exact | suffix | none
//     KHÔNG ghi gì lên web.
//
//   { site, mode: "apply", fixes: [{ id, pairs: [{from,to}] }] }
//     → backup mô tả gốc vào KV → thay CHUỖI URL nguyên văn → PUT (giữ status).
//     Trả: { ok, site, applied, skipped, failed, images_fixed, items[], generated_at }
//
//   { site, mode: "revert", id, backup_key? }  → khôi phục mô tả từ backup.
//
// An toàn: chỉ thay URL ảnh (không viết lại HTML → giữ nguyên layout); chỉ nhận ảnh thay thế khớp
// CHẮC CHẮN theo tên file (exact / hậu tố "-1" của WordPress) — không khớp thì BỎ QUA và báo lại.
import { getIdentity } from "../../lib/access.js";
import { siteCreds, isConfigured, listProducts, getProduct, updateProduct, isNomaProduct, listMedia, imageAlive } from "./_wc.js";
import { extractImageUrls, buildMediaIndex, pickReplacement, replaceImageUrls } from "./_images.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const KV_BACKUP = (site, id, ts) => `imgbackup:${site}:${id}:${ts}`;
const KV_LATEST = (site, id) => `imgbackup_last:${site}:${id}`;

// Trần số ảnh kiểm tra 1 lượt quét — Cloudflare giới hạn subrequest/request.
// Chạm trần thì BÁO RÕ (không im lặng cắt) để người dùng quét tiếp phần còn lại theo ids.
const MAX_URL_CHECKS = 220;

async function collectProducts(c, site, ids) {
  if (ids && ids.length) {
    const out = [];
    for (const id of ids.slice(0, 30)) out.push(await getProduct(c, id));
    return { items: out, scanned: out.length };
  }
  // doscom.vn trộn cả SP an ninh → search "NOMA" + lọc; noma.vn/nomaauto.us: mọi SP đều là NOMA.
  const isMixed = site === "doscom";
  const out = [];
  let scanned = 0;
  for (let page = 1; page <= 6; page++) {
    const { items, totalPages } = await listProducts(c, { search: isMixed ? "NOMA" : "", perPage: 50, page });
    scanned += items.length;
    for (const p of items) {
      if (isMixed && !isNomaProduct(p)) continue;
      out.push(p);
    }
    if (page >= totalPages || !items.length) break;
  }
  return { items: out, scanned };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Body không phải JSON" }, 400);

  const site = String(body.site || "").toLowerCase();
  const mode = String(body.mode || "scan");
  const c = siteCreds(site, env);
  if (!isConfigured(c)) return json({ ok: false, error: `Site '${site}' chưa cấu hình credential WooCommerce` }, 400);

  // Quét chỉ ĐỌC → không cần token. Mọi mode GHI (apply/revert) phải qua cửa.
  if (mode !== "scan") {
    const identity = await getIdentity(context);
    if (identity.role === "open") {
      if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
        return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
      }
    }
  }

  try {
    // ── QUÉT ──
    if (mode === "scan") {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const [{ items, scanned }, media] = await Promise.all([
        collectProducts(c, site, ids),
        listMedia(c),
      ]);
      const index = buildMediaIndex(media);

      // Kiểm tra mỗi URL đúng 1 lần (nhiều SP dùng chung 1 ảnh) → tiết kiệm subrequest.
      const alive = new Map();
      let checks = 0, truncated = false;
      const products = [];

      for (const p of items) {
        const urls = extractImageUrls(`${p.short_description || ""}\n${p.description || ""}`);
        const images = [];
        for (const u of urls) {
          if (!alive.has(u)) {
            if (checks >= MAX_URL_CHECKS) { truncated = true; continue; }
            checks++;
            alive.set(u, await imageAlive(u));
          }
          if (alive.get(u)) continue; // ảnh còn sống → không đụng
          const rep = pickReplacement(u, index);
          images.push({ src: u, replacement: rep.url, match: rep.match });
        }
        if (images.length) {
          products.push({
            id: p.id, name: p.name, permalink: p.permalink,
            broken: images.length,
            fixable: images.filter((i) => i.match !== "none").length,
            images,
          });
        }
      }

      return json({
        ok: true, site,
        scanned, media_count: media.length, checked_urls: checks,
        truncated, // chạm trần → còn ảnh chưa kiểm, quét tiếp bằng ids
        broken_products: products.length,
        products,
      });
    }

    // ── ÁP BẢN SỬA ──
    if (mode === "apply") {
      const fixes = Array.isArray(body.fixes) ? body.fixes.slice(0, 30) : [];
      if (!fixes.length) return json({ ok: false, error: "Thiếu danh sách fixes" }, 400);

      const ts = Date.now();
      const items = [];
      let applied = 0, skipped = 0, failed = 0, imagesFixed = 0;

      for (const fx of fixes) {
        const id = fx && fx.id;
        const pairs = (fx && Array.isArray(fx.pairs) ? fx.pairs : []).filter((p) => p && p.from && p.to);
        if (!id) { skipped++; items.push({ id: null, applied: false, error: "thiếu id" }); continue; }
        if (!pairs.length) { skipped++; items.push({ id, applied: false, skipped: "không có ảnh nào để thay" }); continue; }

        let orig;
        try { orig = await getProduct(c, id); }
        catch (e) { failed++; items.push({ id, applied: false, error: `đọc SP lỗi: ${String(e.message || e)}` }); continue; }

        const rd = replaceImageUrls(orig.description || "", pairs);
        const rs = replaceImageUrls(orig.short_description || "", pairs);
        const nFixed = new Set([...rd.replaced, ...rs.replaced]).size;

        if (!nFixed) {
          skipped++;
          items.push({ id, name: orig.name, permalink: orig.permalink, applied: false, skipped: "không URL nào khớp mô tả hiện tại" });
          continue;
        }

        let backupKey = null;
        if (env.INVENTORY) {
          backupKey = KV_BACKUP(site, id, ts);
          const payload = JSON.stringify({
            id, name: orig.name,
            description: orig.description || "",
            short_description: orig.short_description || "",
            savedAt: ts,
          });
          await env.INVENTORY.put(backupKey, payload, { expirationTtl: 90 * 86400 }).catch(() => {});
          await env.INVENTORY.put(KV_LATEST(site, id), backupKey, { expirationTtl: 90 * 86400 }).catch(() => {});
        }

        try {
          // KHÔNG gửi status → WooCommerce giữ nguyên trạng thái đăng. Chỉ đổi 2 field mô tả.
          await updateProduct(c, id, { description: rd.html, short_description: rs.html });
          applied++;
          imagesFixed += nFixed;
          items.push({
            id, name: orig.name, permalink: orig.permalink, applied: true,
            images_fixed: nFixed, backup_key: backupKey,
          });
        } catch (e) {
          failed++;
          items.push({ id, name: orig.name, permalink: orig.permalink, applied: false, error: String(e.message || e), backup_key: backupKey });
        }
      }

      return json({
        ok: true, site,
        applied, skipped, failed,
        images_fixed: imagesFixed,
        items,
        generated_at: new Date(ts).toISOString(),
      });
    }

    // ── HOÀN TÁC ──
    if (mode === "revert") {
      const id = body.id;
      if (!id) return json({ ok: false, error: "Thiếu id" }, 400);
      if (!env.INVENTORY) return json({ ok: false, error: "Không có KV backup — không hoàn tác được" }, 400);
      const key = body.backup_key || (await env.INVENTORY.get(KV_LATEST(site, id)).catch(() => null));
      if (!key) return json({ ok: false, error: "Không tìm thấy backup cho SP này" }, 404);
      const raw = await env.INVENTORY.get(key).catch(() => null);
      if (!raw) return json({ ok: false, error: "Backup đã hết hạn/không tồn tại" }, 404);
      let bak;
      try { bak = JSON.parse(raw); } catch { return json({ ok: false, error: "Backup hỏng" }, 500); }
      await updateProduct(c, id, {
        description: bak.description || "",
        short_description: bak.short_description || "",
      });
      return json({ ok: true, reverted: true, id, restored_from: key });
    }

    return json({ ok: false, error: `mode không hợp lệ: ${mode}` }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}
