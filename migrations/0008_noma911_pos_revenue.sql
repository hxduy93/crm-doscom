-- 0008: Thêm cột đối chiếu đơn POS thật (doanh thu thực) vào noma911_orders.
-- Sync bằng functions/api/noma911/sync-revenue.js: match SĐT lead landing → đơn POS Pancake,
-- lưu trạng thái giao hàng + COD thực. Stats tính doanh thu "đã giao" và "đã lên đơn".

ALTER TABLE noma911_orders ADD COLUMN pos_matched  INTEGER DEFAULT 0;   -- 1 nếu khớp 1 đơn POS noma
ALTER TABLE noma911_orders ADD COLUMN pos_status   INTEGER;             -- status Pancake của đơn match (3=đã giao, 4=đang hoàn, 5=đã hoàn, 6=huỷ...)
ALTER TABLE noma911_orders ADD COLUMN pos_cod      INTEGER DEFAULT 0;   -- doanh thu thực (cod / total) của đơn match
ALTER TABLE noma911_orders ADD COLUMN pos_order_id TEXT;                -- id đơn POS (để dedup khi nhiều lead cùng SĐT)
ALTER TABLE noma911_orders ADD COLUMN synced_at    INTEGER;            -- lần sync gần nhất (epoch)

CREATE INDEX IF NOT EXISTS idx_noma911_orders_pos ON noma911_orders(pos_matched, pos_status);
