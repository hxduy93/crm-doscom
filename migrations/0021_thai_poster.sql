-- Ảnh bài đăng chuyển từ "ảnh sản phẩm nền trắng" sang ẢNH GHÉP 3 lớp:
--   nền do Flux sinh theo góc bán hàng  +  sản phẩm thật cắt rời  +  chữ tiếng Thái
--
-- Chủ dự án chốt 24/08/2026: ảnh phải là ảnh bán hàng thiết kế thật, bám góc bán hàng.
-- KHÔNG in giá, KHÔNG nút CTA. Kèm bản dịch tiếng Việt của đúng chữ trên ảnh để người
-- duyệt đọc được mình đang đăng gì.
--
-- image_base64 (đã có) giờ chứa ẢNH GHÉP HOÀN CHỈNH — thứ thật sự được đăng.

ALTER TABLE thai_post_queue ADD COLUMN bg_base64       TEXT;  -- nền Flux, giữ để ghép lại khi sửa chữ
ALTER TABLE thai_post_queue ADD COLUMN scene_prompt    TEXT;  -- prompt cảnh nền, để soát khi ảnh ra sai
ALTER TABLE thai_post_queue ADD COLUMN poster_title_th TEXT;  -- tiêu đề trên ảnh (tiếng Thái)
ALTER TABLE thai_post_queue ADD COLUMN poster_sub_th   TEXT;  -- dòng nội dung dưới tiêu đề
ALTER TABLE thai_post_queue ADD COLUMN poster_title_vi TEXT;  -- dịch ngược, CHỈ hiện trên CRM
ALTER TABLE thai_post_queue ADD COLUMN poster_sub_vi   TEXT;
