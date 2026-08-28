-- 0024_geo_tier_hold_fix.sql
--
-- Vá lỗi của 0023: backfill đặt tier='A' nhưng để tier_until = NULL. decideTier()
-- coi "thiếu hạn giữ" là "đã hết hạn" nên HẠ TẦNG ngay lượt chạy đầu tiên — đúng
-- 28/08/2026 mẻ chạy thử đầu tiên đã làm tầng A tụt từ 8 xuống 7 câu, tức vứt bỏ
-- chính phần phân loại vừa tính từ lịch sử geo_runs.
--
-- Hai việc ở đây:
--   1. Xếp lại tầng từ dữ liệu gốc geo_runs (như 0023) để lấy lại câu đã bị hạ nhầm.
--   2. Cấp tier_until = +30 ngày cho MỌI câu tầng A, để chúng ở lại đủ chu kỳ quan sát.
--
-- Bản thân decideTier() cũng đã được vá để tự cấp hạn khi thiếu (xem query-tier.js),
-- nên lỗi này không tái diễn kể cả khi ai đó set tier='A' bằng tay.

-- 1. Lấy lại tầng A cho câu hỏi mà bộ ba cờ từng đổi giá trị.
UPDATE geo_queries
   SET tier = 'A',
       tier_reason = 'xếp lại 0024: kết quả từng thay đổi'
 WHERE active = 1
   AND id IN (
   SELECT query_id FROM geo_runs
    WHERE engine = 'chatgpt' AND (error IS NULL OR error = '')
    GROUP BY query_id
   HAVING COUNT(DISTINCT doscom_mentioned || '|' || noma_mentioned || '|' || brand_url_cited) > 1
 );

-- 2. Mọi câu tầng A phải có hạn giữ. Thiếu hạn = bị hạ ngay lượt kế.
UPDATE geo_queries
   SET tier_until = CAST(strftime('%s','now') AS INTEGER) + 30 * 86400
 WHERE tier = 'A'
   AND (tier_until IS NULL OR tier_until < CAST(strftime('%s','now') AS INTEGER));

-- 3. Tầng A chạy hàng ngày — kéo lịch về ngay nếu đang bị đẩy xa theo nhịp tầng cũ.
UPDATE geo_queries
   SET next_run_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE tier = 'A'
   AND next_run_at > CAST(strftime('%s','now') AS INTEGER) + 86400;
