# doscom-cron — Worker hẹn giờ đáng tin (thay GitHub schedule)

GitHub Actions `schedule` hay trễ 10 phút → vài tiếng. Worker này chạy **Cron Trigger của
Cloudflare** (đúng giờ) rồi gọi **GitHub `workflow_dispatch`** (chạy ngay) cho các workflow.

## Lịch (giờ VN, cron UTC trong wrangler.jsonc)
- **9h**  (`0 2 * * *`)  → `brand-staff-matrix.yml` (facebook-ads-dashboard) + `refresh-data.yml` (crm-doscom)
- **13h** (`0 6 * * *`)  → `refresh-data.yml`
- **15h** (`0 8 * * *`)  → `brand-staff-matrix.yml`
- **17h** (`0 10 * * *`) → `refresh-data.yml`

## Cài đặt (1 lần)
1. Tạo **fine-grained PAT** ở GitHub → Settings → Developer settings → Fine-grained tokens:
   - Repository access: chọn cả `hxduy93/facebook-ads-dashboard` và `hxduy93/crm-doscom`.
   - Permissions → **Actions: Read and write**.
2. Set secret + deploy:
   ```bash
   cd cron-worker
   npx wrangler deploy
   npx wrangler secret put GH_PAT        # dán PAT vừa tạo
   npx wrangler secret put TRIGGER_KEY   # dán 1 chuỗi ngẫu nhiên bất kỳ
   ```
3. Test tay (không cần đợi tới giờ):
   ```
   GET https://doscom-cron.<subdomain>.workers.dev/?key=<TRIGGER_KEY>&cron=0%202%20*%20*%20*
   ```
   → trả JSON, mỗi workflow `ok:true` (GitHub dispatch trả 204) là chạy được.

## Sau khi Worker chạy ổn
Xoá khối `schedule:` trong 2 workflow (`brand-staff-matrix.yml`, `refresh-data.yml`) — giữ
`workflow_dispatch:` — để tránh chạy trùng (Cloudflare cron + GitHub schedule trễ). Worker này
trở thành bộ hẹn giờ duy nhất.
