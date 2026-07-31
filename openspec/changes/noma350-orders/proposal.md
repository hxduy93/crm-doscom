## Why

Doscom đang chạy landing bán **NOMA 350 — dung dịch vệ sinh phanh đĩa** (repo riêng
`hxduy93/noma350-landing`, đã deploy tại `noma350-landing.pages.dev`). Landing bán theo
**combo có giá và quà tặng kèm**, đúng mô hình NOMA 911 / NOMA 680 — không giống các
landing D1/DR1 vốn chỉ thu lead rồi đẩy Pancake.

Hiện CRM chưa có chỗ nhận đơn 350, nên `POST /api/order` của landing trả `502
crm_rejected` và **khách không gửi được đơn nào**. Landing đang public nhưng chưa bán
được.

Vì sao không tái dùng endpoint có sẵn:

- `POST /api/noma911/order` và `POST /api/noma680/order` gắn cứng `COMBO_META` của dòng
  sản phẩm đó. Đẩy đơn 350 vào sẽ trả `missing_combo`; còn nếu thêm combo 350 vào bảng
  đó thì thống kê combo của 911/680 đang chạy bị trộn ba dòng sản phẩm.
- Bảng `landing_leads` (migration 0011) **cố ý** không có `combo`/`gift`/`amount` và
  không có cột đối soát POS — nó dành cho landing không bán combo. Nhét 350 vào đây là
  mất doanh thu theo combo và mất khả năng đối soát POS.

## What Changes

- **Bảng D1 mới `noma350_orders`** (`migrations/0014_noma350_orders.sql`) — cùng khuôn
  `noma680_orders` (staff, combo, combo_label, gift, name, note, amount, POS matching),
  kèm **unique index chống ghi trùng** `(created_date, phone, combo)` để khách bấm gửi
  hai lần không thành hai đơn, không thổi doanh thu.
- **`POST /api/noma350/order`** — nhận đơn từ landing, bảo vệ bằng header `X-Noma-Token`
  khớp `env.NOMA350_INGEST_TOKEN` (token RIÊNG, không dùng chung với 911/680: lộ token
  của landing này không kéo theo landing kia). Server tự tra `COMBO_META` để chốt
  `combo_label` + `amount`, **bỏ qua số tiền client gửi lên**.
- **`GET /api/noma350/stats`** — thống kê, giữ ĐÚNG hình dạng response của
  `/api/noma680/stats` để dashboard tái dùng component sẵn có.
- **`tests/noma350.test.mjs`** — bốn luật y hệt bộ test 680: contract, luật tiền
  (doanh thu = số đơn × đúng giá), luật toàn vẹn (tổng = cộng các combo), và chống trộn
  combo của dòng sản phẩm khác.

## Bảng giá (nguồn sự thật thứ ba)

| Mã combo | Nhãn | Giá |
|---|---|---|
| `le-350` | 1 chai NOMA 350 vệ sinh phanh đĩa | 159.000đ |
| `combo-2x350` | 2 chai NOMA 350 vệ sinh phanh đĩa | 318.000đ |
| `combo-350-911` | NOMA 350 + NOMA 911 tẩy ố kính | 378.000đ |
| `combo-350-922` | NOMA 350 + NOMA 922 phủ nano kính | 378.000đ |

Giá phải khớp cả ba nơi: `public/index.html` (`window.NOMA350.pricing`) và
`functions/api/order.js` bên repo landing, và `COMBO_META` ở đây. Lệch một nơi là
`tests/noma350.test.mjs` báo đỏ.

## Breaking change

**Không.** Chỉ thêm bảng mới, thư mục endpoint mới và file test mới. Không đụng vào
`noma911_orders`, `noma680_orders`, `landing_leads` hay bất kỳ endpoint đang chạy nào.

## Agent bị ảnh hưởng

Không có. Dashboard `index.html` chưa gắn panel 350 — để dành tới khi có đơn thật để nhìn,
giống cách 680 đang làm.
