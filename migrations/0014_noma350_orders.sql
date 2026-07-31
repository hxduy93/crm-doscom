-- Đơn đăng ký từ landing NOMA 350 (dung dịch vệ sinh phanh đĩa).
-- Repo landing: hxduy93/noma350-landing → Pages Function /api/order → endpoint này.
--
-- Vì sao KHÔNG dùng lại bảng có sẵn (cùng lý do đã ghi ở 0013 cho 680):
--   * noma911_orders / noma680_orders gắn cứng combo của dòng sản phẩm đó. Trộn 350 vào
--     sẽ làm lẫn by_combo của thống kê đang chạy.
--   * landing_leads CỐ Ý không có combo/gift/amount/POS (xem comment 0011), dành cho
--     landing chỉ thu lead. 350 bán theo combo có giá nên nhét vào là mất doanh thu.
--
-- Khuôn giữ ĐÚNG như noma680_orders để /api/noma350/stats trả cùng hình dạng response,
-- dashboard tái dùng được component sẵn có.

CREATE TABLE IF NOT EXISTS noma350_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  staff         TEXT    NOT NULL,          -- 'duy' | 'pn' (khớp noma911_orders, noma680_orders)
  combo         TEXT    NOT NULL,          -- 'le-350' | 'combo-2x350' | 'combo-350-911' | 'combo-350-922'
  combo_label   TEXT,                      -- nhãn hiển thị, server tự chốt
  gift          TEXT,                      -- 'noma250' | '' (đơn lẻ không quà)
  name          TEXT,                      -- form 350 có thu tên
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

CREATE INDEX IF NOT EXISTS idx_noma350_date  ON noma350_orders (created_date);
CREATE INDEX IF NOT EXISTS idx_noma350_phone ON noma350_orders (phone);
CREATE INDEX IF NOT EXISTS idx_noma350_staff ON noma350_orders (staff);

-- Chặn ghi trùng khi khách bấm gửi 2 lần / landing retry: cùng SĐT + cùng combo trong
-- cùng 1 ngày chỉ tính 1 đơn. Ràng buộc đặt ở tầng schema chứ không SELECT-rồi-INSERT,
-- vì D1 không có transaction nhiều câu lệnh — hai request gần nhau sẽ lọt qua khe kiểm tra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_noma350_dedup
  ON noma350_orders (created_date, phone, combo);
