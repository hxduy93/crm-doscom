-- Nhật ký đẩy đơn chốt ngược về Meta (Conversions API).
--
-- Vì sao cần bảng này chứ không chỉ gọi API rồi thôi:
--   1. CHỐNG GỬI TRÙNG. Job chạy 2 lần/ngày và cửa sổ lấy đơn là 7 ngày, nên cùng
--      một đơn sẽ được quét lại nhiều lần. Meta có gộp trùng theo event_id, nhưng
--      chỉ trong khoảng thời gian giới hạn và không bảo đảm — mình phải tự biết
--      đơn nào đã đẩy.
--   2. BIẾT ĐƯỜNG ĐẨY CÒN SỐNG HAY KHÔNG. Không có nhật ký thì khi Meta lặng lẽ
--      từ chối (token hết hạn, pixel bị khoá) không ai hay, số liệu quảng cáo cứ
--      thế sai dần. Module "Đẩy đơn về Meta" trong CRM đọc chính bảng này.
--
-- event_name tách làm hai vì HAI MỐC ĐƠN KHÁC NHAU (chủ dự án chốt 08/10/2026):
--   'Purchase'          — lúc sale CHỐT đơn, dùng cho Meta tối ưu
--   'PurchaseDelivered' — lúc GIAO THÀNH CÔNG, chỉ để đo tiền thật
-- Dùng chung một tên cho cả hai mốc là tự thổi phồng số chuyển đổi gấp đôi.

CREATE TABLE IF NOT EXISTS meta_capi_sends (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pixel       TEXT NOT NULL,            -- mã pixel nhận (mỗi sản phẩm một pixel)
  event_name  TEXT NOT NULL,            -- 'Purchase' | 'PurchaseDelivered'
  order_id    TEXT NOT NULL,            -- mã đơn Pancake — khoá chống gửi trùng
  product     TEXT,                     -- 'DA81' | … (khớp landing_leads.product)
  phone       TEXT,                     -- 9 số cuối, chỉ để tra cứu khi đối soát
  value_vnd   INTEGER,                  -- COD thuần của đơn
  matched     TEXT,                      -- ghép được lead gốc bằng gì: 'fbp'|'fbc'|'phone'|'none'
  status      TEXT NOT NULL,            -- 'ok' | 'http_xxx' | 'error' | 'skip_quahan'
  err         TEXT,                     -- câu lỗi Meta trả về, cắt ngắn
  sent_at     INTEGER NOT NULL,         -- epoch giây
  sent_date   TEXT NOT NULL             -- 'YYYY-MM-DD' giờ VN, để lọc theo ngày
);

-- Một đơn chỉ được đẩy MỘT lần cho MỖI mốc. INSERT OR IGNORE dựa vào chỉ mục này.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_capi_dedup
  ON meta_capi_sends(event_name, order_id);

CREATE INDEX IF NOT EXISTS idx_meta_capi_date    ON meta_capi_sends(sent_date);
CREATE INDEX IF NOT EXISTS idx_meta_capi_status  ON meta_capi_sends(status);
CREATE INDEX IF NOT EXISTS idx_meta_capi_product ON meta_capi_sends(product);
