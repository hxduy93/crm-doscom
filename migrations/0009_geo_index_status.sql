-- GEO Phase 8 — Trạng thái index THẬT trên Google (Search Console URL Inspection API)
--
-- Khác với geo_index_log (chỉ ghi việc đã SUBMIT URL lên Google/IndexNow thành công
-- hay chưa), bảng này cache kết quả Google THỰC SỰ đã index URL hay chưa — lấy bằng
-- cách gọi Search Console URL Inspection API (POST /v1/urlInspection/index:inspect).
--
-- URL Inspection có quota (~2000 lệnh/ngày/property) nên KHÔNG gọi mỗi lần load UI.
-- /api/geo/check-index quét các URL đã publish, ghi/đè vào bảng này; /api/geo/index-stats
-- đọc cache ra để tính tỉ lệ. 1 dòng / 1 URL (PK = url, re-check thì UPSERT).

CREATE TABLE IF NOT EXISTS geo_index_status (
  url TEXT PRIMARY KEY,                  -- URL bài đã publish (= wp_post_url)
  article_id TEXT,                       -- FK -> geo_content_queue.id (có thể null nếu URL lạ)
  site TEXT,                             -- "doscom" | "noma"
  indexed INTEGER NOT NULL DEFAULT 0,    -- 1 = Google đã index (verdict PASS), 0 = chưa/không
  verdict TEXT,                          -- PASS | PARTIAL | FAIL | NEUTRAL | VERDICT_UNSPECIFIED | error
  coverage_state TEXT,                   -- chuỗi mô tả: "Submitted and indexed", "Crawled - currently not indexed"...
  last_crawl_time TEXT,                  -- thời điểm Google crawl gần nhất (ISO string từ API)
  robots_txt_state TEXT,
  page_fetch_state TEXT,
  error_msg TEXT,                        -- nếu gọi API lỗi (truncated 500 ký tự)
  checked_at INTEGER NOT NULL            -- epoch giây lúc kiểm tra
);

CREATE INDEX IF NOT EXISTS idx_index_status_checked ON geo_index_status(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_index_status_article ON geo_index_status(article_id);
