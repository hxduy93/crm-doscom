## Why

Doscom sắp chạy landing bán **NOMA 680 — bọt tuyết vệ sinh đa năng 650ml** (repo riêng
`hxduy93/noma680-landing`, deploy Cloudflare Pages). Landing bán theo **combo có giá và
quà tặng kèm**, giống hệt mô hình NOMA 911 — không giống các landing D1/DR1 vốn chỉ thu
lead rồi đẩy Pancake.

Hiện CRM chưa có chỗ nhận đơn 680:

- `POST /api/noma911/order` gắn cứng `COMBO_META` của 911 (`le-911`, `combo-911-310`…).
  Đẩy đơn 680 vào đó sẽ trả `missing_combo`, và nếu thêm combo 680 vào bảng đó thì mọi
  thống kê combo 911 đang chạy bị trộn hai dòng sản phẩm.
- Bảng `landing_leads` (migration 0011) **cố ý** không có `combo`/`gift`/`amount` và không
  có cột đối soát POS — nó dành cho landing không bán combo. Nhét 680 vào đây là mất
  doanh thu theo combo và mất khả năng đối soát POS.

Không có endpoint thì landing không lưu được đơn nào, và Duy / Phương Nam không đo được
doanh số 680 trên dashboard.

## What Changes

- **Bảng D1 mới `noma680_orders`** (`migrations/0013_noma680_orders.sql`) — cùng khuôn
  `noma911_orders` (staff, combo, combo_label, gift, amount, POS matching) cộng thêm hai
  cột `name` và `note` mà form 680 có thu còn form 911 thì không.
  Thêm **unique index chống ghi trùng** `(created_date, phone, combo)` — bài học từ
  migration 0011 — để khách bấm gửi hai lần không thành hai đơn, không thổi doanh thu.
- **`POST /api/noma680/order`** — nhận đơn từ landing, bảo vệ bằng header `X-Noma-Token`
  khớp `env.NOMA680_INGEST_TOKEN` (token RIÊNG, không dùng chung với 911: lộ token của
  landing này không kéo theo landing kia). Server tự tra `COMBO_META` để chốt
  `combo_label` + `amount`, **bỏ qua số tiền client gửi lên**.
- **`GET /api/noma680/stats`** — cùng hình dạng response với `/api/noma911/stats`
  (`range`, `summary`, `by_combo`, `by_staff`, `by_gift`, `by_source`, `by_date`, `actual`)
  để dashboard tái dùng được component sẵn có, không phải viết UI mới.
- **`tests/noma680.test.mjs`** — ba luật: contract, `revenue = orders × giá combo`,
  `summary.revenue = tổng by_combo`. Test tự bỏ qua khi endpoint chưa deploy lần đầu
  (tránh khoá chính lần deploy sinh ra nó).

**Breaking change: Không.** Không đụng file nào của `noma911-orders`, `landing_leads` hay
agent khác. Chỉ thêm thư mục `functions/api/noma680/`, một migration mới và một file test.

## Capabilities

### New Capabilities
- `noma680-orders`: thu và thống kê đơn đăng ký từ landing NOMA 680 (bảng `noma680_orders`,
  endpoint order + stats), tách hẳn khỏi `noma911-orders` để thống kê combo hai dòng sản
  phẩm không trộn vào nhau.

### Modified Capabilities
<!-- Không capability nào đổi requirement. noma911-orders giữ nguyên; landing_leads giữ nguyên. -->

## Impact

- **Code:** mới `functions/api/noma680/order.js`, `functions/api/noma680/stats.js`,
  `migrations/0013_noma680_orders.sql`, `tests/noma680.test.mjs`.
- **Env/secret (Cloudflare Pages, KHÔNG hard-code):** `NOMA680_INGEST_TOKEN` — set qua
  `npx wrangler pages secret put NOMA680_INGEST_TOKEN --project-name crm-doscom`.
  Giá trị phải khớp `NOMA_INGEST_TOKEN` bên project `noma680-landing`.
- **Bên ngoài:** landing gọi qua Pages Function trung gian của chính nó
  (`noma680-landing/functions/api/order.js`) chứ không gọi thẳng từ trình duyệt — token
  không lộ ra client. Vẫn giữ `onRequestOptions` cho CORS phòng khi cần gọi trực tiếp.
- **Deploy:** `deploy.yml` đã tự áp migration D1 trước khi deploy và tự bundle `functions/`
  từ gốc repo — không cần sửa workflow.
- **Dashboard:** chưa gắn panel 680 vào `index.html` trong change này. Endpoint stats đã
  sẵn sàng để làm việc đó ở một change sau, khi đã có đơn thật để nhìn.
