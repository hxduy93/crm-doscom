## Context

Pipeline dữ liệu CRM gồm 8 bước, hiện chạy trên GitHub Actions:

| # | Bước | Script | Đầu ra |
|---|---|---|---|
| 1 | Doanh thu Pancake | `fetch_pancake_revenue.py` | `data/product-revenue.json` |
| 2 | FB Ads insights | `fetch_fb_ads.py` | `data/fb-ads-data.json` |
| 3 | Google Ads chi phí | `fetch_google_ads_spend.py` | `data/google-ads-spend.json` |
| 4 | Google Ads ad/placement/search-terms | 3 script `fetch_google_ads_*.py` | 3 file JSON |
| 5 | Google Ads context (cho agent AI) | `compute_google_ads_metrics.py` | `data/google-ads-context.json` |
| 6 | Contacts CRM Pancake | `fetch_pancake_crm_contacts.py` | `data/pancake-crm-contacts.json` (không commit) |
| 7 | Lead → Order | `build_lead_to_order.py` | `data/lead-to-order.json` |
| 8 | Ráp dashboard | `build_dashboard_data.py` | `data/dashboard-data.json` |

Sau đó: `node --test tests/*.mjs` → `scripts/build-dist.sh` → `wrangler pages deploy`.

Từ 15/08/2026 GitHub khoá Actions toàn tài khoản `hxduy93` nên cả 8 bước ngừng chạy.
Đã xác nhận bằng lời gọi thật: `POST .../workflows/refresh-data.yml/dispatches` →
`422 Actions has been disabled for this user`, và `total_count = 0` trên mọi workflow.

Ràng buộc quan trọng: đo thực tế khi chạy tay ngày 17/08/2026, bước 6 mất ~25 phút
(9.454 contact, 200 bản ghi/trang), bước 8 mất ~5 phút. Tổng pipeline ~40 phút —
vượt xa giới hạn CPU của Cloudflare Pages Functions, nên không có cách nào chạy
trong Cloudflare kể cả khi viết lại bằng JS.

## Goals / Non-Goals

**Goals:**
- Người vận hành bấm một nút trên CRM là dữ liệu được cập nhật, không cần mở terminal,
  không cần GitHub.
- Nhìn vào CRM biết ngay dữ liệu tươi tới lúc nào, đang chạy bước mấy, bước nào hỏng.
- Không đụng một dòng nào vào phần tính số.
- Chạy được ngay trong ngày, không chờ GitHub mở khoá.

**Non-Goals:**
- KHÔNG viết lại pipeline Python sang JavaScript.
- KHÔNG thay thế cron tự động. Đây là đường BẤM TAY; nếu GitHub mở khoá thì workflow cũ
  vẫn chạy song song được.
- KHÔNG làm hệ thống hàng đợi tổng quát cho mọi loại job — chỉ đúng một loại việc là
  "cập nhật dữ liệu".
- KHÔNG gọi AI ở luồng này (không tốn credit, nên không cần cache KV / `USE_CLAUDE`).

## Decisions

### D1. Nút trên web chỉ TẠO YÊU CẦU; máy người vận hành mới chạy thật

Kiến trúc:

```
[UI: nút Cập nhật]  --POST /api/refresh/request-->  [D1: refresh_jobs (pending)]
                                                              ^   |
[UI: ô trạng thái]  <--GET /api/refresh/status----------------'   |
                                                                  v  (poll 60s, có token)
                                            [Runner trên máy vận hành]
                                              -> chay 8 buoc Python
                                              -> node --test
                                              -> wrangler pages deploy
                                              -> POST /api/refresh/report (moi buoc)
```

*Đã cân nhắc và loại:*
- **Chạy thẳng trong Pages Functions**: không có runtime Python; và ~40 phút chạy vượt
  giới hạn của Functions. Loại vì bất khả thi kỹ thuật, không phải vì khẩu vị.
- **Viết lại 6 script sang JS**: ~200KB logic, chứa các quyết định tính số đã đảo đi đảo
  lại nhiều lần (QUYẾT 2026-07-15, 2026-07-31, 2026-08-10 trong hiến pháp dự án). Viết
  lại là mở lại đúng những chỗ từng cho ra số sai, đổi lấy một lợi ích (không cần máy
  bật) mà runner đã giải quyết đủ tốt. Loại.
- **Container/VPS chạy pipeline**: giải được yêu cầu "không cần máy bật", nhưng phải trả
  tiền hạ tầng + chuyển toàn bộ secret lên đó. Để dành cho sau; runner được thiết kế để
  bê nguyên sang VPS khi cần (chỉ là một script poll, không phụ thuộc Windows).

### D2. Runner KÉO (poll), không phải CRM ĐẨY (webhook)

Máy người vận hành nằm sau NAT, không có IP tĩnh, không mở cổng vào được. Runner chủ động
gọi ra `GET /api/refresh/next` mỗi 60 giây. Đổi lại: độ trễ tối đa 60 giây từ lúc bấm nút
đến lúc pipeline khởi động — chấp nhận được với việc chạy 40 phút.

### D3. Một job chạy tại một thời điểm

`refresh_jobs` có ràng buộc: `/api/refresh/request` từ chối tạo job mới nếu đang có job
`pending` hoặc `running` (trả về job đang chạy kèm `HTTP 200` + `already_running: true`,
không phải lỗi). Tránh hai lượt pipeline cùng ghi vào `data/*.json` và cùng deploy —
đúng bài học từ LỖI 3.1 (race condition giữa 2 workflow cùng push).

Job `running` quá 90 phút bị coi là chết (`stale`) và cho phép tạo job mới — phòng trường
hợp runner bị tắt giữa chừng.

### D4. Runner báo tiến độ theo BƯỚC, không stream log

`POST /api/refresh/report` gọi 1 lần mỗi bước với `{ job_id, step, step_index, status,
message }`. Log đầy đủ nằm ở máy chạy runner; chỉ 2000 ký tự cuối của bước lỗi được gửi
lên D1 để hiện trên UI. Lý do: không biến D1 thành nơi chứa log, và tránh ghi D1 liên tục
trong 40 phút.

### D5. Token bảo vệ theo đúng khuôn noma911-orders

- `/api/refresh/next` và `/api/refresh/report` yêu cầu header `X-Refresh-Token` khớp
  `env.REFRESH_RUNNER_TOKEN`. Sai token → `401`, không tiết lộ có job hay không.
- `/api/refresh/request` và `/api/refresh/status` KHÔNG cần token — đúng quyết định
  "CRM để public trong giai đoạn hoàn thiện" của hiến pháp dự án. Rủi ro tối đa nếu bị
  gọi bừa là chạy pipeline thừa một lượt, không mất dữ liệu, và D3 chặn spam.
- Nếu sau này bật Cloudflare Access: hai endpoint runner PHẢI được thêm vào bypass policy,
  nếu không runner sẽ nhận trang đăng nhập thay vì JSON.

### D6. Bước nào hỏng thì DỪNG, không deploy nửa vời

Runner chạy tuần tự; bước nào `exit code != 0` thì dừng cả pipeline, báo `failed` kèm
log, và **không deploy**. Riêng bước `node --test` đỏ là chặn cứng — giống hệt cổng chất
lượng trong `refresh-data.yml` hiện tại.

Ngoại lệ có chủ ý: FB Graph API thỉnh thoảng trả `500` cho phần ad-level của một tài
khoản (đã gặp thật ngày 17/08 với tài khoản `764394829882083`). `build_dashboard_data.py`
tự bỏ qua tài khoản đó và vẫn `exit 0`. Runner giữ nguyên hành vi này nhưng đếm số dòng
`⚠ SKIP` trong log và gửi lên `warnings` để UI hiện "cập nhật xong, có N cảnh báo".

### D7. UI cảnh báo snapshot cũ

Ô trạng thái đọc `generated_at` của `data/dashboard-data.json` (đã có sẵn trong file, không
cần API mới) và so với giờ hiện tại:
- < 24 giờ: hiện bình thường "Cập nhật lúc HH:MM ngày DD/MM".
- 24–72 giờ: vàng, "Dữ liệu đã cũ N giờ".
- \> 72 giờ: đỏ, "Dữ liệu cũ N ngày — số trên trang không phản ánh hiện tại".

Đây là phần rẻ nhất nhưng có giá trị nhất của cả thay đổi: sự cố 15/08 kéo dài 3 ngày
mà không ai biết chính vì thiếu đúng dòng chữ này.

## Risks / Trade-offs

- **Máy người vận hành phải bật thì nút mới có tác dụng** → UI hiển thị trạng thái runner
  (lần cuối runner hỏi thăm là bao giờ). Quá 5 phút không thấy runner thì nút chuyển
  thành "Runner chưa chạy — mở máy và bật runner" thay vì để người bấm chờ vô vọng.
- **Runner giữ toàn bộ secret ở máy cá nhân** (`.dev.vars.refresh`) → file đã nằm trong
  `.gitignore` (`.dev.vars.*`); repo này PUBLIC nên đây là điều bắt buộc phải giữ đúng.
  Thêm một task kiểm `git check-ignore` trong tasks.md.
- **Token runner lộ thì người ngoài nhận được job và báo kết quả giả** → job chỉ chứa
  lệnh cố định (không nhận tham số tuỳ ý từ D1), nên kẻ tấn công nhiều nhất là làm sai
  trạng thái hiển thị, không chạy được lệnh tuỳ ý trên máy nạn nhân. Vẫn nên đổi token
  định kỳ.
- **Pipeline 40 phút, người bấm dễ tưởng treo** → tiến độ theo bước (D4) + hiện thời gian
  trung bình mỗi bước để người dùng biết bước 6 lâu là bình thường.
- **Hai nguồn cùng ghi `data/*.json` nếu GitHub mở khoá lại** → D3 chỉ chặn được job
  trong CRM, không chặn được workflow GitHub. Ghi rõ trong README: khi GitHub mở lại,
  chọn một trong hai đường, không bật cả hai.

## Migration Plan

1. Áp migration bằng `wrangler d1 migrations apply` (KHÔNG chạy tay `d1 execute --file` —
   làm thế pipeline migration kẹt vĩnh viễn mà deploy vẫn báo xanh).
2. Deploy Functions + UI. Nút hiện ra nhưng chưa có runner → UI báo "Runner chưa chạy".
3. Cài runner ở máy vận hành, đặt `REFRESH_RUNNER_TOKEN` hai đầu, chạy thử một lượt.
4. Rollback: xoá nút khỏi `index.html` và deploy lại. Bảng D1 để nguyên (không xoá dữ
   liệu), Functions để nguyên vì không ai gọi thì không chạy.

## Open Questions

- Runner chạy dạng nào: cửa sổ PowerShell mở sẵn, hay Windows Task Scheduler chạy nền
  lúc đăng nhập? Nền thì tiện hơn nhưng khó thấy log khi có sự cố. → Hỏi người dùng ở
  bước cài đặt, mặc định đề xuất Task Scheduler + ghi log ra file.
- Có cần nút "Chỉ cập nhật doanh thu" (chạy riêng bước 1, ~4 phút) bên cạnh nút chạy đủ
  8 bước không? Nhiều hôm chỉ cần số doanh thu mới. → Để sau, không làm ở lượt này.
