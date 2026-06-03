-- 0009: Bảng định nghĩa landing page cho "Landing Builder" (tab trong dashboard).
-- Mỗi dòng = 1 landing. `config` là JSON blob chứa toàn bộ nội dung + cấu hình
-- (hero, combo, màu, ảnh, pixel, CRM shop/key, sheet_url, staff...) để template
-- cố định render ra HTML. Giữ JSON blob để thêm field mới không phải đổi schema.
-- DB: doscom_geo (bound là `DB` trên project facebookadsallinone), admin-only (qua session gate).

CREATE TABLE IF NOT EXISTS landings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,     -- path công khai: /<slug> (vd 'nm911d')
  title        TEXT NOT NULL,            -- tên nội bộ / tiêu đề trang
  status       TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  config       TEXT NOT NULL DEFAULT '{}',     -- JSON: toàn bộ nội dung + cấu hình landing
  created_at   INTEGER NOT NULL,         -- epoch seconds (UTC)
  updated_at   INTEGER NOT NULL,         -- epoch seconds (UTC)
  published_at INTEGER                   -- epoch seconds lần publish gần nhất (NULL nếu chưa)
);

CREATE INDEX IF NOT EXISTS idx_landings_status ON landings(status);
CREATE INDEX IF NOT EXISTS idx_landings_slug   ON landings(slug);
