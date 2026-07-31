## Bối cảnh

Landing NOMA 350 đã chạy ở `noma350-landing.pages.dev`. Nó KHÔNG gọi thẳng CRM từ trình
duyệt: form gọi `POST /api/order` là Pages Function của chính landing, function đó mới
chuyển tiếp sang CRM kèm header `X-Noma-Token`. Lý do: trang tĩnh không giữ được bí mật.

```
trình duyệt ──POST /api/order──▶ noma350-landing/functions/api/order.js
                                          │  X-Noma-Token (secret phía server)
                                          ▼
                            crm-doscom  POST /api/noma350/order ──▶ D1 noma350_orders
```

## Quyết định

### 1. Bảng riêng, không dùng chung

Mỗi dòng sản phẩm một bảng: `noma911_orders`, `noma680_orders`, giờ thêm
`noma350_orders`. Đổi lại là ba bảng gần giống nhau, nhưng giữ được `by_combo` của từng
dòng sạch và không phải viết `WHERE product = ?` ở mọi truy vấn thống kê.

Khuôn cột giữ ĐÚNG như `noma680_orders` để `stats.js` chỉ khác đúng tên bảng — dashboard
tái dùng được component sẵn có.

### 2. Token riêng cho từng landing

`NOMA350_INGEST_TOKEN` tách khỏi `NOMA911_INGEST_TOKEN` và `NOMA680_INGEST_TOKEN`. Lộ
token của một landing không được kéo theo landing khác. Token phải set ở **hai đầu**:

| Project Pages | Tên secret |
|---|---|
| `noma350-landing` | `NOMA_INGEST_TOKEN` |
| `crm-doscom` | `NOMA350_INGEST_TOKEN` |

Đổi một bên phải đổi cả hai, nếu không đơn bị 401.

### 3. Chốt giá hai lớp

`amount` client gửi lên **luôn bị bỏ qua**. Function của landing chốt giá lần một,
`COMBO_META` ở đây chốt lần hai. Cố ý làm hai lớp: kênh nào gọi thẳng endpoint này vẫn
ra đúng tiền.

### 4. Chống ghi trùng ở tầng schema, không SELECT-rồi-INSERT

`UNIQUE (created_date, phone, combo)` + `INSERT OR IGNORE`. D1 không có transaction nhiều
câu lệnh, nên hai request gần nhau sẽ lọt qua khe kiểm tra nếu làm SELECT trước rồi
INSERT sau. Đơn trùng trả `{ ok: true, duplicate: true }` — khách bấm hai lần không thấy
lỗi, DB vẫn chỉ một dòng.

### 5. Khối `actual` trả 0 chứ không bịa

Các cột `pos_*` có sẵn trong schema nhưng chưa có job nào ghi. `stats.js` vẫn tính khối
`actual` từ chúng và sẽ ra 0. Trả 0 chứ không suy đoán — red line của dự án.

## Cạm bẫy đã gặp ở 680 — đừng lặp lại

**Cloudflare Pages trả HTML fallback với HTTP 200 cho route chưa tồn tại, không phải 404.**

Hệ quả ở hai chỗ:

1. **Proxy của landing** không được chỉ kiểm `res.ok`. Bản đầu của proxy 680 làm vậy, và
   khi endpoint CRM chưa deploy thì khách thấy màn hình "Đã nhận đơn" trong khi đơn rơi
   mất. Proxy của 350 (kế thừa bản đã sửa) bắt buộc CRM trả **JSON có `ok: true`**.
2. **Bộ test** không thể dựa vào status 404 để biết endpoint đã deploy chưa — phải kiểm
   `content-type`. `deploy.yml` chạy test TRƯỚC khi deploy, nên ở đúng lần deploy sinh ra
   endpoint này nó chưa tồn tại; test phải tự bỏ qua, nếu không là vòng lặp chết.

## Không làm trong change này

- Gắn panel NOMA 350 vào dashboard `index.html` — để dành tới khi có đơn thật để nhìn.
- Job đối soát Pancake POS ghi các cột `pos_*`.
