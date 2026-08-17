## ADDED Requirements

### Requirement: Tạo yêu cầu cập nhật từ giao diện

Hệ thống PHẢI cho phép người dùng tạo một yêu cầu cập nhật dữ liệu qua
`POST /api/refresh/request`, và PHẢI trả lời ngay lập tức chứ không chờ pipeline chạy
xong. Endpoint PHẢI trả về khuôn `{ ok, data }` theo quy ước cho agent mới.

#### Scenario: Bấm nút khi không có job nào đang chạy

- **WHEN** người dùng gọi `POST /api/refresh/request` và trong `refresh_jobs` không có
  job nào ở trạng thái `pending` hoặc `running`
- **THEN** hệ thống tạo một job mới trạng thái `pending`, ghi thời điểm tạo theo giờ VN,
  và trả `{ ok: true, data: { job_id, status: "pending", already_running: false } }`

#### Scenario: Bấm nút khi đã có job đang chạy

- **WHEN** người dùng gọi `POST /api/refresh/request` mà đang có job `pending` hoặc
  `running` tạo chưa quá 90 phút
- **THEN** hệ thống KHÔNG tạo job mới, trả `HTTP 200` với
  `{ ok: true, data: { job_id: <job đang chạy>, status, already_running: true } }`
- **AND** giao diện hiển thị tiến độ của job đang chạy thay vì báo lỗi

#### Scenario: Job cũ bị treo quá 90 phút

- **WHEN** job gần nhất ở trạng thái `running` nhưng `started_at` đã quá 90 phút
- **THEN** hệ thống đánh dấu job đó là `stale` và tạo job mới bình thường

### Requirement: Runner nhận việc qua endpoint có token

Endpoint phát việc `GET /api/refresh/next` PHẢI yêu cầu header `X-Refresh-Token` khớp
`env.REFRESH_RUNNER_TOKEN`. Token KHÔNG được hard-code trong mã nguồn.

#### Scenario: Runner hỏi việc với token đúng, có job chờ

- **WHEN** runner gọi `GET /api/refresh/next` với `X-Refresh-Token` đúng và có job
  `pending`
- **THEN** hệ thống chuyển job sang `running`, ghi `started_at`, và trả
  `{ ok: true, data: { job_id, steps: [<danh sách 8 bước cố định>] } }`

#### Scenario: Runner hỏi việc với token đúng, không có job

- **WHEN** runner gọi `GET /api/refresh/next` với token đúng và không có job `pending`
- **THEN** hệ thống trả `{ ok: true, data: null }` và ghi nhận thời điểm runner hỏi thăm
  gần nhất để giao diện biết runner còn sống

#### Scenario: Gọi với token sai hoặc thiếu token

- **WHEN** một lời gọi tới `GET /api/refresh/next` hoặc `POST /api/refresh/report` có
  `X-Refresh-Token` sai hoặc không có header đó
- **THEN** hệ thống trả `HTTP 401` với `{ ok: false, error }` và KHÔNG tiết lộ có job
  đang chờ hay không

### Requirement: Runner báo tiến độ theo từng bước

Hệ thống PHẢI nhận báo cáo tiến độ qua `POST /api/refresh/report` với
`{ job_id, step, step_index, status, message }`, mỗi bước một lần.

#### Scenario: Báo một bước chạy xong

- **WHEN** runner gửi báo cáo `status: "ok"` cho bước thứ N
- **THEN** hệ thống cập nhật `current_step = N` và `current_step_name` của job, giữ
  trạng thái job là `running`

#### Scenario: Một bước lỗi

- **WHEN** runner gửi báo cáo `status: "failed"` cho một bước
- **THEN** hệ thống đặt job sang `failed`, lưu tên bước lỗi và tối đa 2000 ký tự cuối của
  log lỗi, ghi `finished_at`
- **AND** các bước còn lại KHÔNG được chạy và KHÔNG được deploy

#### Scenario: Pipeline xong toàn bộ

- **WHEN** runner gửi báo cáo bước cuối cùng (deploy) với `status: "ok"`
- **THEN** hệ thống đặt job sang `done`, ghi `finished_at` và số cảnh báo `warnings` mà
  runner đếm được

### Requirement: Giao diện hiển thị trạng thái và cảnh báo dữ liệu cũ

Giao diện CRM PHẢI cho người dùng biết dữ liệu đang xem tươi tới lúc nào, và PHẢI cảnh
báo rõ khi snapshot quá cũ. Hệ thống KHÔNG được hiển thị số cũ như thể là số mới.

#### Scenario: Dữ liệu còn mới

- **WHEN** `generated_at` của `data/dashboard-data.json` cách hiện tại dưới 24 giờ
- **THEN** giao diện hiện "Cập nhật lúc HH:MM ngày DD/MM" ở trạng thái bình thường

#### Scenario: Dữ liệu cũ từ 24 đến 72 giờ

- **WHEN** `generated_at` cách hiện tại từ 24 đến 72 giờ
- **THEN** giao diện hiện cảnh báo màu vàng kèm số giờ đã cũ

#### Scenario: Dữ liệu cũ quá 72 giờ

- **WHEN** `generated_at` cách hiện tại quá 72 giờ
- **THEN** giao diện hiện cảnh báo màu đỏ kèm số ngày đã cũ và câu "số trên trang không
  phản ánh hiện tại"

#### Scenario: Runner không chạy

- **WHEN** lần hỏi thăm gần nhất của runner cách hiện tại quá 5 phút
- **THEN** nút "Cập nhật dữ liệu" chuyển sang trạng thái báo runner chưa chạy, thay vì
  cho bấm rồi chờ vô hạn

### Requirement: Kiểm chứng đường đẩy đơn của landing Noma

Pipeline PHẢI có một bước kiểm tra 5 landing Noma (911, 120, 230, 350, 680). Bước này
KHÔNG lấy dữ liệu về — đơn landing đã nằm sẵn trong D1 của CRM — mà xác minh đường đẩy
đơn còn sống, vì lỗi lệch token làm đơn ngừng về mà giao diện vẫn hiện số cũ.

#### Scenario: Cả 5 landing đều có đơn gần đây

- **WHEN** bước kiểm landing gọi `/api/nomaXXX/stats` cho cả 5 landing và landing nào
  cũng có đơn trong 48 giờ gần nhất
- **THEN** bước báo `ok` kèm mốc đơn gần nhất của từng landing

#### Scenario: Một landing im lặng bất thường

- **WHEN** một landing không có đơn nào trong 48 giờ trong khi các landing khác vẫn có
- **THEN** bước vẫn báo `ok` nhưng cộng vào `warnings` và ghi rõ tên landing im lặng
- **AND** giao diện hiện cảnh báo nêu đích danh landing đó cùng gợi ý kiểm token
  `NOMA911_INGEST_TOKEN` của landing

#### Scenario: Endpoint stats của một landing lỗi

- **WHEN** `/api/nomaXXX/stats` trả mã lỗi hoặc không phải JSON hợp lệ
- **THEN** bước cộng vào `warnings` kèm tên landing và mã lỗi, KHÔNG làm hỏng cả pipeline

### Requirement: Cổng chất lượng trước khi deploy

Runner PHẢI chạy `node --test tests/*.mjs` trước bước deploy và PHẢI dừng nếu có test đỏ.

#### Scenario: Test đỏ

- **WHEN** bước chạy test kết thúc với mã thoát khác 0
- **THEN** runner báo `failed` cho bước đó và KHÔNG chạy `wrangler pages deploy`
- **AND** dữ liệu đã lấy về vẫn nằm ở máy để soát, KHÔNG bị đẩy lên web

#### Scenario: Bước lấy dữ liệu có cảnh báo nhưng không lỗi

- **WHEN** `build_dashboard_data.py` bỏ qua một tài khoản quảng cáo do API bên thứ ba trả
  lỗi, nhưng vẫn kết thúc với mã thoát 0
- **THEN** runner đếm số dòng cảnh báo, gửi kèm báo cáo, và pipeline vẫn chạy tiếp
- **AND** giao diện hiện "cập nhật xong, có N cảnh báo" chứ không báo thành công trơn tru
