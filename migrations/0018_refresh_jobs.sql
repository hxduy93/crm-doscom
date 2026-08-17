-- Hàng đợi yêu cầu "Cập nhật dữ liệu" bấm từ trang Tổng quan Dashboard.
--
-- Bối cảnh: 15/08/2026 GitHub khoá Actions toàn tài khoản hxduy93 → 8 bước pipeline
-- lấy dữ liệu ngừng chạy, dashboard đứng số 3 ngày mà không có dấu hiệu gì.
-- Bảng này KHÔNG chứa dữ liệu kinh doanh, chỉ là hộp thư giữa nút bấm trên web và
-- runner chạy pipeline Python ở máy người vận hành (xem runner/README.md).
--
-- Vì sao không chạy pipeline thẳng trong Pages Functions: không có runtime Python, và
-- pipeline đo thật mất ~40 phút (riêng fetch_pancake_crm_contacts ~25 phút) — vượt xa
-- giới hạn CPU của Functions. Chi tiết ở openspec/changes/refresh-button/design.md.

CREATE TABLE IF NOT EXISTS refresh_jobs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  -- pending  : đã bấm nút, chờ runner nhận
  -- running  : runner đã nhận và đang chạy
  -- done     : chạy hết 10 bước, đã deploy
  -- failed   : một bước lỗi → dừng, KHÔNG deploy
  -- stale    : running quá 90 phút mà không có báo cáo → coi như runner chết
  status            TEXT    NOT NULL DEFAULT 'pending',
  created_at        INTEGER NOT NULL,          -- epoch giây (UTC), lúc bấm nút
  started_at        INTEGER,                   -- lúc runner nhận việc
  finished_at       INTEGER,                   -- lúc done/failed
  -- Tiến độ: runner báo mỗi bước một lần (không stream log, tránh ghi D1 liên tục 40').
  current_step      INTEGER NOT NULL DEFAULT 0,
  current_step_name TEXT,
  total_steps       INTEGER NOT NULL DEFAULT 0,
  -- Số cảnh báo runner đếm được (vd FB trả 400 cho ad-level 1 tài khoản, landing Noma
  -- im lặng > 48h). Có warnings mà vẫn done → giao diện báo "xong, có N cảnh báo",
  -- KHÔNG báo thành công trơn tru.
  warnings          INTEGER NOT NULL DEFAULT 0,
  warning_text      TEXT,
  error_step        TEXT,
  error_log         TEXT,                      -- tối đa 2000 ký tự cuối, log đầy đủ nằm ở máy runner
  requested_by      TEXT                       -- email từ Cloudflare Access nếu có, không thì 'web'
);

CREATE INDEX IF NOT EXISTS idx_refresh_jobs_status  ON refresh_jobs (status);
CREATE INDEX IF NOT EXISTS idx_refresh_jobs_created ON refresh_jobs (created_at DESC);

-- Nhịp tim của runner. Một dòng duy nhất (id = 1): runner cập nhật mỗi lần hỏi việc,
-- kể cả khi không có job. Giao diện dựa vào đây để biết máy chạy runner có đang bật
-- không — quá 5 phút không thấy thì nút báo "runner chưa chạy" thay vì để người bấm
-- rồi chờ vô ích.
-- Tách bảng riêng thay vì nhét cột vào refresh_jobs vì nhịp tim không thuộc về job nào.
CREATE TABLE IF NOT EXISTS refresh_runner_state (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  last_seen_at   INTEGER NOT NULL,
  runner_version TEXT
);
