-- Sổ ghi "hộp" quảng cáo: sản phẩm + nhóm chạy -> ĐÚNG campaign/ad set nào.
--
-- TRƯỚC ĐÂY hộp được nhận diện HOÀN TOÀN BẰNG TÊN: lib/fb-groups.js bắt mẫu
-- "<sản phẩm> - TEST|SCALE" trên tên campaign, không khớp thì thử tên ad set. Cách đó
-- hỏng theo 3 kiểu, đo được trên tài khoản thật ngày 23/09/2026:
--   1. Campaign "NOMA 230 · … - TEST" có 3 ad set (BID - tăng tốc / BID / … - TEST).
--      API chỉ giữ ad set của ad ĐẦU TIÊN Meta trả về. Thứ tự đó Meta KHÔNG cam kết —
--      đo ngày 23/09/2026 thì Meta trả ad mới nhất trước nên vô tình trúng ad set đúng,
--      nhưng đó là may, không phải thiết kế: Meta đổi thứ tự là creative đi lạc, kể cả
--      vào ad set đang TẮT. Thiệt hại CHẮC CHẮN đã xảy ra nằm ở chỗ khác — xem (1b).
--   1b. Vì mọi ad của 3 ad set bị gom vào chung một danh sách, cơ chế "giữ trần 4
--      creative" đếm trên cả campaign rồi TẮT ad cũ nhất BẤT KỂ nó nằm ở ad set nào.
--      Hộp NOMA 350 có 13 creative đang bật trên 3 ad set: chỉ cần đổ thêm 3 video là
--      12 ad bị tắt, quét sạch cả hai ad set BID không liên quan. (Trần này đã bỏ.)
--   2. Ad set tên "New folder - TEST" nằm trong campaign "D1 thái lan" đẻ ra một
--      "sản phẩm" tên New folder, vì có đường lùi khớp theo tên AD SET.
--   3. "NOMA 911 … - TEST" và "NOMA 911 … - TEST - Bản sao" gộp thành cùng một sản phẩm.
--
-- NAY: hộp neo vào ID. Tên chỉ còn là nhãn cho người đọc — đổi tên bên Trình quản lý QC
-- không làm lạc hộp nữa. Không tìm thấy ID trong sổ thì mới dò theo tên như cũ (hộp tạo
-- trước ngày này chưa có trong sổ).
--
-- Một sản phẩm × một nhóm = ĐÚNG một hộp → khoá chính (account_id, product, grp).
-- Cột tên là "grp" chứ không phải "group": GROUP là từ khoá SQL.

CREATE TABLE IF NOT EXISTS ad_boxes (
  account_id   TEXT NOT NULL,              -- ID tài khoản QC, KHÔNG kèm tiền tố "act_"
  product      TEXT NOT NULL,              -- tên sản phẩm đã chuẩn hoá (thường, gọn khoảng trắng)
  grp          TEXT NOT NULL,              -- TEST | SCALE
  campaign_id  TEXT NOT NULL,
  adset_id     TEXT NOT NULL,
  product_raw  TEXT,                       -- nguyên văn người dùng nhập, để hiện lại cho đúng
  updated_at   INTEGER NOT NULL,           -- epoch giây
  PRIMARY KEY (account_id, product, grp)
);

-- Tra ngược từ ad set về hộp: dùng khi cần biết một ad set có đang được sổ trỏ tới không
-- (vd trước khi ghi đè bằng ad set khác).
CREATE INDEX IF NOT EXISTS idx_ad_boxes_adset ON ad_boxes (account_id, adset_id);
