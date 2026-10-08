-- Lưu dấu quảng cáo của khách ngay lúc nhận lead.
--
-- Vì sao cần: mô hình của Doscom là THU LEAD rồi sale mới chốt qua Pancake POS.
-- Muốn Meta học từ người MUA THẬT (chứ chỉ từ người điền form), phải đẩy ngược
-- sự kiện Purchase về Conversions API lúc đơn chốt. Để Meta nối được "cú bấm
-- quảng cáo → mở landing → điền form → chốt đơn" thành cùng MỘT người, nó cần
-- hai cookie mà pixel đặt trong trình duyệt khách:
--     _fbp — mã trình duyệt
--     _fbc — sinh từ fbclid khi khách bấm vào quảng cáo
--
-- Landing ĐÃ nhận hai cookie này (dùng để bắn CompleteRegistration ngay lúc đó)
-- nhưng trước nay KHÔNG lưu lại — bắn xong là ném đi. Thiếu chúng, Purchase gửi
-- sau chỉ ghép được bằng SĐT băm, yếu hơn nhiều.
--
-- Và đây là loại dữ liệu KHÔNG BÙ LẠI ĐƯỢC: lead của ngày nào không lưu thì mất
-- dấu quảng cáo của ngày đó vĩnh viễn.
--
-- Cho phép rỗng: khách vào trực tiếp (không qua quảng cáo) thì không có _fbc, và
-- khách chặn pixel thì không có cả hai. Lúc đó vẫn ghép được bằng SĐT.

ALTER TABLE landing_leads ADD COLUMN fbp TEXT;
ALTER TABLE landing_leads ADD COLUMN fbc TEXT;
