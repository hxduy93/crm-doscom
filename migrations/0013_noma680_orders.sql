-- Đơn đăng ký từ landing NOMA 680 (bọt tuyết vệ sinh đa năng 650ml).
-- Repo landing: hxduy93/noma680-landing → Pages Function /api/order → endpoint này.
--
-- Vì sao KHÔNG dùng lại bảng có sẵn:
--   * noma911_orders gắn cứng combo của 911 ('le-911', 'combo-911-310'…). Trộn 680 vào
--     sẽ làm lẫn by_combo của thống kê 911 đang chạy — đúng thứ migration 0011 đã tránh.
--   * landing_leads CỐ Ý không có combo/gift/amount/POS (xem comment 0011), dành cho
--     landing chỉ thu lead. 680 bán theo combo có giá nên nhét vào là mất doanh thu.
--
-- Khuôn giữ giống noma911_orders để /api/noma680/stats trả cùng hình dạng response,
-- dashboard tái dùng được component sẵn có. Thêm 2 cột 911 không có: name, note.

CREATE TABLE IF NOT EXISTS noma680_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  staff         TEXT    NOT NULL,          -- 'duy' | 'pn' (khớp noma911_orders)
  combo         TEXT    NOT NULL,          -- 'le-680' | 'combo-2x680' | 'combo-680-911'
  combo_label   TEXT,                      -- nhãn hiển thị, server tự chốt
  gift          TEXT,                      -- 'noma250' | 'noma692' | '' (đơn lẻ không quà)
  name          TEXT,                      -- form 680 có thu tên, form 911 thì không
  note          TEXT,                      -- ghi chú của khách
  source        TEXT,                      -- utm_source[/utm_campaign] | 'referral' | 'direct'
  province      TEXT,
  phone         TEXT,
  amount        INTEGER NOT NULL DEFAULT 0,-- chốt từ COMBO_META phía server
  url           TEXT,
  referrer      TEXT,
  created_at    INTEGER NOT NULL,          -- epoch giây (UTC)
  created_date  TEXT    NOT NULL,          -- 'YYYY-MM-DD' giờ VN (+07) — lọc theo ngày
  -- Đối soát Pancake POS. Chưa có job nào ghi → stats trả 0, KHÔNG bịa số.
  pos_matched   INTEGER NOT NULL DEFAULT 0,
  pos_status    INTEGER,
  pos_cod       INTEGER,
  pos_order_id  TEXT,
  synced_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_noma680_date  ON noma680_orders (created_date);
CREATE INDEX IF NOT EXISTS idx_noma680_phone ON noma680_orders (phone);
CREATE INDEX IF NOT EXISTS idx_noma680_staff ON noma680_orders (staff);

-- Chặn ghi trùng khi khách bấm gửi 2 lần / landing retry: cùng SĐT + cùng combo trong
-- cùng 1 ngày chỉ tính 1 đơn. Ràng buộc đặt ở tầng schema chứ không SELECT-rồi-INSERT,
-- vì D1 không có transaction nhiều câu lệnh — hai request gần nhau sẽ lọt qua khe kiểm tra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_noma680_dedup
  ON noma680_orders (created_date, phone, combo);
