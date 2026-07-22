-- Sổ NHẬN video TikTok: 1 video chỉ 1 nhân sự được chạy ads, tránh 2 người cùng
-- chạy trùng 1 creative (đốt tiền 2 lần, số liệu không quy trách nhiệm được ai).
--
-- Khoá theo ID VIDEO TIKTOK (rút từ link, vd "7106594312292453675") chứ không theo
-- tài khoản quảng cáo: cùng 1 video mà 2 người chạy ở 2 TKQC khác nhau vẫn là trùng.
--
-- Bảng này CHỈ ghi việc "ai nhận video nào". Việc "video đã lên camp chưa" nằm ở
-- bảng uploaded_videos (sổ riêng của luồng tạo ads) — không trộn 2 sổ vào nhau.
CREATE TABLE IF NOT EXISTS video_claims (
  video_key   TEXT PRIMARY KEY,   -- id video TikTok
  staff       TEXT NOT NULL,      -- DUY | PHUONG_NAM (khớp mã nhân sự ở functions/lib/access.js)
  link        TEXT,               -- link gốc, để tra lại khi cần
  title       TEXT,
  product     TEXT,
  shop        TEXT,
  claimed_at  INTEGER NOT NULL,   -- epoch giây — mốc tính hạn 60s được gỡ
  claimed_by  TEXT,               -- email Cloudflare Access (nếu đã bật), để đối chiếu
  released_at INTEGER,            -- NULL = đang giữ. Có giá trị = đã gỡ (GIỮ dòng làm lịch sử)
  released_by TEXT
);

-- Truy vấn chính: liệt kê video đang có người giữ.
CREATE INDEX IF NOT EXISTS idx_video_claims_active
  ON video_claims(released_at, claimed_at DESC);
