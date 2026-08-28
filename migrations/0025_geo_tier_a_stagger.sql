-- 0025_geo_tier_a_stagger.sql
--
-- Rải lịch tầng A cho đều. Sau 0023/0024 cả 8 câu tầng A cùng có next_run_at trùng
-- một ngày; nhịp tầng A giờ là 2 ngày/lần nên chúng sẽ dồn thành 8 lượt vào ngày chẵn
-- và 0 lượt vào ngày lẻ. Trung bình vẫn 4 lượt/ngày, nhưng ngày dồn thì vượt trần
-- GEO_COSTLY_JOBS_PER_DAY = 7 → câu cuối bị đẩy lùi mỗi chu kỳ.
--
-- Trần có xử lý được chuyện đó (ưu tiên câu quá hạn lâu nhất, không dời lịch câu bị
-- cắt) nên không hỏng, chỉ là chạy giật cục vô ích. Rải chẵn/lẻ theo rowid cho phẳng:
-- 4 lượt mỗi ngày, không ngày nào chạm trần khi tầng A còn 8 câu.

UPDATE geo_queries
   SET next_run_at = CAST(strftime('%s','now') AS INTEGER) + (rowid % 2) * 86400
 WHERE active = 1 AND tier = 'A';
