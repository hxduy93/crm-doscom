#!/usr/bin/env node
/**
 * Kiểm tra token Facebook TRƯỚC KHI nạp lên Cloudflare.
 * ------------------------------------------------------
 * Trả lời đúng 3 câu hỏi khiến /api/fb-accounts-pages hỏng:
 *   1. Token thuộc LOẠI nào? (USER / SYSTEM_USER / PAGE / APP)
 *      → PAGE và APP không chạy được trình tạo QC. SYSTEM_USER thì /me hỏng
 *        nhưng act_{id} vẫn chạy (đường batch của endpoint lo việc này).
 *   2. Còn hạn không, và có đủ scope ads_management / ads_read chưa?
 *   3. Thực tế đọc được TKQC nào, mỗi TK có Page + Pixel để chạy QC không?
 *
 * Dùng:
 *   FB_TOKEN=EAAxxxx node scripts/fb-token-check.mjs
 *
 * KHÔNG truyền token làm tham số dòng lệnh — nó sẽ nằm lại trong lịch sử shell.
 * Script chỉ ĐỌC, không ghi gì lên Meta. Token không bị in ra màn hình.
 */
import { getIdentity, visibleAccounts } from "../functions/lib/access.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.FB_TOKEN || process.env.FB_ACCESS_TOKEN || "";
const NEEDED_SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list"];
const ACCOUNT_FIELDS =
  "account_id,name,account_status,promote_pages.limit(50){id,name},adspixels.limit(50){id,name}";
const STATUS_MAP = {
  1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT", 9: "IN_GRACE_PERIOD", 100: "PENDING_CLOSURE",
  101: "CLOSED", 201: "ANY_ACTIVE", 202: "ANY_CLOSED",
};

const OK = "\x1b[32m✔\x1b[0m", BAD = "\x1b[31m✘\x1b[0m", WARN = "\x1b[33m⚠\x1b[0m";
const line = (s = "") => console.log(s);
const head = (s) => line(`\n\x1b[1m${s}\x1b[0m`);
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null);

// Thoát bằng process.exitCode + return chứ KHÔNG process.exit(): trên Windows/Node 24,
// exit() lúc socket fetch còn mở làm libuv abort (assert UV_HANDLE_CLOSING) → mã thoát
// rác 127 và mất luôn phần kết luận vừa in.
const fail = (code = 1) => { process.exitCode = code; };

async function graph(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(`${GRAPH}${path}?${qs}`, { signal: AbortSignal.timeout(25000) });
  const d = await r.json().catch(() => ({ error: { message: `Non-JSON (HTTP ${r.status})` } }));
  if (!r.ok || d.error) throw new Error(d.error?.message || `HTTP ${r.status}`);
  return d;
}

async function main() {
  if (!TOKEN) {
    line(`${BAD} Chưa có token. Chạy:  FB_TOKEN=EAAxxxx node scripts/fb-token-check.mjs`);
    return fail(2);
  }

  // ── 1. Token là gì ──────────────────────────────────────────────────────────
  head("1. Token này là gì?");
  let info;
  try {
    info = (await graph("/debug_token", { input_token: TOKEN })).data || {};
  } catch (e) {
    line(`${BAD} debug_token hỏng: ${e.message}`);
    line("   → Token sai định dạng hoặc đã bị thu hồi. Lấy token mới.");
    return fail();
  }

  // Meta trả "USER" cho cả System User ở vài phiên bản → dựa thêm vào expires_at=0.
  const type = info.type || "?";
  const perpetual = !info.expires_at;
  let fatal = false;

  line(`   Loại        : ${type}${type === "USER" && perpetual ? " (nhiều khả năng System User — không hết hạn)" : ""}`);
  line(`   App ID      : ${info.app_id || "?"} — ${info.application || "?"}`);
  line(`   Hợp lệ      : ${info.is_valid ? "có" : "KHÔNG"}`);
  line(`   Hết hạn     : ${perpetual ? "không (vĩnh viễn)" : fmtDate(info.expires_at)}`);
  if (info.data_access_expires_at) line(`   Data-access : hết ${fmtDate(info.data_access_expires_at)}`);

  if (!info.is_valid) {
    line(`${BAD} Token KHÔNG hợp lệ — hết hạn hoặc đã bị thu hồi.`);
    fatal = true;
  }
  if (type === "PAGE") {
    line(`${BAD} Đây là PAGE token — không tạo được quảng cáo. Cần User hoặc System User token.`);
    fatal = true;
  }
  if (type === "APP") {
    line(`${BAD} Đây là APP token (app_id|app_secret) — không có ngữ cảnh người dùng, không chạy Ads API.`);
    fatal = true;
  }
  if (!perpetual && info.expires_at * 1000 - Date.now() < 7 * 864e5) {
    line(`${WARN} Còn dưới 7 ngày là hết hạn. Nên đổi sang System User token (vĩnh viễn).`);
  }

  // ── 2. Scope ────────────────────────────────────────────────────────────────
  head("2. Đủ quyền chưa?");
  const scopes = info.scopes || [];
  const missing = NEEDED_SCOPES.filter((s) => !scopes.includes(s));
  for (const s of NEEDED_SCOPES) line(`   ${scopes.includes(s) ? OK : BAD} ${s}`);
  if (missing.length) {
    line(`${BAD} Thiếu: ${missing.join(", ")} → cấp thêm rồi lấy lại token.`);
    fatal = true;
  }

  // ── 3. /me có dùng được không ───────────────────────────────────────────────
  head("3. /me — endpoint từng gây lỗi");
  let meWorks = false;
  try {
    const me = await graph("/me", { fields: "id,name" });
    line(`   ${OK} /me chạy được → ${me.name || "?"} (${me.id})`);
    meWorks = true;
  } catch (e) {
    line(`   ${WARN} /me hỏng: ${e.message.slice(0, 120)}`);
    line("      Bình thường với System User token. Endpoint đã có đường batch thay thế.");
  }

  // ── 4. Thực tế đọc được TKQC nào ────────────────────────────────────────────
  head("4. Đọc được tài khoản QC nào?");
  const id = await getIdentity({ request: new Request("https://x"), env: {} });
  const known = visibleAccounts(id);          // 6 TK cấu hình trong lib/access.js

  if (meWorks) {
    try {
      const d = await graph("/me/adaccounts", { fields: "account_id,name", limit: "200" });
      line(`   ${OK} /me/adaccounts → ${(d.data || []).length} TK`);
    } catch (e) {
      line(`   ${WARN} /me/adaccounts hỏng: ${e.message.slice(0, 100)}`);
    }
  }

  let usable = 0;
  for (const a of known) {
    try {
      const acc = await graph(`/act_${a.id}`, { fields: ACCOUNT_FIELDS });
      const pages = acc.promote_pages?.data || [];
      const pixels = acc.adspixels?.data || [];
      const status = STATUS_MAP[acc.account_status] || `UNKNOWN(${acc.account_status})`;
      const good = status === "ACTIVE" && pages.length > 0;
      if (good) usable++;
      line(`   ${good ? OK : WARN} act_${a.id} · ${acc.name || a.name}`);
      line(`       ${status} · ${pages.length} page · ${pixels.length} pixel${good ? "" : "  ← cần ACTIVE + ≥1 page mới chạy QC được"}`);
    } catch (e) {
      line(`   ${BAD} act_${a.id} · ${a.name}`);
      line(`       ${e.message.slice(0, 140)}`);
    }
  }

  // ── Kết luận ────────────────────────────────────────────────────────────────
  head("Kết luận");
  if (fatal) {
    line(`${BAD} Token này KHÔNG dùng được. Sửa các mục ✘ ở trên rồi lấy token khác.`);
    return fail();
  }
  if (!usable) {
    line(`${BAD} Token hợp lệ nhưng không TK nào chạy QC được (thiếu quyền, hoặc chưa gán Page).`);
    line("   → Business Settings → Ad Accounts → gán System User vào TK, quyền 'Manage'.");
    return fail();
  }
  line(`${OK} Dùng được — ${usable}/${known.length} tài khoản sẵn sàng chạy QC.`);
  line(`   Endpoint sẽ chạy đường: ${meWorks ? 'source="me"' : 'source="batch"'}`);
  line("\n   Nạp lên Cloudflare:");
  line("   npx wrangler@4 pages secret put FB_ACCESS_TOKEN --project-name crm-doscom");
}

await main();
