// Dùng chung cho 4 endpoint /api/refresh/*.
// Theo khuôn _utils/ của agent-geo — file/thư mục bắt đầu bằng "_" không thành route.

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// Job "running" quá ngần này mà runner không báo gì → coi như runner chết giữa chừng,
// cho phép bấm nút tạo job mới. 90 phút = hơn gấp đôi thời gian chạy thật đo được
// (~40 phút, riêng fetch_pancake_crm_contacts ~25 phút).
export const STALE_SECONDS = 90 * 60;

// Runner im quá ngần này → giao diện coi như máy chạy runner đang tắt.
export const RUNNER_OFFLINE_SECONDS = 5 * 60;

// Danh sách bước CỐ ĐỊNH, đúng thứ tự CI cũ (.github/workflows/*).
// Runner KHÔNG nhận lệnh tuỳ ý từ D1 — nó chỉ chạy đúng danh sách này. Nhờ vậy token
// runner có lộ thì kẻ tấn công cũng không chạy được lệnh bất kỳ trên máy người vận hành.
export const STEPS = [
  { key: "pancake_revenue", label: "Doanh thu Pancake",        script: "scripts/fetch_pancake_revenue.py" },
  { key: "fb_ads",          label: "Facebook Ads",             script: "scripts/fetch_fb_ads.py" },
  { key: "gg_spend",        label: "Google Ads — chi phí",     script: "scripts/fetch_google_ads_spend.py" },
  { key: "gg_ads",          label: "Google Ads — ad-level",    script: "scripts/fetch_google_ads_ads.py" },
  { key: "gg_placement",    label: "Google Ads — placement",   script: "scripts/fetch_google_ads_placement.py" },
  { key: "gg_terms",        label: "Google Ads — search terms",script: "scripts/fetch_google_ads_search_terms.py" },
  { key: "gg_context",      label: "Google Ads — context AI",  script: "scripts/compute_google_ads_metrics.py" },
  { key: "crm_contacts",    label: "Contacts CRM Pancake",     script: "scripts/fetch_pancake_crm_contacts.py" },
  { key: "lead_to_order",   label: "Lead → Order",             script: "scripts/build_lead_to_order.py" },
  { key: "dashboard",       label: "Ráp dashboard",            script: "scripts/build_dashboard_data.py" },
  { key: "noma_landings",   label: "Kiểm landing Noma",        script: "(runner tự gọi /api/nomaXXX/stats)" },
  { key: "tests",           label: "Chạy test",                script: "node --test tests/*.mjs" },
  { key: "deploy",          label: "Deploy lên Cloudflare",    script: "wrangler pages deploy dist" },
];

// 5 landing Noma đẩy đơn thẳng vào D1 của CRM. KHÔNG có bước "lấy dữ liệu" cho chúng —
// dữ liệu vốn đã tươi. Bước noma_landings chỉ kiểm đường đẩy đơn còn sống, vì lỗi lệch
// NOMA911_INGEST_TOKEN sau khi deploy landing làm đơn ngừng về mà stats vẫn trả 200.
export const NOMA_LANDINGS = ["noma911", "noma120", "noma230", "noma350", "noma680"];

// Kiểm token runner. Trả null nếu hợp lệ, hoặc Response 401 nếu không.
// KHÔNG tiết lộ có job đang chờ hay không khi sai token.
export function requireRunner(request, env) {
  const token = request.headers.get("X-Refresh-Token");
  if (!env.REFRESH_RUNNER_TOKEN || token !== env.REFRESH_RUNNER_TOKEN) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  return null;
}

export function requireDB(env) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  return null;
}

// Đánh dấu job running quá hạn thành 'stale'. Gọi trước mọi thao tác đọc/tạo job để
// runner chết giữa chừng không khoá nút vĩnh viễn.
export async function sweepStale(env) {
  const cutoff = nowSec() - STALE_SECONDS;
  await env.DB.prepare(
    `UPDATE refresh_jobs SET status='stale', finished_at=?
     WHERE status IN ('pending','running') AND COALESCE(started_at, created_at) < ?`
  ).bind(nowSec(), cutoff).run();
}

export async function latestJob(env) {
  return await env.DB.prepare(
    `SELECT * FROM refresh_jobs ORDER BY id DESC LIMIT 1`
  ).first();
}

export async function runnerLastSeen(env) {
  const row = await env.DB.prepare(
    `SELECT last_seen_at, runner_version FROM refresh_runner_state WHERE id = 1`
  ).first();
  return row || null;
}
