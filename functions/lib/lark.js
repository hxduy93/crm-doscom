// Lark Base (Bitable) — helper đọc dữ liệu qua Lark Open API.
//
// Bản QUỐC TẾ: open.larksuite.com (KHÔNG phải feishu.cn — bản Trung Quốc).
// Đổi được bằng env LARK_API_BASE nếu sau này chuyển sang Feishu.
//
// Xác thực: tenant_access_token (app nội bộ). Token sống ~2h → cache vào KV
// INVENTORY để không xin token mới mỗi request.
//
// ⚠️ BẪY THƯỜNG GẶP: Lark trả HTTP 200 KỂ CẢ KHI LỖI — lỗi nằm ở field `code`
// trong body (code = 0 mới là thành công). Nên phải soi `code`, không chỉ r.ok.
//
// Env cần có (đặt bằng: npx wrangler pages secret put <TÊN> --project-name crm-doscom):
//   LARK_APP_ID       — App ID của custom app (không bí mật lắm nhưng cứ để secret)
//   LARK_APP_SECRET   — App Secret (BÍ MẬT)
// Env tùy chọn (plaintext, đặt trong wrangler.toml [vars] cũng được):
//   LARK_BASE_TOKEN   — app_token mặc định của Base
//   LARK_TABLE_ID     — table_id mặc định
//   LARK_API_BASE     — override domain API

const DEFAULT_API_BASE = "https://open.larksuite.com/open-apis";
const TOKEN_CACHE_KEY = "lark:tenant_access_token";
const TOKEN_SAFETY_MARGIN = 300;   // xin token mới sớm 5 phút trước khi hết hạn
const MAX_PAGE_SIZE = 500;         // trần Lark cho phép mỗi trang
const MAX_PAGES = 10;              // chặn vòng lặp chạy mãi (10 × 500 = 5000 bản ghi)

function apiBase(env) {
  return (env.LARK_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
}

// Lỗi Lark có mã riêng — giữ lại `code` để chẩn đoán, kèm gợi ý cho mã hay gặp.
export class LarkError extends Error {
  constructor(code, msg, hint) {
    super(hint ? `[Lark ${code}] ${msg} — ${hint}` : `[Lark ${code}] ${msg}`);
    this.name = "LarkError";
    this.code = code;
  }
}

// Mã lỗi hay gặp → câu gợi ý tiếng Việt (đỡ phải tra tài liệu Lark).
function hintFor(code) {
  switch (Number(code)) {
    case 91402:
      return "Không tìm thấy Base. Kiểm tra app_token, và NHỚ thêm app làm cộng tác viên của Base (mở Base → Share → thêm app).";
    case 91403:
    case 1254040:
      return "App không có quyền trên Base này. Cấp scope bitable:app:readonly VÀ thêm app vào Base với quyền đọc.";
    case 1254005:
      return "table_id sai hoặc bảng đã bị xoá.";
    case 99991663:
    case 99991661:
      return "App ID / App Secret sai hoặc app chưa được publish.";
    default:
      return null;
  }
}

// Gọi Lark API + tự bóc lớp vỏ { code, msg, data }.
async function larkFetch(env, path, init = {}, token = null) {
  const headers = { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;

  const r = await fetch(`${apiBase(env)}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20000),
  });

  let body;
  try {
    body = await r.json();
  } catch {
    throw new LarkError(-1, `Lark trả về non-JSON (HTTP ${r.status})`);
  }
  // code != 0 = lỗi, KỂ CẢ khi HTTP 200.
  if (body.code !== 0) {
    throw new LarkError(body.code, body.msg || `HTTP ${r.status}`, hintFor(body.code));
  }
  // Trả NGUYÊN body, không bóc sẵn `data`: endpoint tenant_access_token đặt token
  // ở tầng ngoài cùng (ngang hàng `code`), bóc sẵn là mất token.
  return body;
}

// Lấy tenant_access_token, ưu tiên cache KV. Trả chuỗi token.
export async function getTenantToken(env, kv) {
  if (!env.LARK_APP_ID || !env.LARK_APP_SECRET) {
    throw new Error("Thiếu LARK_APP_ID / LARK_APP_SECRET trên Cloudflare Pages (crm-doscom)");
  }

  try {
    if (kv) {
      const cached = await kv.get(TOKEN_CACHE_KEY);
      if (cached) return cached;
    }
  } catch { /* KV lỗi → cứ xin token mới */ }

  const body = await larkFetch(env, "/auth/v3/tenant_access_token/internal", {
    method: "POST",
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
  });

  // ⚠️ Token nằm ở TẦNG NGOÀI CÙNG (ngang hàng `code`), KHÔNG nằm trong `data`
  // như mọi endpoint khác của Lark.
  const token = body.tenant_access_token;
  const expire = Number(body.expire) || 7200;
  if (!token) throw new Error("Lark không trả tenant_access_token");

  try {
    if (kv) {
      await kv.put(TOKEN_CACHE_KEY, token, {
        expirationTtl: Math.max(60, expire - TOKEN_SAFETY_MARGIN),
      });
    }
  } catch { /* ignore */ }

  return token;
}

// ─── Chuẩn hoá giá trị field ────────────────────────────────────────────────
// 2 endpoint của Lark trả CÙNG một cột theo 2 ĐỊNH DẠNG KHÁC NHAU:
//
//              | GET /records            | POST /records/search
//   số         | "4118543" (chuỗi)       | 4118543 (số)
//   text       | "Tiêu đề"               | [{text:"Tiêu đề",type:"text"}]
//   link video | [{text:"...",...}]      | {type:1,value:[{text:"..."}]}
//   liên kết   | [{text:"Noma Auto",...}]| {link_record_ids:["rec..."]}  ← MẤT tên!
//
// Không chuẩn hoá thì tiêu đề in ra "[object Object]". Dùng chung 2 hàm dưới
// cho cả 2 đường để khỏi phải nhớ đang gọi endpoint nào.

// Mọi dạng text → chuỗi thường (null nếu không có).
export function larkText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    const s = v.map((x) => (x && typeof x === "object" ? x.text || "" : String(x ?? ""))).join("");
    return s || null;
  }
  if (typeof v === "object") {
    if (Array.isArray(v.value)) return larkText(v.value);
    if (v.text) return String(v.text);
  }
  return null;
}

// Mọi dạng số → number (0 nếu không đọc được). Lark hay trả số dưới dạng chuỗi.
export function larkNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(larkText(v) ?? v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Cột liên kết bảng khác → danh sách record_id.
export function larkLinkIds(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap((x) => (x && x.record_ids) || []);
  if (typeof v === "object") {
    if (Array.isArray(v.link_record_ids)) return v.link_record_ids;
    if (Array.isArray(v.record_ids)) return v.record_ids;
  }
  return [];
}

// ─── Che dữ liệu nhạy cảm ───────────────────────────────────────────────────
// Base này có bảng `tiktok_shop_credentials` chứa access_token / app_secret /
// refresh_token / shop_cipher THẬT của TikTok Shop. Endpoint đọc chung
// /api/lark/records có thể trỏ vào bất kỳ bảng nào → nếu không che thì secret
// sẽ chảy ra trình duyệt và log. CRM có Cloudflare Access chắn sẵn, nhưng
// không nên để lộ nhiều lớp phòng thủ chỉ vì một tham số URL.
const SENSITIVE_FIELD_RE = /(token|secret|password|passwd|cipher|credential|api[_-]?key|private[_-]?key)/i;

// Trả bản sao fields với các cột nhạy cảm thay bằng "***". Không sửa vật gốc.
export function redactSensitive(fields) {
  if (!fields || typeof fields !== "object") return fields;
  const out = {};
  let redacted = 0;
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_FIELD_RE.test(k)) {
      out[k] = "***";
      redacted++;
    } else {
      out[k] = v;
    }
  }
  return { fields: out, redacted };
}

// Bóc token từ URL Lark. Chấp nhận cả 2 dạng (dán thẳng URL cho tiện):
//   .../wiki/<node_token>?table=tbl...&view=vew...   → Base nằm trong Wiki
//   .../base/<app_token>?table=tbl...&view=vew...    → Base độc lập
// Trả { kind:"wiki"|"base", token, tableId, viewId } — null nếu không nhận dạng được.
export function parseLarkUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.match(/\/(wiki|base)\/([A-Za-z0-9]+)/);
  if (!m) return null;
  let tableId = null, viewId = null;
  try {
    const q = new URL(raw).searchParams;
    tableId = q.get("table");
    viewId = q.get("view");
  } catch { /* URL không chuẩn → chỉ lấy được token */ }
  return { kind: m[1], token: m[2], tableId, viewId };
}

// Base đặt trong Wiki thì mã trên URL là NODE TOKEN, không phải app_token —
// gọi thẳng bitable sẽ ăn lỗi 91402 NOTEXIST rất khó đoán. Phải đổi qua đây trước.
// Kết quả ổn định nên cache KV 24h.
export async function resolveWikiNode(env, kv, nodeToken) {
  if (!nodeToken) throw new Error("Thiếu wiki node token");
  const cacheKey = `lark:wiki_node:${nodeToken}`;

  try {
    if (kv) {
      const c = await kv.get(cacheKey);
      if (c) return JSON.parse(c);
    }
  } catch { /* ignore */ }

  const token = await getTenantToken(env, kv);
  const body = await larkFetch(
    env,
    `/wiki/v2/spaces/get_node?token=${encodeURIComponent(nodeToken)}&obj_type=wiki`,
    { method: "GET" },
    token
  );
  const node = (body.data || {}).node || {};
  if (node.obj_type !== "bitable") {
    throw new Error(`Node wiki này là "${node.obj_type || "?"}", không phải Base (bitable).`);
  }
  const out = { app_token: node.obj_token, title: node.title || null };

  try {
    if (kv) await kv.put(cacheKey, JSON.stringify(out), { expirationTtl: 86400 });
  } catch { /* ignore */ }

  return out;
}

// Ra app_token cuối cùng từ nhiều kiểu input. Ưu tiên: url > wiki > base.
// Trả { appToken, tableId, viewId, title } (tableId/viewId chỉ có khi truyền url).
export async function resolveAppToken(env, kv, { url, wiki, base } = {}) {
  if (url) {
    const p = parseLarkUrl(url);
    if (!p) throw new Error("URL Lark không hợp lệ — cần dạng .../wiki/<token> hoặc .../base/<token>");
    if (p.kind === "wiki") {
      const n = await resolveWikiNode(env, kv, p.token);
      return { appToken: n.app_token, tableId: p.tableId, viewId: p.viewId, title: n.title };
    }
    return { appToken: p.token, tableId: p.tableId, viewId: p.viewId, title: null };
  }
  if (wiki) {
    const n = await resolveWikiNode(env, kv, wiki);
    return { appToken: n.app_token, tableId: null, viewId: null, title: n.title };
  }
  if (base) return { appToken: base, tableId: null, viewId: null, title: null };
  throw new Error("Thiếu url / wiki / base");
}

// Liệt kê các bảng trong 1 Base — dùng để dò table_id khi mới nối.
// Trả [{ table_id, name, revision }]
export async function listTables(env, kv, appToken) {
  if (!appToken) throw new Error("Thiếu app_token của Base");
  const token = await getTenantToken(env, kv);
  const body = await larkFetch(
    env,
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?page_size=100`,
    { method: "GET" },
    token
  );
  return ((body.data || {}).items || []).map((t) => ({
    table_id: t.table_id,
    name: t.name,
    revision: t.revision,
  }));
}

// Đọc bản ghi có LỌC THEO NGÀY, qua endpoint /records/search (POST).
//
// Vì sao cần: bảng hieu_suat_video ~6.000 dòng, quét hết mất ~24s → Cloudflare
// Pages Function hết giờ. Lọc 14 ngày gần nhất chỉ còn ~700 dòng, chạy ~2s.
// Lọc đặt Ở PHÍA LARK nên không tốn băng thông kéo về rồi mới bỏ.
//
// dateField: tên cột ngày (vd "Ngày dữ liệu"). sinceMs: epoch ms mốc bắt đầu.
// Trả cùng dạng listRecords: { records, total, has_more, pages_fetched }
export async function searchRecordsSince(env, kv, appToken, tableId, dateField, sinceMs, opts = {}) {
  if (!appToken) throw new Error("Thiếu app_token của Base");
  if (!tableId) throw new Error("Thiếu table_id");
  if (!dateField) throw new Error("Thiếu tên cột ngày để lọc");

  const token = await getTenantToken(env, kv);
  const pageSize = Math.min(Number(opts.pageSize) || MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxRecords = Number(opts.maxRecords) || MAX_PAGES * pageSize;

  const payload = {
    filter: {
      conjunction: "and",
      conditions: [{
        field_name: dateField,
        operator: "isGreater",
        value: ["ExactDate", String(Math.floor(sinceMs))],
      }],
    },
  };
  if (Array.isArray(opts.fieldNames) && opts.fieldNames.length) {
    payload.field_names = opts.fieldNames;
  }

  const records = [];
  let pageToken = null, hasMore = false, pages = 0, total = 0;

  do {
    const qs = new URLSearchParams({ page_size: String(pageSize) });
    if (pageToken) qs.set("page_token", pageToken);

    const body = await larkFetch(
      env,
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search?${qs}`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    );
    const data = body.data || {};

    for (const it of data.items || []) {
      records.push({ record_id: it.record_id, fields: it.fields || {} });
    }
    total = Number(data.total) || records.length;
    pageToken = data.page_token || null;
    hasMore = Boolean(data.has_more);
    pages++;

    if (!hasMore || records.length >= maxRecords || pages >= MAX_PAGES) break;
  } while (pageToken);

  return {
    records: records.slice(0, maxRecords),
    total,
    has_more: hasMore || records.length > maxRecords,
    pages_fetched: pages,
  };
}

// Đọc bản ghi 1 bảng. Tự lật trang tới khi hết HOẶC chạm trần.
//
// opts: { pageSize, maxRecords, viewId, fieldNames[], filter }
// Trả { records:[{record_id, fields}], total, has_more, pages_fetched }
export async function listRecords(env, kv, appToken, tableId, opts = {}) {
  if (!appToken) throw new Error("Thiếu app_token của Base");
  if (!tableId) throw new Error("Thiếu table_id");

  const token = await getTenantToken(env, kv);
  const pageSize = Math.min(Number(opts.pageSize) || MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxRecords = Number(opts.maxRecords) || MAX_PAGES * pageSize;

  const records = [];
  let pageToken = null;
  let hasMore = false;
  let pages = 0;
  let total = 0;

  do {
    const qs = new URLSearchParams({ page_size: String(pageSize) });
    if (pageToken) qs.set("page_token", pageToken);
    if (opts.viewId) qs.set("view_id", opts.viewId);
    if (Array.isArray(opts.fieldNames) && opts.fieldNames.length) {
      qs.set("field_names", JSON.stringify(opts.fieldNames));
    }
    if (opts.filter) qs.set("filter", opts.filter);

    const body = await larkFetch(
      env,
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?${qs}`,
      { method: "GET" },
      token
    );
    const data = body.data || {};

    for (const it of data.items || []) {
      records.push({ record_id: it.record_id, fields: it.fields || {} });
    }
    total = Number(data.total) || records.length;
    pageToken = data.page_token || null;
    hasMore = Boolean(data.has_more);
    pages++;

    // Dừng khi: hết trang / đủ số bản ghi cần / chạm trần số trang.
    if (!hasMore || records.length >= maxRecords || pages >= MAX_PAGES) break;
  } while (pageToken);

  return {
    records: records.slice(0, maxRecords),
    total,
    // Còn dữ liệu chưa lấy hết — do Lark còn trang HOẶC do mình tự dừng ở trần.
    has_more: hasMore || records.length > maxRecords,
    pages_fetched: pages,
  };
}
