-- GEO Phase 6 — AI usage tracking + inline images
-- 1. geo_ai_usage: lưu daily neuron consumption cho Workers AI (Flux Schnell)
--    để hiển thị banner cảnh báo trong UI khi gần/vượt free tier 10K/ngày.
-- 2. geo_inline_images: 2-3 ảnh minh hoạ inject vào body bài viết (ngoài hero).
--    Mỗi article có 1 hero (lưu trong geo_content_queue.image_base64) + N inline (table này).

-- ====================================================================
-- 1. Daily AI usage tracking
-- ====================================================================
CREATE TABLE IF NOT EXISTS geo_ai_usage (
  date TEXT PRIMARY KEY,                -- 'YYYY-MM-DD' theo UTC (Cloudflare reset free tier theo UTC)
  total_neurons INTEGER NOT NULL DEFAULT 0,
  total_images INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  free_tier_limit INTEGER NOT NULL DEFAULT 10000,
  updated_at INTEGER NOT NULL
);

-- ====================================================================
-- 2. Inline images cho từng article (ngoài hero featured image)
-- ====================================================================
CREATE TABLE IF NOT EXISTS geo_inline_images (
  id TEXT PRIMARY KEY,                  -- uuid
  article_id TEXT NOT NULL,             -- FK -> geo_content_queue.id
  position INTEGER NOT NULL,            -- thứ tự ảnh (0, 1, 2) — vị trí trong bài
  after_heading TEXT,                   -- H2 mà ảnh sẽ chèn phía dưới (vd "Phần mềm POS là gì?")
  prompt TEXT,                          -- Prompt Flux đã dùng
  alt TEXT,                             -- Alt text tiếng Việt
  image_base64 TEXT,                    -- Base64 PNG (xoá sau khi publish lên WP)
  image_url TEXT,                       -- URL trên WP media (sau khi publish)
  wp_media_id INTEGER,                  -- ID media trên WP
  width INTEGER,
  height INTEGER,
  steps INTEGER,
  provider TEXT DEFAULT 'flux-schnell',
  neurons_used INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (article_id) REFERENCES geo_content_queue(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inline_article ON geo_inline_images(article_id);
CREATE INDEX IF NOT EXISTS idx_inline_position ON geo_inline_images(article_id, position);

-- ====================================================================
-- 3. Thêm column vào geo_content_queue để lưu inline image metadata
--    (Claude xuất ra cùng content; gen ảnh thực tế lưu vào geo_inline_images)
-- ====================================================================
ALTER TABLE geo_content_queue ADD COLUMN inline_images_meta TEXT;
-- inline_images_meta = JSON [{position:0, after_heading:"...", prompt_en:"...", alt_vi:"..."}, ...]
