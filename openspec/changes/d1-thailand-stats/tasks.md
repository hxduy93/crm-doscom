## Tasks

- [x] 1. `functions/api/landing-leads.js`: thêm `TH_PRODUCTS`, `isThaiProduct()`,
      `resolveMarket()`, `marketFilter()`; áp bộ lọc vào cả 5 truy vấn qua biến `where`
      dùng chung; trả thêm `market` trong response (cả nhánh "bảng chưa tồn tại").
- [x] 2. `index.html`: dashboard VN gọi `/api/landing-leads?market=vn&...` — sửa dòng tổng
      và cột % của bảng "Lead theo landing & nhân sự".
- [x] 3. `index.html`: thêm nav `data-view="thailand"`, mục `TITLES.thailand`,
      khối `#view-thailand` (dải cảnh báo tách số + KPI + 2 bảng) và CSS phạm vi
      `#view-thailand`.
- [x] 4. `index.html`: module JS lazy-load riêng cho view Thái, KHÔNG dùng chung biến
      `NOMA_LEADS` / `OTHER_LEADS` của dashboard VN.
- [x] 5. `tests/landing-leads-market.test.mjs`: canh `resolveMarket`, `isThaiProduct`,
      hình dạng SQL, và bất biến `vn + th = all` (gồm ca `product` rỗng).
- [x] 6. Chạy `node --test "tests/*.test.mjs"` → 396 pass / 0 fail / 12 skipped.

## Chưa làm (cần quyết định của chủ dự án)

- [ ] 7. Nối tài khoản quảng cáo Thái vào snapshot `data/*.json` để có Chi phí QC / CPL /
      ROAS. Hiện ô đó hiện "thiếu dữ liệu".
- [ ] 8. Landing Thái (`doscom-d1-th`) chưa cộng dồn cột `submits` (migration 0016) — đang
      dùng `INSERT OR IGNORE` nên lần gửi trùng biến mất, không đối soát được với pixel
      như landing DR1 đang làm. Muốn có chỉ số "số lần bấm gửi vs lead thật" thì phải sửa
      `functions/api/order.js` bên repo landing.
- [ ] 9. `openspec/config.yaml` mục Xác thực đang ghi CRM "CHỦ Ý để PUBLIC", nhưng thực tế
      `crm-doscom.pages.dev` đã bật Cloudflare Access (mọi request trả 302 sang trang đăng
      nhập). Hiến pháp dự án đang lệch thực tế — cần cập nhật lại.
