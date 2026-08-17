## 1. Nền tảng dữ liệu

- [x] 1.1 Viết `migrations/0018_refresh_jobs.sql`: bảng `refresh_jobs` gồm `id`,
      `status` (pending/running/done/failed/stale), `created_at`, `started_at`,
      `finished_at`, `current_step`, `current_step_name`, `warnings`, `error_step`,
      `error_log`, `runner_seen_at`; index trên `status` và `created_at`.
- [x] 1.2 Áp migration bằng `wrangler d1 migrations apply crm-doscom-db --remote`.
      KHÔNG dùng `d1 execute --file` (làm kẹt pipeline migration vĩnh viễn dù deploy
      vẫn báo xanh).
- [x] 1.3 Sinh `REFRESH_RUNNER_TOKEN`, đặt làm Pages secret và thêm vào
      `.dev.vars.refresh` ở máy chạy runner. Chạy `git check-ignore -v .dev.vars.refresh`
      xác nhận file bị ignore trước khi ghi token vào (repo PUBLIC).

## 2. Endpoint phía CRM

- [x] 2.1 `functions/api/refresh/request.js` — `onRequestPost`: chặn tạo trùng khi có job
      pending/running, xử lý job treo > 90 phút thành `stale`, trả `{ ok, data }`.
- [x] 2.2 `functions/api/refresh/next.js` — `onRequestGet`: kiểm `X-Refresh-Token`, phát
      job pending và chuyển sang `running`, cập nhật `runner_seen_at` kể cả khi không có
      job.
- [x] 2.3 `functions/api/refresh/report.js` — `onRequestPost`: kiểm token, cập nhật bước
      hiện tại / `failed` (kèm 2000 ký tự log cuối) / `done` (kèm `warnings`).
- [x] 2.4 `functions/api/refresh/status.js` — `onRequestGet`: trả job gần nhất +
      `runner_seen_at` cho UI, không cần token.

## 3. Runner ở máy vận hành

- [x] 3.1 `runner/refresh-runner.ps1`: vòng lặp poll 60 giây, nạp key từ
      `.dev.vars.refresh`, gọi `/api/refresh/next`.
- [x] 3.2 Chạy tuần tự 8 bước pipeline theo đúng thứ tự CI; mỗi bước xong gọi
      `/api/refresh/report`; bước lỗi thì dừng và không chạy bước sau.
- [x] 3.3 Cổng chất lượng: chạy `node --test tests/*.mjs`, đỏ thì dừng, tuyệt đối không
      deploy.
- [x] 3.4 Bước cuối: `bash scripts/build-dist.sh` rồi
      `wrangler pages deploy dist --project-name=crm-doscom --branch=master`.
- [x] 3.5 Đếm số dòng `⚠ SKIP` trong log của bước 8 và gửi vào `warnings`.
- [x] 3.8 Bước kiểm landing Noma: gọi `/api/nomaXXX/stats` cho 5 landing (911, 120, 230,
      350, 680), lấy mốc đơn gần nhất, cảnh báo landing nào không có đơn trong 48 giờ
      hoặc stats lỗi. Không làm hỏng pipeline, chỉ cộng `warnings`.
- [x] 3.6 Ghi log đầy đủ ra `runner/logs/YYYY-MM-DD.log`, giữ 14 ngày gần nhất.
- [x] 3.7 Viết `runner/README.md`: cách cài chạy nền bằng Task Scheduler, cách xem log,
      cách đổi token. Mọi lệnh PowerShell trong tài liệu có `.\` ở đầu file trong thư mục
      hiện tại và `cd` đường dẫn tuyệt đối.

## 4. Giao diện

- [x] 4.1 Thêm nút "Cập nhật dữ liệu" + ô trạng thái vào thanh trên cùng trang Tổng quan
      Dashboard trong `index.html`, đặt cạnh `#fresh` (ô "cập nhật <giờ>").
- [x] 4.2 Hiện tiến độ "đang chạy bước N/8 — <tên bước>", poll `/api/refresh/status` mỗi
      15 giây khi có job đang chạy.
- [x] 4.3 Cảnh báo snapshot cũ theo 3 mức (dưới 24h / 24–72h / trên 72h) đọc từ
      `generated_at` của `dashboard-data.json`.
- [x] 4.4 Khi `runner_seen_at` quá 5 phút: nút đổi sang trạng thái báo runner chưa chạy.

## 5. Kiểm thử và bàn giao

- [x] 5.1 `tests/refresh-jobs.test.mjs`: chặn tạo job trùng, nhận diện job treo 90 phút,
      401 khi sai token, chuyển trạng thái done/failed đúng.
- [x] 5.2 Test tính mức cảnh báo dữ liệu cũ theo 3 ngưỡng.
- [x] 5.3 Chạy `node --test tests/*.mjs` — phải xanh toàn bộ trước khi deploy.
- [x] 5.4 Chạy thử thật một lượt từ nút trên web tới khi web cập nhật, đối chiếu
      `generated_at` mới.
- [ ] 5.5 XÁC NHẬN 17/08: Access ĐANG BẬT (endpoint ngoài trả 302, meta báo
      service_token_status=false). App chặn có AUD 4e14eafe6a57c2981cbfd826bcfbe1bd9056e217ef692268a134ac1586121424.
      Cần thêm policy Service Auth cho token `crm-refresh-runner` vào ĐÚNG app đó,
      hoặc tạo app Bypass cho 2 đường /api/refresh/next + /report. CHỜ NGƯỜI DÙNG.
- [x] 5.6 Ghi vào `README.md`: khi GitHub mở khoá Actions trở lại thì chọn MỘT đường
      (cron GitHub hoặc runner), không bật cả hai cùng ghi `data/*.json`.
