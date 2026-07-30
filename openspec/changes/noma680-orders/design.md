## Bối cảnh

Landing NOMA 680 nằm ở repo riêng, deploy Pages riêng. Nó KHÔNG gọi thẳng D1 mà đi qua
một Pages Function trung gian của chính nó, function đó mới gọi sang CRM:

```
trình duyệt ──POST /api/order──▶ noma680-landing/functions/api/order.js
                                          │  header X-Noma-Token (secret phía server)
                                          ▼
                            crm-doscom  POST /api/noma680/order ──▶ D1 noma680_orders
```

Lý do một lớp trung gian: trang tĩnh không giữ được bí mật. Nếu trình duyệt gọi thẳng CRM
thì `NOMA680_INGEST_TOKEN` phải nằm trong HTML — ai xem source cũng ghi được đơn giả.

## Quyết định

### 1. Bảng riêng `noma680_orders`, không dùng lại `noma911_orders` hay `landing_leads`

Ba lựa chọn đã cân nhắc:

| Phương án | Vì sao loại / chọn |
|---|---|
| Thêm combo 680 vào `noma911_orders` | **Loại.** `by_combo` của stats 911 sẽ lẫn dòng 680; test `revenue = orders × giá` hiện có sẽ phải biết cả hai bảng giá. Trộn hai dòng sản phẩm vào một bảng là đúng thứ migration 0011 đã cố tránh. |
| Dùng `landing_leads` | **Loại.** Bảng này cố ý không có `combo`/`gift`/`amount`/POS — comment trong 0011 nói rõ. Nhét vào là mất doanh thu theo combo. |
| Bảng mới cùng khuôn 911 | **Chọn.** Thống kê tách bạch, tái dùng được nguyên hình dạng response của stats 911 nên dashboard không phải viết component mới. |

### 2. Token riêng `NOMA680_INGEST_TOKEN`

Không dùng lại `NOMA911_INGEST_TOKEN`. Hai landing hai vòng đời khác nhau; lộ token bên
này không được phép kéo theo bên kia. Đúng red line "endpoint ghi dữ liệu phải có token".

### 3. Giá chốt ở server, bỏ qua `amount` của client

`COMBO_META` nằm trong `order.js`. Client gửi `amount` bao nhiêu cũng bị ghi đè. Đây là
lớp chốt giá thứ hai — lớp thứ nhất đã có bên Pages Function của landing. Hai lớp là cố
ý: nếu sau này có kênh khác gọi thẳng endpoint CRM thì số tiền vẫn đúng.

Bảng giá 680:

| combo | label | amount |
|---|---|---|
| `le-680` | 1 chai NOMA 680 650ml | 99.000 |
| `combo-2x680` | 2 chai NOMA 680 650ml | 198.000 |
| `combo-680-911` | NOMA 680 + NOMA 911 tẩy ố kính | 298.000 |

### 4. Chống ghi trùng bằng unique index, không bằng SELECT trước khi INSERT

`UNIQUE (created_date, phone, combo)` + `INSERT OR IGNORE`. Kiểm tra `meta.changes` để
biết đơn có được ghi hay không, trả `duplicate: true` khi bị bỏ qua — landing vẫn thấy
`ok: true` nên khách không gặp lỗi vì bấm hai lần.

Chọn index thay vì SELECT-rồi-INSERT vì D1 không cho transaction nhiều câu lệnh; hai
request gần nhau vẫn lọt qua khe kiểm tra. Ràng buộc ở tầng schema thì không có khe đó.

Đánh đổi: khách thật sự đặt hai lần cùng một combo trong cùng một ngày sẽ chỉ được ghi
một đơn. Chấp nhận được — trường hợp đó hiếm hơn nhiều so với bấm gửi hai lần, và nhân
viên luôn gọi xác nhận trước khi giao nên số lượng thật vẫn được chốt qua điện thoại.

### 5. Test tự bỏ qua khi endpoint chưa tồn tại

`deploy.yml` chạy `node --test tests/*.mjs` **trước** khi deploy. Test gọi vào
`crm-doscom.pages.dev`, nên ở lần deploy sinh ra endpoint này, endpoint chưa tồn tại →
404 → test đỏ → không bao giờ deploy được. Vòng lặp chết.

Xử lý: gặp 404 thì `t.skip()` kèm thông báo rõ. Từ lần deploy thứ hai trở đi test chạy
đầy đủ. Đây là điểm yếu có ý thức, đã ghi lại ở đây để người sau không tưởng là sót.

## Rủi ro

- **Sai lệch bảng giá giữa ba nơi** (landing HTML, landing Function, CRM). Giảm thiểu:
  test `revenue = orders × giá combo` sẽ báo đỏ nếu CRM lệch; `docs/pricing.md` bên repo
  landing liệt kê đủ bốn chỗ phải sửa khi đổi giá.
- **Chưa có đối soát POS.** Các cột `pos_*` đã có sẵn trong schema nhưng chưa có job nào
  ghi vào, nên khối `actual` của stats sẽ toàn số 0 cho tới khi nối POS. Stats trả 0 chứ
  không bịa — đúng red line "thiếu data thì ghi rõ".
