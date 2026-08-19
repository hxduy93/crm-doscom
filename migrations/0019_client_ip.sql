-- Ghi lại IP + trình duyệt của khách khi gửi đơn trên landing.
--
-- Vì sao cần: 19/08/2026 có 2 đơn DR1 trong cùng buổi sáng, muốn biết có phải
-- cùng một người/một máy bấm gửi hai số khác nhau hay không — nhưng KHÔNG bảng
-- nào lưu IP, mà Cloudflare Pages cũng không giữ log request, nên câu hỏi đó
-- vĩnh viễn không trả lời được. Hai cột dưới đây để lần sau còn đối chiếu.
--
--   ip         — CF-Connecting-IP (IP thật của khách, IPv6 dài nhất 45 ký tự)
--   user_agent — chuỗi UA, phân biệt 2 máy khác nhau cùng ra 1 IP (nhà mạng NAT,
--                wifi công ty) và ngược lại 1 máy đổi IP (4G đổi trạm)
--
-- Không đặt NOT NULL / DEFAULT: đơn cũ không có IP thì để NULL cho trung thực,
-- đừng lấp bằng chuỗi rỗng rồi sau này đếm nhầm là "có ghi nhận".

ALTER TABLE landing_leads   ADD COLUMN ip TEXT;
ALTER TABLE landing_leads   ADD COLUMN user_agent TEXT;

ALTER TABLE noma911_orders  ADD COLUMN ip TEXT;
ALTER TABLE noma911_orders  ADD COLUMN user_agent TEXT;

ALTER TABLE noma120_orders  ADD COLUMN ip TEXT;
ALTER TABLE noma120_orders  ADD COLUMN user_agent TEXT;

ALTER TABLE noma230_orders  ADD COLUMN ip TEXT;
ALTER TABLE noma230_orders  ADD COLUMN user_agent TEXT;

ALTER TABLE noma350_orders  ADD COLUMN ip TEXT;
ALTER TABLE noma350_orders  ADD COLUMN user_agent TEXT;

ALTER TABLE noma680_orders  ADD COLUMN ip TEXT;
ALTER TABLE noma680_orders  ADD COLUMN user_agent TEXT;

-- Truy "hôm nay có 2 đơn nào cùng IP không" là truy vấn chính của mấy cột này,
-- nên đánh index theo (ngày, ip) thay vì theo mỗi ip.
CREATE INDEX IF NOT EXISTS idx_landing_leads_ip  ON landing_leads(created_date, ip);
CREATE INDEX IF NOT EXISTS idx_noma911_orders_ip ON noma911_orders(created_date, ip);
CREATE INDEX IF NOT EXISTS idx_noma120_orders_ip ON noma120_orders(created_date, ip);
CREATE INDEX IF NOT EXISTS idx_noma230_orders_ip ON noma230_orders(created_date, ip);
CREATE INDEX IF NOT EXISTS idx_noma350_orders_ip ON noma350_orders(created_date, ip);
CREATE INDEX IF NOT EXISTS idx_noma680_orders_ip ON noma680_orders(created_date, ip);
