-- CRM Doscom — bảng đơn đăng ký landing NOMA 911 (độc lập với dashboard cũ).
-- Schema gộp từ facebookadsallinone migrations 0007 + 0008.
-- Landing fan-out POST /api/noma911/order -> lưu vào đây; /api/noma911/stats đọc ra.

CREATE TABLE IF NOT EXISTS noma911_orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  staff        TEXT NOT NULL,            -- 'duy' | 'pn'
  combo        TEXT NOT NULL,            -- 'le-911' | 'combo-2x911' | 'combo-911-310' | 'combo-911-922'
  combo_label  TEXT,
  gift         TEXT,
  source       TEXT,
  province     TEXT,
  phone        TEXT,
  amount       INTEGER DEFAULT 0,
  url          TEXT,
  referrer     TEXT,
  created_at   INTEGER NOT NULL,         -- epoch seconds (UTC)
  created_date TEXT NOT NULL,            -- 'YYYY-MM-DD' giờ VN
  -- đối chiếu POS (sync sau)
  pos_matched  INTEGER DEFAULT 0,
  pos_status   INTEGER,
  pos_cod      INTEGER DEFAULT 0,
  pos_order_id TEXT,
  synced_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_noma911_orders_date  ON noma911_orders(created_date);
CREATE INDEX IF NOT EXISTS idx_noma911_orders_combo ON noma911_orders(combo);
CREATE INDEX IF NOT EXISTS idx_noma911_orders_staff ON noma911_orders(staff);
CREATE INDEX IF NOT EXISTS idx_noma911_orders_pos   ON noma911_orders(pos_matched, pos_status);
