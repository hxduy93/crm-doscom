-- Sổ VIDEO TIKTOK KHÔNG LẤY ĐƯỢC LINK (15/10/2026).
-- Trang Tạo Ads giải link qua tikwm; video TikTok chặn xem công khai (kênh bị hạn chế,
-- riêng tư, đang duyệt — trang TikTok trả statusCode 10204) thì báo "Url parsing is failed".
-- Ghi vào đây để menu TikTok Shop tự ẩn video đó, khỏi tick lại rồi lỗi lần nữa.
-- Chỉ ẩn trong một khoảng (xem HAN_AN_S ở functions/api/video-unavailable.js) vì video
-- "đang duyệt" có thể được mở lại; ghi lại lần nữa thì mốc marked_at được làm mới.
CREATE TABLE IF NOT EXISTS video_unavailable (
  video_key  TEXT PRIMARY KEY,   -- id video TikTok, cùng khoá với video_claims
  link       TEXT,
  title      TEXT,
  reason     TEXT,               -- thông báo lỗi lúc giải link
  marked_at  INTEGER NOT NULL,   -- epoch giây
  marked_by  TEXT                -- email Cloudflare Access (nếu đã bật)
);

CREATE INDEX IF NOT EXISTS idx_video_unavailable_marked ON video_unavailable(marked_at DESC);
