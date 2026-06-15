-- GEO Phase 7 — Search engine indexing log
-- Lưu kết quả submit URL lên Google Indexing API + IndexNow (Bing/Yandex)
-- sau khi publish bài lên WordPress. Dùng để debug + show "indexed status" trong UI.

CREATE TABLE IF NOT EXISTS geo_index_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,             -- FK -> geo_content_queue.id
  url TEXT NOT NULL,                    -- URL đã submit (lấy từ wp_post_url)
  google_ok INTEGER NOT NULL DEFAULT 0, -- 1 = submit Google Indexing API thành công
  google_msg TEXT,                      -- response/error message (truncated 500 ký tự)
  indexnow_ok INTEGER NOT NULL DEFAULT 0, -- 1 = IndexNow (Bing/Yandex) accept
  indexnow_msg TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (article_id) REFERENCES geo_content_queue(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_index_log_article ON geo_index_log(article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_index_log_created ON geo_index_log(created_at DESC);
