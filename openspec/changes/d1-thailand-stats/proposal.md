## Why

Doscom vừa mở thị trường **Thái Lan** với landing `https://noma955.click` (bản tiếng Thái
của máy dò D1, giá 3.590 ฿). Landing này ghi lead vào **cùng bảng `landing_leads`** của
CRM, với `product='D1TH'`, `staff='th'`, `landing='/d1th'`.

Dùng chung bảng là cố ý — để CRM đếm được lead Thái mà không phải dựng thêm hạ tầng.
Nhưng dùng chung mà **không tách khi đọc** thì sinh hai vấn đề:

**1. Bảng "Lead theo landing & nhân sự" của Việt Nam đang cộng nhầm lead Thái.**

`/api/landing-leads` trả về MỌI dòng, không lọc `product`. Trong `renderLeadLanding()`:

- Vòng lặp vẽ chỉ chạy `['duy','pn']` → dòng `/d1th` (staff `th`) **không hiện ra**.
- Nhưng `grand`, `tot` và `items.length` tính trên **toàn bộ** `items`, gồm cả Thái.

Hậu quả: dòng tổng ghi *"Tổng N landing"* với N và số lead **lớn hơn tổng các dòng nhìn
thấy**, cột `%` cũng lệch vì mẫu số phồng. Người đọc thấy tổng không khớp phép cộng tay
mà không hiểu vì sao.

Hai chỗ KHÁC thì **không** bị ảnh hưởng, đã kiểm chứng — ghi ra đây để lần sau khỏi sửa nhầm:
- `fillStaffLeads()`: có gom `by['th']` nhưng chỉ đổ vào các ô `td[data-lead]` (`duy`/`pn`),
  và `tot` cộng trong chính vòng lặp đó → lead Thái rơi ra ngoài, KPI lead không sai.
- Bảng "Đơn đăng ký landing sản phẩm" đọc endpoint `noma911/680/350/230`, không đụng bảng này.

**2. Không có chỗ nào đọc riêng số Thái.**

Chủ dự án cần theo dõi hiệu quả thị trường Thái tách bạch, và yêu cầu rõ là **không được
để lẫn với số Việt Nam** vì dễ đọc nhầm khi quyết định tăng/giảm ngân sách.

## What Changes

- **`GET /api/landing-leads` thêm tham số `market`** (`vn` | `th` | `all`).
  Phân loại theo **danh sách mã sản phẩm tường minh** `TH_PRODUCTS = {'D1TH'}` trong
  `functions/api/landing-leads.js`, KHÔNG suy đoán theo hậu tố tên (`*TH`) — mã sản phẩm
  Việt hoàn toàn có thể kết thúc bằng "TH" và sẽ bị xếp nhầm thị trường trong im lặng.
  Thêm sản phẩm Thái mới thì thêm mã vào đúng một chỗ đó.

  **Mặc định giữ `all`** để không đổi hợp đồng cũ (non-breaking); hai nơi gọi đều truyền
  tường minh — dashboard VN gọi `market=vn`, menu Thái gọi `market=th`.

- **Response thêm `market` và `by_product` giữ nguyên hình dạng** — frontend hiện có
  không phải sửa gì ngoài việc thêm query param.

- **Dashboard VN: `fetch('/api/landing-leads?...&market=vn')`** → dòng tổng và cột `%`
  của bảng "Lead theo landing & nhân sự" hết lệch.

- **Menu mới "Thị trường Thái Lan"** trong sidebar, view `view-thailand`:
  KPI tổng lead · số ngày có lead · trung bình lead/ngày · ngày cao nhất; bảng lead theo
  ngày; bảng theo landing. Có **dải cảnh báo cố định** nói rõ đây là số liệu tách riêng,
  không cộng vào bảng Việt Nam.

  Phần chi phí quảng cáo / CPL / ROAS **hiển thị "thiếu dữ liệu"** kèm lý do: tài khoản
  quảng cáo Thái chưa nối vào pipeline `data/*.json` (snapshot FB/Windsor hiện chỉ có các
  tài khoản Việt Nam). Theo RED LINE "KHÔNG bịa số liệu" — không quy đổi lead × 3.590 ฿
  thành doanh thu, vì lead chưa phải đơn chốt.

- **`tests/landing-leads-market.test.mjs`** — canh 3 luật: `market=vn` không chứa `D1TH`;
  `market=th` chỉ chứa `D1TH`; `vn + th = all` (không mất dòng, không đếm đôi).

**Breaking change: Không.** Mặc định `market=all` giữ nguyên hành vi cũ. Không đụng
`noma911-orders`, `agent-geo`, `agent-fb-ai`, `agent-google-ai` hay schema D1
(không thêm cột, không migration mới).

---

## Bổ sung 12/08/2026 — tách CHI PHÍ QUẢNG CÁO theo thị trường

Phần trên mới tách *lead*. Chi phí quảng cáo vẫn gộp: campaign chạy Thái nằm chung tài
khoản quảng cáo Việt Nam nên tiền của nó vẫn cộng vào chi phí Doscom VN, làm lợi nhuận
Việt Nam hụt giả trong khi doanh thu Thái không nằm cùng chỗ.

**Nhận diện:** `detect_market(campaign_name)` trong `scripts/build_dashboard_data.py`,
khớp nguyên cụm `thailan` / `thailand` trên tên đã bỏ dấu và bỏ khoảng trắng.

**TUYỆT ĐỐI KHÔNG bắt mỗi chữ "thai".** Tài khoản đang chạy có sẵn 4 campaign Việt Nam:

```
Doscom-Nomavietnam-Noma911-15/7-Phương Nam-Thaivu
5/6 - Noma911 - Thái Vũ BlackBi
16/7 - Noma911 - Thái Vũ Blackbi
4/8 - Noma911 - Thái Vũ BlackBi
```

"Thái Vũ" là TÊN NGƯỜI. Bắt theo "thai" thì bốn campaign này bị đẩy sang thị trường Thái
và chi tiêu của chúng biến mất khỏi dashboard Việt Nam trong im lặng. Tương tự "Thái
Nguyên" / "Thái Bình" khi đặt tên campaign target theo tỉnh.

**Chỗ tiền được trừ ra:**

| Nơi | Cách xử lý |
|---|---|
| `ad_spend_by_staff` | campaign Thái không vào rổ nhân sự nào |
| `ad_spend_excluded` | campaign Thái KHÔNG rơi vào đây kể cả khi không đoán được SP |
| `products[]` (D1/Noma911/DR1) | bỏ qua campaign Thái |
| `google_ads.by_category` | trừ ngược từ `campaigns_raw` |
| `accounts[].daily` | **GIỮ NGUYÊN số thô** để khớp Trình quản lý quảng cáo; giao diện trừ ở chỗ dùng (`fbSpend`, `fbRegs`, bảng lợi nhuận tháng) |
| mới: `ad_spend_thailand` | `{_total, by_date, by_product{}, campaigns[]}` |

Giữ `accounts[].daily` thô là quyết định có chủ ý: agent Facebook và người đối chiếu vẫn
cần một con số bằng đúng Ads Manager. Sửa số thô ở tầng build thì không còn chỗ nào đối
chiếu được nữa.

Campaign Thái không đoán ra sản phẩm vẫn giữ tiền dưới nhãn `(chưa rõ SP)` — không bỏ im lặng.

**Menu Thái** hiện thêm Chi phí QC (VNĐ) và CPL. Đơn vị **VNĐ** chứ không phải ฿ vì
campaign chạy trên tài khoản quảng cáo Việt Nam, Facebook xuất hoá đơn VNĐ. Doanh thu /
ROAS vẫn "thiếu dữ liệu".

**`tests/campaign-market-thailand.test.mjs`** gọi thẳng hàm Python thật (không chép logic
sang JS — chép là hai bản luật, sửa một bên quên bên kia thì test vẫn xanh) và canh đúng
4 tên campaign "Thái Vũ" thật.
