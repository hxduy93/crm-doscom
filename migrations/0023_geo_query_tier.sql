-- 0023_geo_query_tier.sql
--
-- LỊCH QUÉT THEO TẦNG cho engine tính tiền theo LƯỢT.
--
-- Vì sao (28/08/2026): engine chatgpt gọi kèm tool web_search, giá CỐ ĐỊNH
-- $0,025 mỗi lượt bất kể câu dài ngắn. Đo thật trên geo_runs tới 28/08:
--   · 1.991 lượt chatgpt, tốn $51,06 — trong đó ~$50 là phí tool, chỉ $1 là token.
--   · 35/44 câu hỏi CHƯA BAO GIỜ được nhắc, qua trung bình 45 lượt mỗi câu.
--     Tức khoảng $40 đã tiêu để xác nhận đi xác nhận lại cùng một số 0.
--   · Chỉ 8/44 câu hỏi từng đổi kết quả — đó mới là chỗ đáng đo dày.
-- Quét đều mọi câu hỏi mỗi ngày là trả tiền cho chỗ không có tín hiệu.
--
-- Ba tầng, nhịp chạy engine ĐẮT (chatgpt) khác nhau. Engine RẺ (gemini,
-- $0,00037/lượt) vẫn chạy hàng ngày cho tất cả, làm chuông báo động.
--   A — kết quả từng thay đổi        → hàng ngày
--   B — luôn được nhắc               → 7 ngày/lần (canh tụt hạng)
--   C — chưa bao giờ được nhắc       → 14 ngày/lần
--
-- Tầng tự thăng/giáng trong run-batch.js; đăng bài GEO nhắm vào câu hỏi nào
-- thì publish-wp.js kéo câu đó lên tầng A 14 ngày (lúc DUY NHẤT kết quả có
-- lý do đổi). Xem functions/api/geo/_utils/query-tier.js.

ALTER TABLE geo_queries ADD COLUMN tier TEXT NOT NULL DEFAULT 'C';
ALTER TABLE geo_queries ADD COLUMN tier_reason TEXT;
ALTER TABLE geo_queries ADD COLUMN tier_until INTEGER;
ALTER TABLE geo_queries ADD COLUMN next_run_at INTEGER;

-- Backfill tầng A: câu hỏi mà bộ ba cờ (doscom | noma | cite) từng đổi giá trị.
UPDATE geo_queries
   SET tier = 'A',
       tier_reason = 'backfill: kết quả từng thay đổi',
       tier_until = NULL
 WHERE id IN (
   SELECT query_id FROM geo_runs
    WHERE engine = 'chatgpt' AND (error IS NULL OR error = '')
    GROUP BY query_id
   HAVING COUNT(DISTINCT doscom_mentioned || '|' || noma_mentioned || '|' || brand_url_cited) > 1
 );

-- Backfill tầng B: chưa bao giờ đổi, nhưng LẦN NÀO CŨNG có tín hiệu brand.
UPDATE geo_queries
   SET tier = 'B',
       tier_reason = 'backfill: luôn được nhắc'
 WHERE tier = 'C'
   AND id IN (
   SELECT query_id FROM geo_runs
    WHERE engine = 'chatgpt' AND (error IS NULL OR error = '')
    GROUP BY query_id
   HAVING MIN(doscom_mentioned + noma_mentioned + brand_url_cited) > 0
 );

UPDATE geo_queries
   SET tier_reason = 'backfill: chưa bao giờ được nhắc'
 WHERE tier = 'C' AND tier_reason IS NULL;

-- Xếp lịch lần chạy chatgpt kế tiếp.
--   Tầng A chạy ngay lượt cron kế.
--   Tầng B/C RẢI ĐỀU theo rowid để không dồn cả 36 câu vào cùng một ngày —
--   dồn thì hàng đợi lại phình đúng như cũ.
UPDATE geo_queries SET next_run_at = 0 WHERE tier = 'A';

UPDATE geo_queries
   SET next_run_at = CAST(strftime('%s','now') AS INTEGER) + (rowid % 7) * 86400
 WHERE tier = 'B';

UPDATE geo_queries
   SET next_run_at = CAST(strftime('%s','now') AS INTEGER) + (rowid % 14) * 86400
 WHERE tier = 'C';

CREATE INDEX IF NOT EXISTS idx_geo_queries_next_run ON geo_queries(active, next_run_at);
