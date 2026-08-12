# landing-leads — lọc theo thị trường

## ADDED Requirements

### Requirement: Tách lead theo thị trường bằng danh sách mã sản phẩm tường minh

`GET /api/landing-leads` PHẢI nhận tham số `market` với ba giá trị `vn` | `th` | `all`,
mặc định `all`. Việc phân loại PHẢI dựa trên hằng số `TH_PRODUCTS` liệt kê tường minh mã
sản phẩm thuộc thị trường Thái, KHÔNG suy đoán theo hình dạng chuỗi.

Response PHẢI trả kèm trường `market` đúng bằng giá trị đã áp dụng, để giao diện biết chắc
mình đang đọc tập nào thay vì tin vào tham số đã gửi.

#### Scenario: Đọc riêng thị trường Việt Nam

- **WHEN** gọi `GET /api/landing-leads?from=2026-08-01&to=2026-08-31&market=vn`
- **THEN** `by_product[]` KHÔNG chứa dòng nào có `product = 'D1TH'`
- **AND** `by_landing[]` KHÔNG chứa dòng nào có `landing = '/d1th'`
- **AND** `total` bằng đúng tổng `leads` của `by_product[]` trả về

#### Scenario: Đọc riêng thị trường Thái Lan

- **WHEN** gọi `GET /api/landing-leads?market=th`
- **THEN** mọi dòng trong `by_product[]` đều có `product` nằm trong `TH_PRODUCTS`
- **AND** `market` trong response bằng `'th'`

#### Scenario: Hai thị trường cộng lại bằng toàn bộ

- **WHEN** gọi cùng một khoảng ngày với `market=vn`, `market=th` và `market=all`
- **THEN** `total(vn) + total(th) === total(all)`
- **AND** không dòng `by_date` nào bị mất hoặc bị đếm hai lần

#### Scenario: Giá trị market không hợp lệ

- **WHEN** gọi `GET /api/landing-leads?market=xx`
- **THEN** endpoint xử lý như `all` thay vì trả lỗi
- **AND** `market` trong response bằng `'all'` để giao diện biết bộ lọc đã bị bỏ qua

### Requirement: Dashboard Việt Nam không được cộng lead Thái vào dòng tổng

Bảng "Lead theo landing & nhân sự" PHẢI có dòng tổng bằng đúng tổng các dòng đang hiển thị.

#### Scenario: Có lead Thái trong cùng khoảng ngày

- **WHEN** trong khoảng đang lọc có cả lead `/d1cb` (staff `duy`) và lead `/d1th` (staff `th`)
- **THEN** bảng chỉ hiện các dòng thuộc `duy` / `pn`
- **AND** dòng tổng ghi đúng số landing đang hiện và đúng tổng lead của các dòng đó
- **AND** cột `%` của các dòng cộng lại bằng 100%

### Requirement: Menu Thái Lan hiển thị "thiếu dữ liệu" cho chỉ số chưa có nguồn

Màn hình thị trường Thái KHÔNG được suy diễn doanh thu từ số lead.

#### Scenario: Chưa nối tài khoản quảng cáo Thái

- **WHEN** mở menu "Thị trường Thái Lan"
- **THEN** ô Chi phí QC / CPL / ROAS hiện chữ "thiếu dữ liệu" kèm lý do tài khoản quảng cáo
  Thái chưa có trong snapshot `data/*.json`
- **AND** KHÔNG hiện bất kỳ con số doanh thu nào quy đổi từ `số lead × 3.590 ฿`
