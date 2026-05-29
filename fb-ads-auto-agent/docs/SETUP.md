# SETUP — FB Ads Auto Agent

Trước khi deploy, bạn cần chuẩn bị 5 thứ:

## 1. Ad Account FB riêng

- Tạo (hoặc dùng sẵn) 1 ad account **CHỈ dùng cho test agent này**.
- Ghi lại `ad_account_id` dạng `act_xxxxxxxxxxxxx`.
- **KHÔNG** dùng các account production của Doscom (`1449385949897024`, `927390616363424`, `1655506672244826`, `764394829882083`, `906015559004892`, `1416634670476226`, `1418124406240173`).

## 2. Meta System User Token (long-lived, KHÔNG hết hạn)

Khác user token (60 ngày) hiện đang dùng cho Doscom dashboard, **System User token** không hết hạn — bắt buộc cho automation 24/7.

### Tạo System User
1. Vào **Business Settings** (https://business.facebook.com/settings)
2. Sidebar trái → **Users** → **System Users** → bấm **Add**
3. Tên: `fb-ads-auto-agent`, role: **Admin** (cần để pause + update budget)
4. Click vào system user vừa tạo → tab **Assigned Assets** → **Add Assets** → chọn ad account ở bước 1, cấp quyền **Manage Performance**

### Generate Token
1. Vẫn ở trang system user → **Generate New Token**
2. Chọn app FB của bạn (nếu chưa có, tạo app tại https://developers.facebook.com/apps)
3. Permissions cần tick:
   - `ads_management`
   - `ads_read`
   - `business_management`
   - `read_insights`
4. Token expiration: **Never** (long-lived)
5. **Copy token và lưu an toàn** — không hiển thị lại sau khi đóng dialog

### Verify token
```bash
curl "https://graph.facebook.com/v21.0/me/adaccounts?access_token=YOUR_TOKEN"
```
Phải trả về ad account của bạn.

## 3. Anthropic API Key (Haiku 4.5)

- Vào https://console.anthropic.com/settings/keys
- Tạo key mới, copy `sk-ant-...`
- Đảm bảo billing đã enable (Haiku 4.5 ~$0.04/ngày với cấu hình hiện tại)

## 4. Cloudflare resources

Đảm bảo đang login đúng account `doscom.vietnam@gmail.com`:
```powershell
npx wrangler whoami
```

### Tạo D1 database
```powershell
npx wrangler d1 create fb_agent_decisions
```
Copy `database_id` vào `wrangler.toml`.

### Tạo KV namespace
```powershell
npx wrangler kv namespace create FB_AGENT_KV
```
Copy `id` vào `wrangler.toml`.

## 5. Gmail notification

Hiện dùng **MailChannels** (free trên Cloudflare Workers) gửi từ địa chỉ `doscom.vietnam@gmail.com`. Không cần app password.

Nếu muốn dùng Gmail SMTP thật:
- Vào https://myaccount.google.com/apppasswords
- Tạo app password cho "Mail" → "Other (Custom name)" → `fb-ads-auto-agent`
- Set qua `wrangler secret put GMAIL_APP_PASSWORD`
- (Sẽ cần đổi `gmail-notifier.ts` sang SMTP thật.)

---

## Triển khai lần đầu

```powershell
cd "E:\Facebook Ads\github-repo\fb-ads-auto-agent"

# 1. Cài deps
npm install

# 2. Copy template → wrangler.toml và điền IDs
Copy-Item wrangler.toml.example wrangler.toml
# Mở wrangler.toml, paste AD_ACCOUNT_ID + database_id + kv id

# 3. Init D1 schema
npm run d1:init:remote

# 4. Set secrets (LƯU Ý: dùng Bash, không PowerShell — theo memory PS thêm BOM)
# Mở Git Bash:
printf '%s' 'YOUR_SYSTEM_USER_TOKEN' | npx wrangler secret put FB_SYSTEM_USER_TOKEN
printf '%s' 'sk-ant-…' | npx wrangler secret put ANTHROPIC_API_KEY

# 5. Deploy
npm run deploy

# 6. Test thủ công (lấy 8 ký tự cuối của ANTHROPIC_API_KEY làm key)
curl "https://fb-ads-auto-agent.YOUR_SUBDOMAIN.workers.dev/run?key=LAST8CHARS"

# 7. Xem log
npm run tail
```

## Killswitch (tắt nóng từ xa)

```powershell
# Bật killswitch (agent sẽ skip mọi run)
npx wrangler kv key put --binding=AGENT_KV AGENT_KILLSWITCH 1 --remote

# Tắt killswitch (agent chạy lại)
npx wrangler kv key delete --binding=AGENT_KV AGENT_KILLSWITCH --remote
```

## Toggle Shadow mode (chỉ log, không execute)

Sửa biến `SHADOW_MODE` trong `wrangler.toml` rồi `npm run deploy`,
HOẶC set qua Cloudflare dashboard → Worker → Settings → Variables → SHADOW_MODE = "true"
