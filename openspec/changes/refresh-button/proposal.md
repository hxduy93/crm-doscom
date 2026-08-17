## Why

Ngày 15/08/2026 GitHub khoá Actions TOÀN tài khoản `hxduy93` (mọi lời gọi API trả
`422 — "Actions has been disabled for this user."`, cả 12 workflow đều 0 lượt chạy).
Toàn bộ đường lấy dữ liệu của CRM chạy bằng GitHub Actions nên dashboard đứng số từ
14/08: người dùng mở web vẫn thấy giao diện bình thường nhưng doanh thu, chi phí QC
và lợi nhuận đều là số cũ — nguy hiểm hơn cả việc web sập, vì không có dấu hiệu nào
báo là số đã cũ. Cần một cách để người vận hành **tự bấm cập nhật** mà không phụ thuộc
GitHub, và nhìn thấy rõ dữ liệu tươi tới thời điểm nào.

## What Changes

- Thêm nút **"Cập nhật dữ liệu"** trên giao diện CRM. Bấm nút KHÔNG chạy pipeline ngay
  trong Cloudflare mà **ghi một yêu cầu (job) vào D1** rồi trả về ngay.
- Thêm **runner** chạy trên máy người vận hành: cứ ~60 giây hỏi CRM "có yêu cầu nào
  không", có thì chạy đúng 8 bước pipeline Python hiện có + deploy, và báo tiến độ
  từng bước ngược về CRM.
  - Lý do không viết lại pipeline bằng JavaScript để chạy thẳng trên Pages Functions:
    6 script Python (~200KB) chứa toàn bộ LUẬT TÍNH DỮ LIỆU đã chốt qua nhiều lần sửa
    sai (gộp/không gộp trạng thái hoàn, tách brand theo tỉ lệ, xếp nguồn theo tên…).
    Viết lại là mở lại đúng những chỗ đã từng cho ra số sai. Pages Functions cũng không
    có runtime Python.
- Thêm bảng D1 `refresh_jobs` (qua migration mới) lưu: trạng thái, ai bấm, thời điểm
  bấm/bắt đầu/kết thúc, bước đang chạy, log tóm tắt, lỗi.
- UI hiển thị: dữ liệu cập nhật lần cuối lúc nào, đang chạy bước mấy/8, và **cảnh báo
  khi snapshot quá cũ** (> 24 giờ) — để lần sau dữ liệu đứng thì nhìn là biết ngay.
- Endpoint cho runner (`/api/refresh/next`, `/api/refresh/report`) bảo vệ bằng header
  token so với `env.REFRESH_RUNNER_TOKEN`, theo đúng khuôn `X-Noma-Token` của
  `noma911-orders`.

**Breaking change: KHÔNG.** Không đụng vào cách tính số, không đổi khuôn API cũ, không
sửa script Python nào. Pipeline dữ liệu vẫn là 6 script cũ, chạy y nguyên thứ tự CI.

## Capabilities

### New Capabilities
- `refresh-jobs`: hàng đợi yêu cầu cập nhật dữ liệu — tạo job từ UI, phát job cho
  runner, nhận báo cáo tiến độ/kết quả, và trả trạng thái cho UI hiển thị.

### Modified Capabilities
<!-- Không có. Các agent hiện có (agent-fb-ai, agent-google-ai, agent-weekly-ai,
     noma911-orders, agent-geo) đều chỉ ĐỌC data/*.json hoặc D1 riêng của chúng;
     yêu cầu (requirement) của chúng không đổi. Chúng chỉ hưởng lợi gián tiếp vì
     snapshot data/*.json được làm tươi thường xuyên hơn. -->

## Impact

- **Mới**: `functions/api/refresh/request.js`, `next.js`, `report.js`, `status.js`;
  `migrations/0018_refresh_jobs.sql` (file cuối cùng đang có là `0017_noma120_orders.sql`);
  `runner/` — script chạy trên máy người vận hành; `tests/refresh-jobs.test.mjs`.
- **Sửa**: `index.html` (nút + ô trạng thái + cảnh báo snapshot cũ); `wrangler.toml`
  nếu cần khai thêm binding; `scripts/build-dist.sh` nếu thêm file tĩnh mới.
- **Secret mới**: `REFRESH_RUNNER_TOKEN` — đặt trong Pages secret và trong file
  `.dev.vars.refresh` ở máy chạy runner (file này đã nằm trong `.gitignore`).
- **Không đụng**: 6 script Python lấy dữ liệu, mọi công thức tính, các bảng D1 hiện có.
- **Phụ thuộc vận hành**: máy chạy runner phải bật. Đây là đánh đổi có ý thức so với
  cron GitHub — bù lại không lệ thuộc vào việc GitHub có mở khoá tài khoản hay không.
- **Liên quan**: `.github/workflows/*` giữ nguyên, không xoá — nếu GitHub mở khoá lại
  thì cả hai đường cùng chạy được, runner chỉ là đường bấm tay.
