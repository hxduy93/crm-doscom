// Phân quyền đa-tài-khoản cho CRM dựa trên Cloudflare Access.
//
// Danh tính lấy từ header `Cf-Access-Authenticated-User-Email` (Access tự gắn).
// - Worker/nội bộ: gửi header `X-Internal-Token == env.OPTIMIZER_TOKEN` → full quyền.
// - Access CHƯA bật (không có header email): trả role "open" = full (giữ nguyên giai đoạn public).
// - Access bật: tra `staff_access` (email → role). admin = mọi account; staff = account có staff trùng.
//
// Nguồn quyền sở hữu: data/fb-config.json → account_to_groups[acct].staff (sổ đăng ký sẵn có).
// Import thẳng JSON (esbuild bundle khi deploy) — KHÔNG fetch (Pages Function fetch asset không ổn định).
import fbConfigDefault from "../../data/fb-config.json";

async function loadConfig(env) {
  let kv = null;
  if (env.INVENTORY) {
    try { kv = await env.INVENTORY.get("fb_config", { type: "json" }); } catch { /* ignore */ }
  }
  const base = fbConfigDefault || {};
  return {
    // account_to_groups: ưu tiên KV (user edit qua UI), fallback file bundle
    account_to_groups: (kv && kv.account_to_groups) || base.account_to_groups || {},
    // staff_access: admin quản trong file (deployed)
    staff_access: base.staff_access || (kv && kv.staff_access) || {},
  };
}

function activeAccountIds(conf) {
  return Object.entries(conf.account_to_groups)
    .filter(([, a]) => a && a.active)
    .map(([id]) => id);
}

// Trả { email, role, accounts:[id...], all:bool, conf }.
export async function getIdentity(context) {
  const { request, env } = context;
  const conf = await loadConfig(env);

  // 1) Nội bộ (Worker) qua secret dùng chung
  const internal = request.headers.get("X-Internal-Token");
  if (env.OPTIMIZER_TOKEN && internal && internal === env.OPTIMIZER_TOKEN) {
    return { email: "internal", role: "internal", accounts: activeAccountIds(conf), all: true, conf };
  }

  const email = (request.headers.get("Cf-Access-Authenticated-User-Email") || "").toLowerCase();

  // 2) Access chưa bật → mở (giữ nguyên hành vi public hiện tại)
  if (!email) {
    return { email: null, role: "open", accounts: activeAccountIds(conf), all: true, conf };
  }

  // 3) Access bật → tra quyền
  const access = (conf.staff_access || {})[email];
  if (!access) {
    return { email, role: "none", accounts: [], all: false, conf };
  }
  if (access.role === "admin") {
    return { email, role: "admin", accounts: activeAccountIds(conf), all: true, conf };
  }
  const accts = Object.entries(conf.account_to_groups)
    .filter(([, a]) => a && a.active && a.staff === access.staff)
    .map(([id]) => id);
  return { email, role: "staff", staff: access.staff, accounts: accts, all: false, conf };
}

// Người này có được thao tác trên account này không?
export function canAccess(identity, accountId) {
  const id = String(accountId || "").replace(/^act_/, "");
  return identity.all === true || identity.accounts.includes(id);
}

// Danh sách tài khoản người này được xem (cho dropdown UI / Worker).
export function visibleAccounts(identity) {
  const a2g = identity.conf.account_to_groups || {};
  return identity.accounts.map((id) => ({
    id,
    name: (a2g[id] || {}).name || id,
    staff: (a2g[id] || {}).staff || null,
  }));
}
