# GEO — Auto-index bài viết lên Google + Bing/Yandex

Sau khi publish-wp thành công, hệ thống tự động submit URL bài viết lên:
- **Google Indexing API** — submit URL để Googlebot crawl ngay (1-24h)
- **IndexNow** — Bing + Yandex + Naver index trong vài phút

Cả 2 đều **fire-and-forget** — chạy background qua `ctx.waitUntil`, không block response publish.
Kết quả lưu vào table `geo_index_log` để check debug từ UI.

> ⚠️ **Lưu ý pháp lý quan trọng về Google Indexing API:**
> Google chính thức nói API này CHỈ dành cho schema `JobPosting` và `BroadcastEvent`. Submit URL blog post là grey area — trong thực tế vẫn trigger crawl 80% trường hợp nhưng KHÔNG đảm bảo index. Rank Math Pro / Yoast Pro đang dùng cách này. Rủi ro bị Google flag SA account là thấp nhưng có. Nếu bạn không thoải mái với rủi ro này, để trống env var `GOOGLE_INDEXING_SA_JSON` thì code sẽ skip Google + chỉ ping IndexNow.

---

## Setup 1 lần — Google Indexing API

### Bước 1. Tạo Google Cloud project + enable API

1. Vào https://console.cloud.google.com
2. Tạo project mới (vd `doscom-geo-indexing`)
3. Vào **APIs & Services** → **Library** → search "Indexing API" → click Enable

### Bước 2. Tạo service account

1. Vào **IAM & Admin** → **Service Accounts** → **Create service account**
2. Name: `geo-indexing-bot`
3. Skip phần "Grant access" (không cần role IAM)
4. Click vào service account vừa tạo → tab **Keys** → **Add key** → **Create new key** → JSON
5. Download file JSON về (sẽ trông như `doscom-geo-indexing-abc123.json`)

### Bước 3. Verify domain trong Google Search Console

1. Vào https://search.google.com/search-console
2. Add property cho `doscom.vn` và `noma.vn` (chọn loại "Domain", verify qua DNS TXT record)
3. Sau khi verify, vào property → **Settings** → **Users and permissions**
4. **Add user** → email = `client_email` từ file JSON SA (vd `geo-indexing-bot@doscom-geo-indexing.iam.gserviceaccount.com`)
5. Permission = **Owner** (BẮT BUỘC Owner, Full/Restricted KHÔNG đủ)
6. Lặp lại cho cả `doscom.vn` và `noma.vn`

### Bước 4. Set env var trên Cloudflare Pages

```bash
# Lấy toàn bộ nội dung file JSON, set làm env var (encrypted)
# Trong PowerShell, dùng Bash tool vì PS hay BOM bug:
$jsonContent = Get-Content -Raw "doscom-geo-indexing-abc123.json"
# Hoặc dùng wrangler interactive (an toàn nhất):
wrangler pages secret put GOOGLE_INDEXING_SA_JSON --project-name facebookadsallinone
# Paste nội dung JSON khi prompt, Enter, Ctrl+D
```

Hoặc qua UI: dash.cloudflare.com → Pages → facebookadsallinone → Settings → Environment variables → **Production** → Add variable:
- Variable name: `GOOGLE_INDEXING_SA_JSON`
- Value: paste toàn bộ nội dung file JSON (1 chuỗi gồm `{ "type": "service_account", ... }`)
- Type: **Secret (encrypted)**

### Bước 5. Test

```bash
# Sau khi redeploy, publish 1 bài test (wp_status="publish") rồi check log:
curl -X GET "https://<your-pages-domain>/api/geo/queue?status=published&limit=1" \
  -H "Cookie: <admin-session>"

# Xem table geo_index_log trong D1:
wrangler d1 execute doscom_geo --remote --command "SELECT * FROM geo_index_log ORDER BY created_at DESC LIMIT 5"
```

`google_ok = 1` → submit thành công.

---

## Setup 1 lần — IndexNow

### Bước 1. Generate key

```bash
# Generate 1 key ngẫu nhiên 32 ký tự a-z0-9:
openssl rand -hex 16
# Vd output: a1b2c3d4e5f6789012345678901234567
```

### Bước 2. Upload key file lên CẢ 2 WP site

**doscom.vn:**
- Tạo file text tại `https://doscom.vn/<key>.txt` (vd `https://doscom.vn/a1b2c3d4e5f6789012345678901234567.txt`)
- Nội dung file = **chính xác key** (không header, không newline thừa)
- Cách dễ nhất: dùng plugin **WP File Manager** upload, hoặc FTP, hoặc plugin **Rank Math** có chỗ set IndexNow key sẵn

**noma.vn:** lặp lại với CÙNG key đó (IndexNow chấp nhận 1 key dùng cho nhiều domain)

### Bước 3. Verify key file accessible

```bash
curl https://doscom.vn/a1b2c3d4e5f6789012345678901234567.txt
# Phải trả về đúng: a1b2c3d4e5f6789012345678901234567 (không có gì khác)
curl https://noma.vn/a1b2c3d4e5f6789012345678901234567.txt
```

### Bước 4. Set env var

```
INDEXNOW_KEY = a1b2c3d4e5f6789012345678901234567
```

(Type = Plain text, không cần encrypt vì key này public anyway — file .txt trên website đã expose nó)

---

## Apply migration

```bash
cd "E:/Facebook Ads/github-repo"
wrangler d1 execute doscom_geo --remote --file migrations/0005_index_log.sql
```

---

## Verify hoạt động

Sau khi setup xong + redeploy:

1. **Manual test bằng curl:**
```bash
# Trigger publish 1 bài có status='edited':
curl -X POST https://<your-pages-domain>/api/geo/publish-wp \
  -H "Cookie: <admin>" \
  -H "Content-Type: application/json" \
  -d '{"article_id":"<uuid>","wp_status":"publish","target_site":"doscom"}'
```

2. **Check D1 log** (đợi 5-10s sau publish vì fire-and-forget):
```bash
wrangler d1 execute doscom_geo --remote \
  --command "SELECT article_id, url, google_ok, google_msg, indexnow_ok, indexnow_msg FROM geo_index_log ORDER BY created_at DESC LIMIT 1"
```

3. **Check Google Search Console** sau 1-24h:
   - URL Inspection tool → paste URL bài → "URL is on Google" hoặc "Crawled but not indexed" tuỳ
   - Coverage report → bài mới sẽ xuất hiện trong "Indexed"

4. **Check Bing Webmaster Tools** sau vài phút:
   - https://www.bing.com/webmasters → URL Inspection → URL phải hiện "Indexed"

---

## Troubleshooting

### Google Indexing API trả lỗi 403 PERMISSION_DENIED
→ Service account chưa được add làm **Owner** trong GSC property, hoặc domain chưa verify đúng. Đảm bảo:
- SA email có trong Users & Permissions của property
- Role = Owner (Full không đủ)
- Domain trong GSC = `doscom.vn` (Domain property), không phải `https://doscom.vn` (URL prefix property)

### Google trả 429 RESOURCE_EXHAUSTED
→ Default quota = 200 URL/day. Plenty cho 18 bài/tháng.

### IndexNow trả 422
→ Key file ở `https://<domain>/<key>.txt` không trả về đúng key. Check lại file có BOM/whitespace không.

### IndexNow trả 403
→ Key sai, hoặc host trong payload không match URL. Bot tự dùng host từ URL submit nên thường ok.
