-- 0011: thêm cột `ip` vào noma911_orders để lưu IP khách (CF-Connecting-IP).
-- CHỈ lưu trong D1 (Cloudflare) — KHÔNG đẩy sang Pancake CRM.
-- IP do landing worker (noma-landings) bắt từ request khách rồi gửi kèm trong body
-- POST /api/noma911/order. Đơn cũ không có IP (NULL).
ALTER TABLE noma911_orders ADD COLUMN ip TEXT;

CREATE INDEX IF NOT EXISTS idx_noma911_orders_ip ON noma911_orders(ip);
