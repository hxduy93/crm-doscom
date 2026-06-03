-- 0007: Bảng thống kê đơn đăng ký từ landing NOMA 911 (noma-landings)
-- Mỗi đơn submit form thành công (khách điền đủ thông tin → ra trang cảm ơn)
-- được landing _worker.js fan-out POST về /api/noma911/order và lưu vào đây.
-- DB: doscom_geo (bound là `DB` trên project facebookadsallinone).

CREATE TABLE IF NOT EXISTS noma911_orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  staff        TEXT NOT NULL,            -- 'duy' | 'pn'
  combo        TEXT NOT NULL,            -- 'le-911' | 'combo-2x911' | 'combo-911-922' | (raw)
  combo_label  TEXT,                     -- nhãn người đọc
  gift         TEXT,                     -- quà tặng kèm
  source       TEXT,                     -- noma911_lp_duy | noma911_lp_phuongnam | ...
  province     TEXT,                     -- địa chỉ/tỉnh khách nhập
  phone        TEXT,                     -- để dedupe + đếm khách unique (dashboard có auth)
  amount       INTEGER DEFAULT 0,        -- giá dự kiến đơn (VND)
  url          TEXT,                     -- URL landing khách submit
  referrer     TEXT,
  created_at   INTEGER NOT NULL,         -- epoch seconds (UTC)
  created_date TEXT NOT NULL             -- 'YYYY-MM-DD' theo giờ VN (UTC+7) để group nhanh
);

CREATE INDEX IF NOT EXISTS idx_noma911_orders_date  ON noma911_orders(created_date);
CREATE INDEX IF NOT EXISTS idx_noma911_orders_combo ON noma911_orders(combo);
CREATE INDEX IF NOT EXISTS idx_noma911_orders_staff ON noma911_orders(staff);
