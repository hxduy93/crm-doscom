-- Lead từ CÁC LANDING KHÁC (ngoài NOMA 911) — Máy dò D1, Máy ghi âm DR1, …
--
-- Vì sao cần: 2 landing doscom.click và senso.io.vn trước đây đẩy thẳng đơn sang
-- Pancake rồi thôi, KHÔNG lưu lại đâu cả → không đếm được lead của Duy / Phương Nam
-- trên 2 sản phẩm này. Bảng này để landing ghi 1 bản trước khi đẩy Pancake.
--
-- Tách riêng khỏi noma911_orders vì bảng kia gắn chặt với combo NOMA
-- ('le-911', 'combo-911-310'…) và có cột đối soát POS riêng. Trộn vào sẽ làm
-- hỏng mọi thống kê combo đang chạy.

CREATE TABLE IF NOT EXISTS landing_leads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product      TEXT NOT NULL,            -- 'DR1' | 'D1' | … (mã ngắn, để nhóm)
  product_label TEXT,                    -- tên đầy đủ hiển thị
  staff        TEXT NOT NULL,            -- 'duy' | 'pn'  (khớp noma911_orders)
  landing      TEXT,                     -- '/dr1lad' | '/d1cb' | …
  name         TEXT,
  phone        TEXT,
  province     TEXT,
  note         TEXT,
  source       TEXT,
  url          TEXT,
  referrer     TEXT,
  pancake      TEXT,                     -- 'ok' | 'http_xxx' | 'error' | 'skip'
  created_at   INTEGER NOT NULL,         -- epoch seconds (UTC)
  created_date TEXT NOT NULL             -- 'YYYY-MM-DD' giờ VN (+07) — để lọc theo ngày
);

CREATE INDEX IF NOT EXISTS idx_landing_leads_date    ON landing_leads(created_date);
CREATE INDEX IF NOT EXISTS idx_landing_leads_staff   ON landing_leads(staff);
CREATE INDEX IF NOT EXISTS idx_landing_leads_product ON landing_leads(product);

-- Chặn ghi trùng khi khách bấm gửi 2 lần / landing retry: cùng SĐT + cùng landing
-- trong cùng 1 ngày chỉ tính 1 lead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_landing_leads_dedup
  ON landing_leads(created_date, landing, phone);
