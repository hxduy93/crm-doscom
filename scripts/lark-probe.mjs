// Dò Lark Base tại máy — KHÔNG cần deploy, KHÔNG cần qua Cloudflare Access.
// Dùng khi mới nối Base mới: xem app đọc được bảng nào, cột gì, dữ liệu ra sao.
//
// Chạy:
//   LARK_APP_ID=cli_xxx LARK_APP_SECRET=yyy node scripts/lark-probe.mjs <app_token> [table_id]
//
// Trên PowerShell:
//   $env:LARK_APP_ID="cli_xxx"; $env:LARK_APP_SECRET="yyy"
//   node scripts/lark-probe.mjs <app_token> [table_id]
//
// Không truyền table_id → chỉ liệt kê danh sách bảng.
// Có table_id      → in tên cột + 3 bản ghi đầu.
//
// ⚠️ KHÔNG commit app secret vào repo. Chỉ truyền qua biến môi trường.

const API = "https://open.larksuite.com/open-apis";
const [appToken, tableId] = process.argv.slice(2);
const APP_ID = process.env.LARK_APP_ID;
const APP_SECRET = process.env.LARK_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
  console.error("Thiếu env LARK_APP_ID / LARK_APP_SECRET.");
  process.exit(1);
}
if (!appToken) {
  console.error("Thiếu app_token. Lấy ở URL Base: https://xxx.larksuite.com/base/<app_token>?table=<table_id>");
  process.exit(1);
}

async function call(path, token) {
  const r = await fetch(`${API}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const j = await r.json();
  // Lark trả HTTP 200 kể cả khi lỗi — phải soi `code`.
  if (j.code !== 0) throw new Error(`[Lark ${j.code}] ${j.msg}`);
  return j.data || {};
}

const auth = await fetch(`${API}/auth/v3/tenant_access_token/internal`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
}).then((r) => r.json());

if (auth.code !== 0) {
  console.error(`Xác thực hỏng: [${auth.code}] ${auth.msg}`);
  process.exit(1);
}
const token = auth.tenant_access_token;
console.log("✓ Xác thực OK\n");

if (!tableId) {
  const data = await call(`/bitable/v1/apps/${appToken}/tables?page_size=100`, token);
  const items = data.items || [];
  console.log(`Base có ${items.length} bảng:\n`);
  for (const t of items) console.log(`  ${t.table_id}  ${t.name}`);
  console.log("\nChạy lại kèm table_id để xem dữ liệu.");
} else {
  const data = await call(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=3`,
    token
  );
  const items = data.items || [];
  console.log(`Tổng bản ghi: ${data.total} — in ${items.length} dòng đầu\n`);
  if (items.length) {
    console.log("Cột:", Object.keys(items[0].fields || {}).join(" | "), "\n");
    for (const it of items) {
      console.log(`— ${it.record_id}`);
      console.log(JSON.stringify(it.fields, null, 1));
    }
  } else {
    console.log("(bảng rỗng)");
  }
}
