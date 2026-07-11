// POST /api/products/brandcore-apply
// Menu "Sửa brandcore" — NẤC 2: ghi bản đã duyệt lên web + trả REPORT. Có backup để hoàn tác.
//
// Bảo vệ (red line: endpoint ghi phải có token): Access role != "open" → cho qua; "open" → cần X-Products-Token.
//
// Body (áp bản sửa):
//   { site, fixes: [ { id, description, short_description } ] }
//   → mỗi SP: backup nội dung gốc vào KV → PUT cập nhật (GIỮ status publish) → đo vi phạm trước/sau.
//   Trả REPORT: { ok, site, applied, skipped, failed, fixed_total, summary_by_type, items[], generated_at }
//     items[i] = { id, name, permalink, applied, violations_fixed[], residual_flags[], backup_key, error? }
//
// Body (hoàn tác):
//   { mode: "revert", site, id, backup_key? }   // không có backup_key → lấy bản backup mới nhất
//   → khôi phục description/short_description từ backup. Trả { ok, reverted, id }
import { getIdentity } from "../../lib/access.js";
import { scanForbidden } from "../geo/_utils/noma-brandcore.js";
import { siteCreds, isConfigured, getProduct, updateProduct } from "./_wc.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const KV_BACKUP = (site, id, ts) => `bcbackup:${site}:${id}:${ts}`;
const KV_LATEST = (site, id) => `bcbackup_last:${site}:${id}`;
const KV_REPORT = (site, ts) => `bcreport:${site}:${ts}`;

// Loại vi phạm đã khắc phục = có ở bản gốc, hết ở bản sửa.
function diffFlags(original, fixed) {
  const o = scanForbidden(original);
  const f = scanForbidden(fixed);
  const fTypes = new Set(f.map((x) => x.type));
  return {
    fixed: o.filter((x) => !fTypes.has(x.type)).map((x) => x.type),
    residual: f, // vẫn còn sau khi sửa (cảnh báo)
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // --- bảo vệ endpoint ghi ---
  const identity = await getIdentity(context);
  if (identity.role === "open") {
    if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
      return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
    }
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }

  const site = String(body.site || "").toLowerCase();
  const c = siteCreds(site, env);
  if (!isConfigured(c)) return json({ ok: false, error: `Site '${site}' chưa cấu hình credential WooCommerce` }, 400);

  // ── Hoàn tác ──
  if (String(body.mode) === "revert") {
    const id = body.id;
    if (!id) return json({ ok: false, error: "Thiếu id" }, 400);
    if (!env.INVENTORY) return json({ ok: false, error: "Không có KV backup — không hoàn tác được" }, 400);
    let key = body.backup_key;
    if (!key) key = await env.INVENTORY.get(KV_LATEST(site, id)).catch(() => null);
    if (!key) return json({ ok: false, error: "Không tìm thấy backup cho SP này" }, 404);
    const raw = await env.INVENTORY.get(key).catch(() => null);
    if (!raw) return json({ ok: false, error: "Backup đã hết hạn/không tồn tại" }, 404);
    let bak;
    try { bak = JSON.parse(raw); } catch { return json({ ok: false, error: "Backup hỏng" }, 500); }
    try {
      await updateProduct(c, id, {
        description: bak.description || "",
        short_description: bak.short_description || "",
      });
      return json({ ok: true, reverted: true, id, restored_from: key });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 502);
    }
  }

  // ── Áp bản sửa ──
  const fixes = Array.isArray(body.fixes) ? body.fixes.slice(0, 30) : [];
  if (!fixes.length) return json({ ok: false, error: "Thiếu danh sách fixes" }, 400);

  const ts = Date.now();
  const items = [];
  const summary = {}; // type -> số SP khắc phục
  let applied = 0, skipped = 0, failed = 0, fixedTotal = 0;

  for (const fx of fixes) {
    const id = fx.id;
    if (!id) { skipped++; items.push({ id: null, applied: false, error: "thiếu id" }); continue; }

    let orig;
    try { orig = await getProduct(c, id); }
    catch (e) { failed++; items.push({ id, applied: false, error: `đọc SP lỗi: ${String(e.message || e)}` }); continue; }

    const newDesc = typeof fx.description === "string" ? fx.description : (orig.description || "");
    const newShort = typeof fx.short_description === "string" ? fx.short_description : (orig.short_description || "");

    // Không đổi gì → bỏ qua (khỏi tốn 1 lần ghi).
    if (newDesc === (orig.description || "") && newShort === (orig.short_description || "")) {
      skipped++;
      items.push({ id, name: orig.name, permalink: orig.permalink, applied: false, skipped: "không có thay đổi" });
      continue;
    }

    const { fixed, residual } = diffFlags(
      `${orig.short_description || ""} ${orig.description || ""}`,
      `${newShort} ${newDesc}`
    );

    // Backup nội dung gốc trước khi ghi đè (nếu có KV).
    let backupKey = null;
    if (env.INVENTORY) {
      backupKey = KV_BACKUP(site, id, ts);
      const payload = JSON.stringify({
        id, name: orig.name, description: orig.description || "", short_description: orig.short_description || "", savedAt: ts,
      });
      await env.INVENTORY.put(backupKey, payload, { expirationTtl: 90 * 86400 }).catch(() => {});
      await env.INVENTORY.put(KV_LATEST(site, id), backupKey, { expirationTtl: 90 * 86400 }).catch(() => {});
    }

    try {
      // GIỮ nguyên status: KHÔNG gửi status → WooCommerce không đổi (SP không biến mất khỏi store).
      await updateProduct(c, id, { description: newDesc, short_description: newShort });
      applied++;
      fixedTotal += fixed.length;
      for (const t of fixed) summary[t] = (summary[t] || 0) + 1;
      items.push({
        id, name: orig.name, permalink: orig.permalink, applied: true,
        violations_fixed: fixed, residual_flags: residual, backup_key: backupKey,
      });
    } catch (e) {
      failed++;
      items.push({ id, name: orig.name, permalink: orig.permalink, applied: false, error: String(e.message || e), backup_key: backupKey });
    }
  }

  const report = {
    ok: true, site,
    applied, skipped, failed,
    fixed_total: fixedTotal,
    summary_by_type: summary,
    items,
    generated_at: new Date(ts).toISOString(),
  };

  // Lưu report để tra cứu lịch sử (không chặn nếu KV lỗi).
  if (env.INVENTORY) {
    await env.INVENTORY.put(KV_REPORT(site, ts), JSON.stringify(report), { expirationTtl: 90 * 86400 }).catch(() => {});
  }

  return json(report);
}
