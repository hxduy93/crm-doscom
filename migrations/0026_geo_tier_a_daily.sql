-- 0026_geo_tier_a_daily.sql
--
-- Đưa lịch tầng A về nhịp HÀNG NGÀY.
--
-- Bối cảnh: 0025 rải lịch tầng A chẵn/lẻ vì lúc đó tầng A chạy 2 ngày/lần (bản ngân
-- sách $5/tháng). Ngay sau đó chủ dự án chốt lại mức 10 lượt/ngày = $7,60/tháng
-- (~195.000đ) và tầng A quay về hàng ngày, nên cách rải của 0025 KHÔNG còn đúng:
-- nó đẩy một nửa số câu tầng A sang ngày mai trong khi chúng phải chạy mỗi ngày.
--
-- 0025 coi như đã bị thay thế. Giữ nguyên file đó (đã apply, không sửa migration cũ),
-- sửa lại trạng thái ở đây.
--
-- Ghi chú trung thực: trên production ngày 28/08 việc reset này đã được chạy TAY bằng
-- `wrangler d1 execute` trước khi có file này. Viết lại thành migration để DB dựng mới
-- ra đúng cùng trạng thái, và để lần sau không phải nhớ bằng miệng.
--
-- An toàn chạy lại nhiều lần: chỉ kéo về những câu đang bị hẹn quá xa.

UPDATE geo_queries
   SET next_run_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE active = 1
   AND tier = 'A'
   AND next_run_at > CAST(strftime('%s','now') AS INTEGER) + 86400;
