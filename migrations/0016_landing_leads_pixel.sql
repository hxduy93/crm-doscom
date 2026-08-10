-- Đối soát pixel Facebook với lead thật trong CRM.
--
-- Trước đây landing bắn pixel Lead trong khối .finally() nên Facebook đếm cả
-- những lần submit không bao giờ tới server, và bảng này dùng INSERT OR IGNORE
-- nên khách submit lại trong ngày thì lần sau biến mất không dấu vết. Kết quả:
-- Ads Manager 8, Pancake 5, không cách nào truy 3 cái chênh nằm ở đâu.
--
-- Hai cột dưới đây làm cho chênh lệch đó đọc được:
--   event_id — khớp 1-1 với eventID gửi lên Facebook, để dò ngược từng lead
--   submits  — số lần khách bấm gửi trong ngày (unique index gộp thành 1 dòng)

ALTER TABLE landing_leads ADD COLUMN event_id TEXT;
ALTER TABLE landing_leads ADD COLUMN submits INTEGER NOT NULL DEFAULT 1;
