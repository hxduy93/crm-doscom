// Phân quyền đa-tài-khoản cho CRM dựa trên Cloudflare Access.
//
// Danh tính lấy từ header `Cf-Access-Authenticated-User-Email` (Access tự gắn).
// - Worker/nội bộ: gửi header `X-Internal-Token == env.OPTIMIZER_TOKEN` → full quyền.
// - Access CHƯA bật (không có header email): trả role "open" = full (giữ nguyên giai đoạn public).
// - Access bật: MẶC ĐỊNH email nào qua được Access = admin (full account). Chỉ email liệt kê
//   trong STAFF_ACCESS với role "staff" mới bị giới hạn theo `staff`.
//
// Sổ tài khoản + phân quyền nhúng TRỰC TIẾP (chắc chắn nhất — không import/fetch).
// Đồng bộ account_to_groups với data/fb-config.json. Chỉ thêm vào STAFF_ACCESS email cần GIỚI HẠN quyền.
const ACCOUNT_TO_GROUPS = {
  "1449385949897024": { name: "CÔNG TY TNHH DOSCOM HOLDINGS - Công nghệ nâng tầm cuộc sống", staff: "DUY", active: true },
  "927390616363424": { name: "Doscom - Công nghệ nâng tầm cuộc sống", staff: "DUY", active: true },
  "1655506672244826": { name: "CÔNG TY TNHH DOSCOM HOLDINGS - Noma Việt Nam", staff: "DUY", active: true },
  "764394829882083": { name: "Doscom - Noma.vn - Giải Pháp Chăm Sóc Xe Hơi Toàn Diện", staff: "PHUONG_NAM", active: true },
  "906015559004892": { name: "Doscom Mart", staff: "PHUONG_NAM", active: true },
  "1416634670476226": { name: "CÔNG TY TNHH DOSCOM HOLDINGS - Doscom Mart", staff: "PHUONG_NAM", active: true },
  "1418124406240173": { name: "DA8.1 mới (PN, chưa chạy)", staff: "PHUONG_NAM", active: true },
};
// Mặc định mọi email (qua được Cloudflare Access) = admin.
// Chỉ liệt kê ở đây những email cần GIỚI HẠN quyền (role "staff").
const STAFF_ACCESS = {
  "tranphuongnam.2010tb@gmail.com": { role: "staff", staff: "PHUONG_NAM" },
};

async function loadConfig(_env) {
  // Dùng thẳng config nhúng làm nguồn quyền (không phụ thuộc KV — tránh KV rỗng ghi đè).
  return { account_to_groups: ACCOUNT_TO_GROUPS, staff_access: STAFF_ACCESS };
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

  // 3) Access bật → tra quyền. MẶC ĐỊNH: không nằm trong STAFF_ACCESS (hoặc role admin) = admin.
  const access = (conf.staff_access || {})[email];
  if (!access || access.role === "admin") {
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
