-- Menu "Đăng fanpage Thái" — 2 fanpage thị trường Thái Lan (Noma Thailand, Doscom Thailand).
--
-- Bảng RIÊNG, không dùng lại geo_content_queue: agent-geo phục vụ bài SEO dài trên
-- WordPress (slug, JSON-LD, internal link), còn đây là caption ngắn tiếng Thái gắn với
-- một cặp SKU và một fanpage. Red line dự án: 1 agent không tự ý đọc DB của agent khác.

CREATE TABLE IF NOT EXISTS thai_pages (
  page_id            TEXT PRIMARY KEY,          -- ID fanpage Facebook
  name               TEXT NOT NULL,
  page_token         TEXT,                      -- Page Access Token; NULL = chưa cấp, nút Đăng khoá
  token_expires_at   INTEGER,                   -- epoch giây; NULL/0 = không hết hạn
  active             INTEGER NOT NULL DEFAULT 1,
  post_hour_vn       INTEGER NOT NULL DEFAULT 8,   -- giờ VN sinh bài (0-23)
  weekdays           TEXT    NOT NULL DEFAULT '1,2,3,4,5,6', -- ISO: 1=T2 … 7=CN
  default_sku_main   TEXT,
  default_sku_addon  TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thai_post_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id       TEXT NOT NULL,
  vn_date       TEXT NOT NULL,                  -- YYYY-MM-DD theo giờ VN (UTC+7)
  source        TEXT NOT NULL DEFAULT 'manual', -- 'schedule' | 'manual'
  sku_main      TEXT NOT NULL,
  sku_addon     TEXT,
  angle         TEXT,                           -- góc bán hàng người dùng chọn
  caption_th    TEXT,
  caption_vi    TEXT,                           -- dịch ngược để người Việt duyệt
  hashtags      TEXT,                           -- JSON array
  image_prompt  TEXT,
  image_url     TEXT,                           -- ảnh sản phẩm nền trắng trong thư viện
  image_base64  TEXT,                           -- ảnh Flux tạm; XOÁ sau khi đăng xong
  status        TEXT NOT NULL DEFAULT 'pending_review',
                                                -- pending_review | edited | published | discarded
  fb_post_id    TEXT,
  last_error    TEXT,
  cost_usd      REAL NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  FOREIGN KEY (page_id) REFERENCES thai_pages(page_id)
);

-- Chống sinh trùng: cron chạy lại trong ngày (retry, hai nhịp trùng giờ, bấm tay) phải
-- rơi vào nhánh "skipped" chứ không đốt thêm một lượt Flux + một lượt Claude.
-- Chỉ ràng buộc bài do LỊCH sinh — bài bấm tay thì được nhiều bài/ngày.
CREATE UNIQUE INDEX IF NOT EXISTS idx_thai_queue_schedule_once
  ON thai_post_queue (page_id, vn_date) WHERE source = 'schedule';

CREATE INDEX IF NOT EXISTS idx_thai_queue_page_date ON thai_post_queue (page_id, vn_date DESC);
CREATE INDEX IF NOT EXISTS idx_thai_queue_status    ON thai_post_queue (status);
