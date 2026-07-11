-- Map bài viết nguồn (noma.vn / doscom.vn) → bài đã dịch trên nomaauto.us.
-- Dùng để biết bài nào ĐÃ đồng bộ (bài viết không có SKU như sản phẩm nên không dò trùng theo tên được).
CREATE TABLE IF NOT EXISTS us_post_sync (
  source_site    TEXT    NOT NULL,          -- 'noma' | 'doscom'
  source_post_id INTEGER NOT NULL,
  source_title   TEXT,
  us_post_id     INTEGER NOT NULL,
  us_title       TEXT,
  us_url         TEXT,
  created_at     INTEGER NOT NULL,          -- epoch giây
  PRIMARY KEY (source_site, source_post_id)
);

CREATE INDEX IF NOT EXISTS idx_us_post_sync_created ON us_post_sync (created_at DESC);
