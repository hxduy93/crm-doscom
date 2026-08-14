-- Đơn đăng ký từ landing NOMA 120 (dung dịch vệ sinh súc rửa kim phun & buồng đốt).
-- Repo landing: hxduy93/noma120-landing → Pages Function /api/order → endpoint này.
--
-- Vì sao KHÔNG dùng lại bảng có sẵn (cùng lý do đã ghi ở 0013 cho 680, 0014 cho 350,
-- 0015 cho 230):
--   * noma911_orders / noma680_orders gắn cứng combo của dòng sản phẩm đó. Trộn 120 vào
--     sẽ làm lẫn by_combo của thống kê đang chạy.
--   * landing_leads CỐ Ý không có combo/gift/amount/POS (xem comment 0011), dành cho
--     landing chỉ thu lead. 120 bán theo combo có giá nên nhét vào là mất doanh thu.
--
-- Khuôn giữ ĐÚNG như noma230_orders để /api/noma120/stats trả cùng hình dạng response,
-- dashboard tái dùng được component sẵn có.

CREATE TABLE IF NOT EXISTS noma120_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  staff         TEXT    NOT NULL,          -- 'duy' | 'pn' (khớp noma911_orders, noma230_orders)
  combo         TEXT    NOT NULL,          -- 'le-120' | 'combo-2x120' | 'combo-120-350' | 'combo-120-130'
  combo_label   TEXT,                      -- nhãn hiển thị, server tự chốt
  -- Landing 120 KHÔNG chạy quà tặng — cột này luôn rỗng, /api/noma120/stats sẽ trả
  -- by_gift = [{ gift: '(không quà)' }]. Giữ cột lại CỐ Ý, vì hai lý do: hình dạng
  -- response phải khớp 230/350/680 để dashboard dùng chung component, và bật quà về sau
  -- thì không phải thêm migration.
  gift          TEXT,
  name          TEXT,                      -- form 120 có thu tên
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

CREATE INDEX IF NOT EXISTS idx_noma120_date  ON noma120_orders (created_date);
CREATE INDEX IF NOT EXISTS idx_noma120_phone ON noma120_orders (phone);
CREATE INDEX IF NOT EXISTS idx_noma120_staff ON noma120_orders (staff);

-- Chặn ghi trùng khi khách bấm gửi 2 lần / landing retry: cùng SĐT + cùng combo trong
-- cùng 1 ngày chỉ tính 1 đơn. Ràng buộc đặt ở tầng schema chứ không SELECT-rồi-INSERT,
-- vì D1 không có transaction nhiều câu lệnh — hai request gần nhau sẽ lọt qua khe kiểm tra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_noma120_dedup
  ON noma120_orders (created_date, phone, combo);
