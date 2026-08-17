# Runner cập nhật dữ liệu CRM

Chạy trên máy người vận hành. Nhiệm vụ: nghe nút **"Cập nhật dữ liệu"** trên trang Tổng
quan Dashboard, và khi có người bấm thì chạy 13 bước pipeline thật rồi deploy.

## Vì sao cần runner mà không chạy thẳng trên Cloudflare

Hai lý do cứng, không phải khẩu vị:

1. Pipeline là 6 script **Python**. Cloudflare Pages Functions không có runtime Python.
2. Pipeline chạy đo thật **~40 phút** (riêng `fetch_pancake_crm_contacts.py` mất ~25 phút
   để kéo 9.454 contact). Functions không chạy nổi lâu như vậy kể cả nếu viết lại bằng JS.

Ngoài ra, viết lại 6 script (~200KB) sang JS là mở lại đúng những chỗ đã từng cho ra số
sai — xem LUẬT TÍNH DỮ LIỆU trong `openspec/config.yaml`.

## Cài lần đầu

Cần sẵn trên máy: Python 3.12+, Node 20+, `wrangler` (đã đăng nhập tài khoản Cloudflare
`doscom.vietnam`), và Git Bash (cho `bash scripts/build-dist.sh`).

1. Tạo file key `.dev.vars.refresh` ở gốc repo. File này khớp pattern `.dev.vars.*` trong
   `.gitignore` nên **không bao giờ bị commit** — bắt buộc, vì repo `crm-doscom` là repo
   **public**. Kiểm lại trước khi ghi token vào:

   ```powershell
   cd C:\Users\HXDUy\jarvis-1\crm-doscom
   git check-ignore -v .dev.vars.refresh
   ```
   → PASS nếu in ra `.gitignore:5:.dev.vars.*`. Nếu không in gì thì **DỪNG**, file đang
   không được bảo vệ.

2. Nội dung file (6 key):

   ```
   FB_ACCESS_TOKEN=...
   WINDSOR_API_KEY=...
   PANCAKE_API_KEY=...
   PANCAKE_SHOP_ID=1942196207
   PANCAKE_CRM_API_KEY=...
   REFRESH_RUNNER_TOKEN=...
   ```

   Ghi chú lấy key:
   - `PANCAKE_CRM_API_KEY` **dùng chung được với `PANCAKE_API_KEY`** — đã kiểm 17/08/2026,
     key POS gọi được endpoint `/crm/Contact/records`. Không cần đi xin key CRM riêng.
   - `WINDSOR_API_KEY`: lấy ở https://onboard.windsor.ai → mục Datasources.
   - `REFRESH_RUNNER_TOKEN` phải **khớp y hệt** Pages secret cùng tên. Đổi một bên thì
     phải đổi bên kia, và Pages secret là write-only nên đổi xong phải deploy lại.

3. Chạy thử một lượt:

   ```powershell
   cd C:\Users\HXDUy\jarvis-1\crm-doscom
   .\runner\refresh-runner.ps1 -Once
   ```
   → PASS nếu thấy `Runner v1.0 khoi dong` và không có dòng `FATAL`.
   (Dấu `.\` là bắt buộc — PowerShell không tự chạy file trong thư mục hiện tại.)

## Chạy hằng ngày

**Cách 1 — mở cửa sổ để đó** (dễ nhìn log nhất, hợp lúc mới dùng):

```powershell
cd C:\Users\HXDUy\jarvis-1\crm-doscom
.\runner\refresh-runner.ps1
```

Cửa sổ này phải để mở. Đóng cửa sổ là nút trên web hết tác dụng (giao diện sẽ báo
"runner chưa chạy" sau 5 phút).

**Cách 2 — chạy nền, khởi động cùng Windows** (đang dùng, cài 17/08/2026):

Một file `.vbs` đặt ở thư mục Startup của người dùng:

```
C:\Users\HXDUy\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\crm-refresh-runner.vbs
```

Đăng nhập Windows là runner tự chạy ẩn, không hiện cửa sổ.

- **Gỡ**: xoá file `.vbs` đó.
- **Chạy ngay không cần đăng xuất**: bấm đúp vào chính file `.vbs`.
- **Kiểm đang chạy hay không**: mở giao diện CRM, nếu nút không báo "Runner chưa chạy" thì nó đang sống. Hoặc xem `runner/logs/`.

> Vì sao không dùng Task Scheduler: `Register-ScheduledTask` đòi quyền admin (`Access is denied`
> khi chạy bằng quyền thường). Thư mục Startup cho kết quả tương đương mà không cần nâng quyền.
> Nếu bạn có quyền admin và muốn dùng Task Scheduler, mở PowerShell **Run as Administrator**:
> ```powershell
> $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
>   -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Users\HXDUy\jarvis-1\crm-doscom\runner\refresh-runner.ps1"'
> Register-ScheduledTask -TaskName "CRM Doscom Refresh Runner" -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn)
> ```
> Dùng Task Scheduler thì nhớ xoá file `.vbs` ở Startup, không thì chạy 2 runner cùng lúc.

Chạy nền thì không thấy log trực tiếp — xem ở `runner/logs/`.

## Cập nhật gấp, không cần bấm nút trên web

```powershell
cd C:\Users\HXDUy\jarvis-1\crm-doscom
.\runner\refresh-runner.ps1 -RunNow
```

## Xem log

```powershell
Get-Content C:\Users\HXDUy\jarvis-1\crm-doscom\runner\logs\2026-08-17.log -Tail 50
```

Log giữ 14 ngày gần nhất, tự dọn. Log trên D1 chỉ có 2000 ký tự cuối của bước lỗi — log
đầy đủ luôn nằm ở đây.

## 13 bước pipeline

| # | Bước | Nguồn |
|---|---|---|
| 1 | Doanh thu Pancake | `fetch_pancake_revenue.py` |
| 2 | Facebook Ads | `fetch_fb_ads.py` |
| 3–6 | Google Ads: chi phí, ad-level, placement, search terms | 4 script `fetch_google_ads_*.py` |
| 7 | Google Ads context (cho agent AI) | `compute_google_ads_metrics.py` |
| 8 | Contacts CRM Pancake | `fetch_pancake_crm_contacts.py` — **lâu nhất, ~8 phút** |
| 9 | Lead → Order | `build_lead_to_order.py` |
| 10 | Ráp dashboard | `build_dashboard_data.py` |
| 11 | Kiểm landing Noma | gọi `/api/nomaXXX/stats` × 5 |
| 12 | Chạy test | `node --test tests/*.mjs` — **đỏ là dừng, không deploy** |
| 13 | Deploy | `build-dist.sh` + `wrangler pages deploy` |

Bước nào lỗi thì dừng cả pipeline, không deploy, và báo `failed` về CRM.

Thời gian đo thật (job #3, 17/08/2026): **trọn 13 bước hết 16 phút**. Con số 40 phút ước
lượng ban đầu đến từ một lượt chạy dính retry timeout của Pancake ở bước 8 — không phải mức
bình thường.

## Về bước 11 — landing Noma

Landing **không có bước lấy dữ liệu**. Chúng đẩy đơn thẳng vào D1 của CRM qua
`POST /api/nomaXXX/order`, dashboard đọc live qua `/api/nomaXXX/stats` — dữ liệu vốn đã
tươi, không phụ thuộc pipeline này.

Bước 11 kiểm **đường đẩy đơn còn sống hay không**. Đây là chỗ đã từng hỏng âm thầm: deploy
lại landing làm lệch `NOMA911_INGEST_TOKEN` → đơn ngừng về CRM, nhưng stats vẫn trả `200`
kèm số cũ nên nhìn vào không thấy gì bất thường. Landing nào không có đơn nào trong 48 giờ
sẽ bị nêu đích danh trong cảnh báo.

## Hai cảnh báo hay gặp — không phải lỗi

- **`SKIP ad-level account 764394829882083`**: tài khoản Doscom - Noma.vn có 101 campaign,
  FB trả 400 cho lời gọi `level=ad` 90 ngày. Chi phí cấp campaign **không ảnh hưởng** (đủ
  7/7 tài khoản); chỉ bảng chi tiết từng ad thiếu tài khoản này. Lỗi kinh niên, cần sửa
  riêng bằng cách chia nhỏ khoảng ngày.
- **Google Ads chỉ tới hôm kia**: Windsor.ai trễ ~2 ngày so với FB. Đúng như đã ghi trong
  `openspec/config.yaml`, không phải hỏng.

## Khi GitHub mở khoá Actions trở lại

Chọn **một** đường, đừng bật cả hai. Cron GitHub và runner cùng ghi `data/*.json` rồi cùng
deploy là đúng kiểu race đã làm hỏng workflow trước đây. Muốn quay về GitHub thì tắt Task
Scheduler của runner.

## Cloudflare Access — BẮT BUỘC làm, nếu không runner không chạy được

Kiểm ngày 17/08/2026: Access **đang bật** trên `crm-doscom.pages.dev`. Gọi
`/api/refresh/status` từ ngoài trả `302` về trang đăng nhập chứ không trả JSON. Runner
phải đi qua được Access thì mới nhận việc.

Chỉ **2 đường** cần đi qua Access: `/api/refresh/next` và `/api/refresh/report`.
Hai đường còn lại (`/request`, `/status`) do trình duyệt gọi nên vẫn nên để Access bảo vệ
— chỉ người đăng nhập được mới bấm nút, đúng như mong muốn.

**Cách 1 — Service token (khuyến nghị, không đục lỗ):**

1. Cloudflare Zero Trust → **Access → Service Auth → Create Service Token**, đặt tên
   `crm-refresh-runner`. Lưu lại `Client ID` và `Client Secret` (secret chỉ hiện MỘT lần).
2. Mở Access application của `crm-doscom.pages.dev` → **Add a policy**:
   - Action: **Service Auth**
   - Include: **Service Token** → chọn `crm-refresh-runner`
3. Thêm 2 dòng vào `.dev.vars.refresh`:
   ```
   CF_ACCESS_CLIENT_ID=<client id>.access
   CF_ACCESS_CLIENT_SECRET=<client secret>
   ```
   Runner tự gửi kèm 2 header này. Không có thì nó bỏ qua, không lỗi.

**Cách 2 — Bypass theo đường dẫn (nhanh hơn, kém chặt hơn):**

Tạo Access application mới cho đúng 2 đường `crm-doscom.pages.dev/api/refresh/next` và
`/api/refresh/report`, policy action **Bypass**, include **Everyone**. Hai endpoint này
vốn đã đòi header `X-Refresh-Token` nên vẫn không ai gọi bừa được — nhưng lớp bảo vệ chỉ
còn một, nên vẫn nên đổi token định kỳ.

⚠️ Nhớ giới hạn đã biết: một Access application chỉ chứa tối đa 5 destination.

**Kiểm sau khi cấu hình xong:**

```powershell
cd C:\Users\HXDUy\jarvis-1\crm-doscom
.\runner\refresh-runner.ps1 -Once
```
→ PASS nếu KHÔNG thấy dòng `FATAL ... Cloudflare Access chan`.
