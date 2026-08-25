// POST /api/products/brandcore-apply
// Menu "Sửa brandcore" — NẤC 2: ghi bản đã duyệt lên web + trả REPORT. Có backup để hoàn tác.
//
// Bảo vệ (red line: endpoint ghi phải có token): Access role != "open" → cho qua; "open" → cần X-Products-Token.
//
// Body: `target` chọn loại nội dung — "product" (mặc định, sản phẩm WooCommerce) hoặc
//   "guide" (BÀI VIẾT WordPress). Với target "guide", mỗi phần tử fixes dùng MỘT trong:
//     { id, violations } | { id, content } | { id, title }   <- vá tiêu đề
//   Ghi `content` bị TỪ CHỐI nếu không đọc được `content.raw` của bài; vá `title` thì
//   không cần raw vì không đụng nội dung (xem khối cuối file).
//
// Body (áp bản sửa) — HAI kiểu, mỗi phần tử fixes dùng MỘT trong hai:
//   a) { id, violations: [{original, fixed}] }  → thay chuỗi nguyên văn (sửa từ cấm)
//   b) { id, description, short_description? }  → ghi thẳng nội dung mới (bổ sung mục thiếu)
//   → mỗi SP: backup nội dung gốc vào KV → PUT cập nhật (GIỮ status publish) → đo vi phạm trước/sau.
//   Trả REPORT: { ok, site, applied, skipped, failed, fixed_total, summary_by_type, items[], generated_at }
//     items[i] = { id, name, permalink, applied, violations_fixed[], residual_flags[], backup_key, error? }
//
// Body (hoàn tác):
//   { mode: "revert", site, id, backup_key? }   // không có backup_key → lấy bản backup mới nhất
//   → khôi phục description/short_description từ backup. Trả { ok, reverted, id }
import { getIdentity } from "../../lib/access.js";
import {
  scanForbidden, applyFixes,
  NOMA_FORBIDDEN, NOMA_FORBIDDEN_EN, CLAIM_QUANG_CAO_CHUNG,
} from "../geo/_utils/noma-brandcore.js";
import { siteCreds, isConfigured, getProduct, updateProduct } from "./_wc.js";
import { getPost, updatePost, laBaiNoma } from "./_wp-posts.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const KV_BACKUP = (site, id, ts) => `bcbackup:${site}:${id}:${ts}`;
const KV_LATEST = (site, id) => `bcbackup_last:${site}:${id}`;
const KV_REPORT = (site, ts) => `bcreport:${site}:${ts}`;

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
  const target = String(body.target || "product").toLowerCase();
  const c = siteCreds(site, env);
  if (!isConfigured(c)) return json({ ok: false, error: `Site '${site}' chưa cấu hình credential WooCommerce` }, 400);

  // Bài hướng dẫn ghi qua WordPress REST — đường riêng ở cuối file.
  if (target === "guide") return await apDungBaiHuongDan({ env, c, site, body });
  if (target !== "product") return json({ ok: false, error: `target không hợp lệ: ${target}` }, 400);

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
    const violations = Array.isArray(fx.violations) ? fx.violations : [];
    /* HAI KIỂU GHI, cố ý tách bạch:
         a) cặp sửa (violations)  — sửa từ cấm/claim sai: thay chuỗi nguyên văn trên
            bản gốc mới nhất, giữ 100% layout.
         b) ghi thẳng (description) — bổ sung mục còn thiếu vào cuối bài: nội dung đã
            được dựng sẵn và người dùng đã xem trước từng chữ.
       Trước 22/08/2026 chỉ có (a): gửi `description` thì endpoint ÂM THẦM bỏ qua và
       trả applied:false — nút "Áp lên web" của phần soát nội dung thiếu chưa bao giờ
       ghi được gì, mà giao diện vẫn báo xong vì chỉ nhìn `ok` của phản hồi.
       Chú thích đầu file vốn đã mô tả kiểu (b), chỉ là code chưa làm. */
    const ghiThang = typeof fx.description === "string" && fx.description.trim() !== "";
    if (!violations.length && !ghiThang) {
      skipped++; items.push({ id, applied: false, skipped: "không có cặp sửa" }); continue;
    }

    let orig;
    try { orig = await getProduct(c, id); }
    catch (e) { failed++; items.push({ id, applied: false, error: `đọc SP lỗi: ${String(e.message || e)}` }); continue; }

    // Áp cặp sửa bằng THAY CHUỖI NGUYÊN VĂN trên bản gốc mới nhất → giữ nguyên 100% layout.
    let newDesc, newShort, fixedTypes;
    if (ghiThang) {
      newDesc = fx.description;
      // KHÔNG đụng mô tả ngắn nếu người gọi không gửi — phần bổ sung chỉ nối vào mô tả dài.
      newShort = typeof fx.short_description === "string" ? fx.short_description : (orig.short_description || "");
      fixedTypes = ["Bổ sung nội dung thiếu"];
    } else {
      const rd = applyFixes(orig.description || "", violations);
      const rs = applyFixes(orig.short_description || "", violations);
      newDesc = rd.fixed; newShort = rs.fixed;
      fixedTypes = [...new Set([...rd.applied, ...rs.applied])];
    }

    // Không đổi gì (không cặp nào khớp) → bỏ qua, không ghi.
    if (newDesc === (orig.description || "") && newShort === (orig.short_description || "")) {
      skipped++;
      items.push({ id, name: orig.name, permalink: orig.permalink, applied: false, skipped: "không cặp sửa nào khớp text gốc" });
      continue;
    }

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
      // CHỈ ghi description + short_description (thay chuỗi) → KHÔNG đụng ảnh/gallery/thuộc tính khác.
      await updateProduct(c, id, { description: newDesc, short_description: newShort });
      applied++;
      fixedTotal += fixedTypes.length;
      for (const t of fixedTypes) summary[t] = (summary[t] || 0) + 1;
      const residual = scanForbidden(`${newShort} ${newDesc}`, site === "nomaauto" ? NOMA_FORBIDDEN_EN : undefined); // còn sót cụm cấm nào không
      items.push({
        id, name: orig.name, permalink: orig.permalink, applied: true,
        violations_fixed: fixedTypes, residual_flags: residual, backup_key: backupKey,
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

/* ══════════════════════════════════════════════════════════════════════════════
   GHI BÀI HƯỚNG DẪN SỬ DỤNG (bài viết WordPress) — target: "guide"

   Cố ý VIẾT RIÊNG chứ không gộp chung với nhánh sản phẩm ở trên:
   · Trường khác nhau — sản phẩm có description + short_description, bài chỉ có content.
   · Nguồn ghi khác nhau — WooCommerce REST vs WordPress REST.
   · Nhánh sản phẩm đang chạy thật và đã có test canh từng dòng; gộp lại để "cho gọn"
     là đánh cược cả đường ghi mô tả sản phẩm vào một lần refactor không cần thiết.

   ⛔ RÀO CHẮN QUAN TRỌNG NHẤT: chỉ ghi khi đọc được `content.raw`. Bản `rendered` là
   HTML WordPress đã dựng lại (shortcode đã chạy, khối `<!-- wp:… -->` đã mất) — ghi bản
   đó ngược vào bài là xoá sạch cấu trúc block, không backup nào cứu lại được cảm giác
   "bài bỗng vỡ layout".
   ══════════════════════════════════════════════════════════════════════════════ */

const KV_BACKUP_POST = (site, id, ts) => `bcbackup:${site}:post:${id}:${ts}`;
const KV_LATEST_POST = (site, id) => `bcbackup_last:${site}:post:${id}`;
const KV_REPORT_POST = (site, ts) => `bcreport:${site}:post:${ts}`;

// Bộ từ cấm dùng để đo phần CÒN SÓT sau khi ghi — phải đúng bộ luật đã áp cho bài đó,
// nếu không bài Doscom sẽ bị báo "còn vi phạm xuất xứ NOMA" một cách vô lý.
function luatDoConSot(site, p) {
  if (site === "nomaauto") return NOMA_FORBIDDEN_EN;
  return laBaiNoma(p) ? NOMA_FORBIDDEN : CLAIM_QUANG_CAO_CHUNG;
}

async function apDungBaiHuongDan({ env, c, site, body }) {
  // ── Hoàn tác ──
  if (String(body.mode) === "revert") {
    const id = body.id;
    if (!id) return json({ ok: false, error: "Thiếu id" }, 400);
    if (!env.INVENTORY) return json({ ok: false, error: "Không có KV backup — không hoàn tác được" }, 400);
    let key = body.backup_key;
    if (!key) key = await env.INVENTORY.get(KV_LATEST_POST(site, id)).catch(() => null);
    if (!key) return json({ ok: false, error: "Không tìm thấy backup cho bài này" }, 404);
    const raw = await env.INVENTORY.get(key).catch(() => null);
    if (!raw) return json({ ok: false, error: "Backup đã hết hạn/không tồn tại" }, 404);
    let bak;
    try { bak = JSON.parse(raw); } catch { return json({ ok: false, error: "Backup hỏng" }, 500); }
    /* Khôi phục ĐÚNG trường đã sửa. Bản vá tiêu đề không đọc content.raw (không cần),
       nên backup của nó không có nội dung tin cậy — ghi bừa content lúc hoàn tác là tự
       tay phá bài bằng chính nút cứu hộ. */
    const daSua = Array.isArray(bak.da_sua) ? bak.da_sua : ["content"];
    const khoiPhuc = {};
    if (daSua.includes("content") && typeof bak.content === "string") khoiPhuc.content = bak.content;
    if (daSua.includes("title") && typeof bak.title === "string") khoiPhuc.title = bak.title;
    if (!Object.keys(khoiPhuc).length) return json({ ok: false, error: "Backup không có trường nào khôi phục được" }, 500);
    try {
      await updatePost(c, id, khoiPhuc);
      return json({ ok: true, reverted: true, id, restored_from: key, restored_fields: Object.keys(khoiPhuc) });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 502);
    }
  }

  // ── Áp bản sửa ──
  const fixes = Array.isArray(body.fixes) ? body.fixes.slice(0, 30) : [];
  if (!fixes.length) return json({ ok: false, error: "Thiếu danh sách fixes" }, 400);

  const ts = Date.now();
  const items = [];
  const summary = {};
  let applied = 0, skipped = 0, failed = 0, fixedTotal = 0;

  for (const fx of fixes) {
    const id = fx.id;
    if (!id) { skipped++; items.push({ id: null, applied: false, error: "thiếu id" }); continue; }
    const violations = Array.isArray(fx.violations) ? fx.violations : [];
    /* BA kiểu ghi: cặp sửa (thay chuỗi trong nội dung), ghi thẳng nội dung mới, và
       VÁ TIÊU ĐỀ. Vá tiêu đề đi riêng vì nó KHÔNG đụng nội dung — không cần content.raw,
       nên không được để rào chắn raw chặn nhầm (46 bài mất tiêu đề của noma.vn phải vá
       được kể cả khi tài khoản không đọc nổi nội dung gốc). */
    const ghiThang = typeof fx.content === "string" && fx.content.trim() !== "";
    const vaTieuDe = typeof fx.title === "string" && fx.title.trim() !== "";
    if (!violations.length && !ghiThang && !vaTieuDe) {
      skipped++; items.push({ id, applied: false, skipped: "không có cặp sửa" }); continue;
    }

    let orig;
    try { orig = await getPost(c, id); }
    catch (e) { failed++; items.push({ id, applied: false, error: `đọc bài lỗi: ${String(e.message || e)}` }); continue; }

    const doiNoiDung = violations.length > 0 || ghiThang;
    if (doiNoiDung && !orig.raw) {
      failed++;
      items.push({
        id, name: orig.name, permalink: orig.permalink, applied: false,
        error: "không đọc được nội dung gốc (raw) — TỪ CHỐI ghi để không phá khối Gutenberg của bài. " +
               "Cấp quyền sửa bài (editor) cho tài khoản Application Password rồi thử lại.",
      });
      continue;
    }

    const ghi = {};
    const fixedTypes = [];
    if (doiNoiDung) {
      if (ghiThang) {
        ghi.content = fx.content;
        fixedTypes.push("Bổ sung nội dung thiếu");
      } else {
        const r = applyFixes(orig.content || "", violations);
        ghi.content = r.fixed;
        fixedTypes.push(...new Set(r.applied));
      }
      // Không cặp nào khớp text gốc → bỏ hẳn trường này ra, không ghi lại y nguyên.
      if (ghi.content === (orig.content || "")) delete ghi.content;
    }
    if (vaTieuDe) {
      const tieuDeMoi = fx.title.trim();
      if (tieuDeMoi !== (orig.tieu_de || "")) {
        ghi.title = tieuDeMoi;
        fixedTypes.push(orig.tieu_de_rong ? "Vá tiêu đề còn trống" : "Đặt lại tiêu đề");
      }
    }

    if (!Object.keys(ghi).length) {
      skipped++;
      items.push({ id, name: orig.name, permalink: orig.permalink, applied: false, skipped: "không có gì thay đổi" });
      continue;
    }

    // Sao lưu ĐÚNG những trường sắp ghi đè — để nút hoàn tác biết phải trả lại cái gì.
    let backupKey = null;
    if (env.INVENTORY) {
      backupKey = KV_BACKUP_POST(site, id, ts);
      const payload = JSON.stringify({
        id, name: orig.name,
        content: orig.content || "", title: orig.tieu_de || "",
        da_sua: Object.keys(ghi), savedAt: ts,
      });
      await env.INVENTORY.put(backupKey, payload, { expirationTtl: 90 * 86400 }).catch(() => {});
      await env.INVENTORY.put(KV_LATEST_POST(site, id), backupKey, { expirationTtl: 90 * 86400 }).catch(() => {});
    }

    try {
      // CHỈ gửi trường đang sửa → không đụng danh mục, ảnh đại diện, trạng thái đăng.
      await updatePost(c, id, ghi);
      applied++;
      fixedTotal += fixedTypes.length;
      for (const t of fixedTypes) summary[t] = (summary[t] || 0) + 1;
      const dungDo = `${ghi.title ?? orig.tieu_de ?? ""} ${ghi.content ?? orig.content ?? ""}`;
      const residual = scanForbidden(dungDo, luatDoConSot(site, orig));
      items.push({
        id, name: ghi.title || orig.name, permalink: orig.permalink, applied: true,
        violations_fixed: fixedTypes, residual_flags: residual, backup_key: backupKey,
      });
    } catch (e) {
      failed++;
      items.push({ id, name: orig.name, permalink: orig.permalink, applied: false, error: String(e.message || e), backup_key: backupKey });
    }
  }

  const report = {
    ok: true, site, target: "guide",
    applied, skipped, failed,
    fixed_total: fixedTotal,
    summary_by_type: summary,
    items,
    generated_at: new Date(ts).toISOString(),
  };
  if (env.INVENTORY) {
    await env.INVENTORY.put(KV_REPORT_POST(site, ts), JSON.stringify(report), { expirationTtl: 90 * 86400 }).catch(() => {});
  }
  return json(report);
}
