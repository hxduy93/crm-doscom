## Vì sao lọc ở API chứ không lọc ở giao diện

Cách rẻ nhất là để `renderLeadLanding()` tự bỏ qua dòng `staff === 'th'` khi tính `grand`
và `tot`. Không chọn cách đó vì:

- Bộ lọc nằm trong một hàm vẽ bảng thì **chỉ đúng cho bảng đó**. Endpoint vẫn trả dữ liệu
  trộn, nên bảng thứ hai bất kỳ ai thêm sau này lại dính đúng cái bẫy cũ. Lỗi ban đầu sinh
  ra chính vì kiểu "chỗ này lọc, chỗ kia quên".
- Lọc ở SQL còn giảm dữ liệu truyền, và tách được cả `by_date` — thứ giao diện không lọc
  lại được vì chỉ còn tổng theo ngày, đã mất mã sản phẩm.

## Vì sao phân loại bằng danh sách mã, không bằng cột `market` mới

Thêm cột `market` vào `landing_leads` là mô hình sạch hơn về lâu dài, nhưng:

- Phải viết migration + backfill toàn bộ dòng cũ, và mọi landing đang chạy (D1, DR1, D1
  Thái) phải sửa để ghi thêm cột — bốn repo, bốn lần deploy, chỉ để phục vụ một màn hình.
- Đúng một sản phẩm Thái đang tồn tại. Khi nào có 3-4 sản phẩm thì cột riêng mới đáng.

Hằng số `TH_PRODUCTS` đặt ngay cạnh hàm lọc, có chú thích nói rõ thêm sản phẩm Thái thì
sửa ở đâu. Đổi sang cột thật sau này chỉ cần thay thân `marketFilter()`.

## Vì sao mặc định `all` chứ không `vn`

Đặt mặc định `vn` sẽ tự sửa lỗi cộng nhầm mà không phải đụng frontend — hấp dẫn nhưng
**âm thầm đổi hợp đồng của một endpoint đang chạy**. Ai gọi thẳng endpoint (cURL, script
đối soát, tab trình duyệt đã lưu) sẽ nhận tập dữ liệu khác trước mà không có dấu hiệu gì.

Giữ `all`, bắt cả hai nơi gọi ghi rõ `market` của mình. Đọc code là biết ngay màn hình đó
đang xem thị trường nào, không phải nhớ mặc định là gì. Bù lại response trả kèm `market`
để giao diện xác nhận bộ lọc đã được nhận.

## Vì sao màn hình Thái không có doanh thu / ROAS

`landing_leads` không có cột tiền — bảng này sinh ra để đếm lead, không phải ghi đơn.
Số duy nhất có thể bịa ra là `số lead × 3.590 ฿`, và nó **sai về bản chất**: lead là người
để lại số điện thoại, chưa phải người chốt đơn. Tài khoản quảng cáo Thái cũng chưa nằm
trong snapshot `data/*.json` nên không có chi phí để tính CPL/ROAS.

Theo RED LINE "KHÔNG bịa số liệu; thiếu data thì ghi rõ", ô đó hiện chữ "thiếu dữ liệu"
kèm lý do. Khi nào nối được tài khoản QC Thái vào pipeline thì thay ô này.

## Bất biến phải giữ

`total(vn) + total(th) === total(all)` với mọi khoảng ngày. Đây là thứ khiến người đọc tin
được rằng tách thị trường không làm mất lead nào. `tests/landing-leads-market.test.mjs`
canh bất biến này, gồm cả trường hợp `product` rỗng — SQL `NULL NOT IN (...)` trả NULL nên
nếu không có vế `product IS NULL OR` thì dòng đó rơi khỏi cả hai thị trường.
