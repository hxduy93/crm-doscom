-- Sổ video đã upload thành ad — để nút "Quét video" biết video nào ĐÃ CÓ ad set
-- mà bỏ qua, chỉ upload video MỚI. Đối chiếu theo (account_id, filename).
--
-- LƯU Ý: Meta lưu video theo video_id, KHÔNG giữ tên file gốc → phải tự ghi sổ
-- mỗi lần tạo ad thành công thì mới đối chiếu được khi quét lần sau.
CREATE TABLE IF NOT EXISTS uploaded_videos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  TEXT NOT NULL,          -- ad account (đã bỏ tiền tố act_)
  product     TEXT,                   -- nhóm/sản phẩm = tên folder con
  filename    TEXT NOT NULL,          -- tên file gốc — KHOÁ đối chiếu khi quét
  video_id    TEXT,                   -- FB video id
  ad_id       TEXT,                   -- FB ad id (nếu tạo ad thành công)
  campaign_id TEXT,                   -- FB campaign id
  created_at  INTEGER NOT NULL        -- epoch giây
);

-- Một video (theo tên file) chỉ ghi 1 lần / tài khoản → INSERT OR IGNORE chống trùng.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uploaded_videos_acct_file
  ON uploaded_videos(account_id, filename);

CREATE INDEX IF NOT EXISTS idx_uploaded_videos_acct
  ON uploaded_videos(account_id, created_at DESC);
