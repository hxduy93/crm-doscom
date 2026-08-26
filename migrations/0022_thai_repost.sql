-- Menu "Dịch bài sang Thái" — nhận LINK một bài đã đăng trên fanpage Việt, dịch chữ +
-- chữ trên ảnh sang tiếng Thái, rồi đăng (hoặc hẹn giờ đăng) lên fanpage Thái đã chọn.
--
-- Bảng RIÊNG, KHÔNG dùng lại thai_post_queue: bảng đó bắt buộc có sku_main và ràng buộc
-- một-bài-một-ngày cho lịch sinh bài theo SKU. Bài dịch lại không gắn SKU nào, có thể
-- nhiều bài/ngày, và mang thêm bài gốc + giờ hẹn đăng. Nhét chung là phải nới cả hai
-- ràng buộc đang bảo vệ tính năng cũ.
--
-- Dùng CHUNG bảng thai_pages (cùng agent thai-social): fanpage đích, token đăng bài, và
-- trạng thái token đều đã có ở đó. Không nhân bản danh sách fanpage ra chỗ thứ hai.

CREATE TABLE IF NOT EXISTS thai_repost_queue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id        TEXT NOT NULL,              -- fanpage THÁI đích (thai_pages.page_id)
  vn_date        TEXT NOT NULL,              -- YYYY-MM-DD theo giờ VN (UTC+7)

  src_url        TEXT NOT NULL,              -- link người dùng dán vào
  src_post_id    TEXT,                       -- id Graph của bài gốc ({page}_{post})
  src_page_id    TEXT,
  src_page_name  TEXT,

  caption_vi     TEXT,                       -- nguyên văn bài gốc
  caption_th     TEXT,                       -- bản dịch tiếng Thái (thứ sẽ đăng)
  -- Dịch NGƯỢC bản Thái về tiếng Việt. Người duyệt không đọc được tiếng Thái, nên đây là
  -- đường duy nhất để họ biết mình sắp đăng đúng cái gì. CHỈ hiện trên CRM, không đăng.
  caption_vi_back TEXT,
  hashtags       TEXT,                       -- JSON array, tiếng Thái
  warnings       TEXT,                       -- JSON array: chỗ người phải tự soát (giá, hotline, link VN…)

  -- JSON array. Mỗi phần tử: { src, kv_key, has_text, text_vi, text_th, translated, note }
  -- Ảnh KHÔNG lưu trong D1: bản base64 nằm ở KV INVENTORY (kv_key), D1 chỉ giữ mô tả.
  images         TEXT,
  image_mode     TEXT NOT NULL DEFAULT 'auto',   -- auto | keep | translate

  scheduled_at   INTEGER,                    -- epoch giây, giờ Facebook sẽ đăng; NULL = đăng ngay
  status         TEXT NOT NULL DEFAULT 'pending_review',
                                             -- pending_review | edited | scheduled | published | discarded
  fb_post_id     TEXT,
  last_error     TEXT,
  cost_usd       REAL NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  FOREIGN KEY (page_id) REFERENCES thai_pages(page_id)
);

CREATE INDEX IF NOT EXISTS idx_thai_repost_page_date ON thai_repost_queue (page_id, vn_date DESC);
CREATE INDEX IF NOT EXISTS idx_thai_repost_status    ON thai_repost_queue (status);
-- Dán lại đúng link cũ cho cùng fanpage thì phải tìm ra bài trước đó để hỏi "dịch lại?"
-- thay vì lặng lẽ tạo bản thứ hai rồi đăng trùng lên fanpage Thái.
CREATE INDEX IF NOT EXISTS idx_thai_repost_src       ON thai_repost_queue (src_post_id, page_id);
