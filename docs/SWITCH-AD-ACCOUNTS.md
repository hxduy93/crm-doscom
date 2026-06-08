# Đổi / Thêm / Bớt tài khoản quảng cáo Facebook (mapping tkqc)

> Hướng dẫn tuần tự để cập nhật tài khoản quảng cáo (tkqc) khi **đổi agency**,
> **thêm** hoặc **bớt** tkqc. Làm đúng các bước, không cần đụng code.

## TL;DR — cơ chế

Mọi thứ về tkqc nằm ở **MỘT nơi duy nhất**: khối `account_to_groups` trong
[`data/fb-config.json`](../data/fb-config.json). Đây là **sổ đăng ký** — cả
script kéo dữ liệu (`scripts/fetch_fb_ads.py`) lẫn backend (dashboard, agent AI)
đều đọc từ đây.

> Đổi tkqc = **sửa 1 file này → chạy validate → push → chạy workflow fetch**. Hết.

Mỗi tkqc là 1 khối như sau:

```json
"<ID_TKQC_15-16_CHỮ_SỐ>": {
  "name": "Tên hiển thị (tự đặt cho dễ đọc)",
  "staff": "DUY",
  "groups": ["NOMA"],
  "active": true,
  "products_note": "Ghi chú sản phẩm (tùy ý)"
}
```

| Field | Bắt buộc | Giá trị hợp lệ |
|---|---|---|
| `name` | nên có | chuỗi bất kỳ (tên tkqc cho dễ nhận) |
| `staff` | ✅ | `DUY` \| `PHUONG_NAM` \| `AI_AGENT` |
| `groups` | ✅ | mảng con của `MAY_DO`, `CAMERA_VIDEO_CALL`, `GHI_AM`, `NOMA`. **1 tkqc chạy nhiều SP → liệt kê nhiều nhóm** |
| `active` | tùy | `true` = fetch dữ liệu; `false` = ngừng fetch nhưng giữ lịch sử |
| `products_note` | tùy | ghi chú |
| `loaned_to_staff` + `loaned_from_date` | tùy | dùng khi cho mượn tkqc sang nhân sự khác (xem cuối file) |

---

## CHUẨN BỊ (chỉ làm 1 lần mỗi máy)

Mở **PowerShell** (không phải cmd), về đúng thư mục repo:

```powershell
cd "C:\Users\HXDUy\facebook-ads-dashboard"
git status
```
→ PASS nếu thấy `On branch ...` và không báo "not a git repository".

> ⚠ Nếu báo `fatal: not a git repository` → bạn đang sai thư mục. Kiểm tra lại đường dẫn (thư mục phải chứa folder ẩn `.git`).

---

## QUY TRÌNH ĐỔI AGENCY (thay toàn bộ tkqc)

### Bước 1 — Lấy thông tin tkqc mới từ agency

Với **mỗi** tkqc mới, ghi ra giấy 3 thứ:
1. **ID tkqc** — dãy số 15-16 chữ số. Lấy ở Business Manager → Trình quản lý quảng cáo, hoặc Cài đặt doanh nghiệp → Tài khoản quảng cáo.
   - ⚠ Chỉ lấy **phần số**, KHÔNG kèm tiền tố `act_`. Ví dụ đúng: `1234567890123456`.
2. **Nhân sự phụ trách**: `DUY` hay `PHUONG_NAM`.
3. **Nhóm sản phẩm** chạy trên tkqc đó (1 hoặc nhiều): `MAY_DO`, `CAMERA_VIDEO_CALL`, `GHI_AM`, `NOMA`.

### Bước 2 — Đảm bảo Access Token có quyền trên tkqc mới (QUAN TRỌNG)

Dữ liệu kéo về bằng GitHub Secret **`FB_ACCESS_TOKEN`**. Token này phải thuộc
một tài khoản Facebook **có quyền truy cập các tkqc mới** (thường là tài khoản
được agency mới add vào, hoặc tài khoản trong Business Manager của bạn được
agency share quyền).

- Nếu đổi agency → gần như chắc chắn phải **lấy token mới**. Xem
  [ONBOARDING.md](../ONBOARDING.md) (mục FB token) để tạo Long-lived token, rồi:

```powershell
gh secret set FB_ACCESS_TOKEN
```
→ Dán token khi được hỏi, Enter. PASS nếu thấy `✓ Set secret FB_ACCESS_TOKEN`.

> Token Long-lived hết hạn ~60 ngày → nhớ gia hạn định kỳ.

### Bước 3 — Sửa sổ đăng ký `data/fb-config.json`

Mở file bằng VSCode (hoặc Notepad):

```powershell
code data\fb-config.json
```
> Nếu báo `'code' is not recognized` → dùng: `notepad data\fb-config.json`

Trong khối `account_to_groups`:
- **Xóa** các khối tkqc cũ không còn dùng (hoặc đổi `"active": false` nếu muốn giữ lịch sử nhưng ngừng fetch).
- **Thêm** khối cho từng tkqc mới theo mẫu ở phần TL;DR.

Ví dụ — agency mới cấp 2 tkqc, 1 trong đó chạy 2 sản phẩm:

```json
"account_to_groups": {
  "1234567890123456": {
    "name": "Agency Mới - TK chính",
    "staff": "DUY",
    "groups": ["MAY_DO", "GHI_AM"],
    "active": true,
    "products_note": "D1 + DR1 chạy chung 1 tkqc"
  },
  "9876543210987654": {
    "name": "Agency Mới - TK Noma",
    "staff": "PHUONG_NAM",
    "groups": ["NOMA"],
    "active": true,
    "products_note": "Noma 911"
  }
}
```

> 💡 **1 tkqc nhiều sản phẩm**: cứ liệt kê nhiều nhóm trong `groups`. Hệ thống
> tách **chi tiêu theo TÊN CAMPAIGN** (xem mục "Đặt tên campaign" bên dưới) nên
> vẫn quy được spend về đúng từng sản phẩm.

### Bước 4 — Kiểm tra cấu hình (bắt lỗi trước khi push)

```powershell
python scripts\validate_fb_config.py
```
→ **PASS** nếu dòng cuối là `✓ PASS — config hợp lệ`.
→ **FAIL** nếu thấy `✗ ... LỖI` — đọc từng lỗi, sửa trong file, chạy lại đến khi PASS. (Cảnh báo ⚠ không chặn, nhưng nên xem.)

### Bước 5 — Lưu lên GitHub

```powershell
git add data\fb-config.json
git commit -m "chore: cap nhat tkqc agency moi"
git push
```
→ PASS nếu dòng cuối có `main -> main` (hoặc tên nhánh của bạn).
→ Nếu báo `no upstream branch` (nhánh mới lần đầu): `git push -u origin <ten-nhanh>`.
→ Nếu báo `index.lock`: đóng VSCode/GitHub Desktop rồi `Remove-Item .git\index.lock -Force`, push lại.

### Bước 6 — Kéo dữ liệu ngay (không chờ 3 tiếng)

```powershell
gh workflow run "Fetch FB Ads Insights"
```
→ PASS nếu thấy `✓ Created workflow_dispatch event`.

Chờ ~1 phút rồi xem kết quả:
```powershell
gh run list --workflow=fetch-fb-ads.yml --limit 3
```
→ PASS nếu run mới nhất `completed  success`.
→ Nếu `failure`: xem log `gh run view --log-failed` — thường do token sai quyền hoặc ID tkqc sai (xem Troubleshooting).

### Bước 7 — Xác nhận dữ liệu đã về

```powershell
git pull
python -c "import json,io,sys; sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8'); d=json.load(open('data/fb-ads-data.json',encoding='utf-8')); print('generated_at:',d['generated_at']); [print(' ',a['account_id'],'spend',round(a['summary']['spend']),'camps',len(a['campaigns'])) for a in d['accounts']]"
```
→ PASS nếu `generated_at` là thời điểm vừa rồi và các tkqc mới có spend/campaign > 0 (tkqc chưa chạy thì 0 là bình thường).

**XONG.** Dashboard và agent AI tự dùng tkqc mới từ lúc này.

---

## CÁC TÌNH HUỐNG KHÁC (nhanh)

### Thêm 1 tkqc mới (giữ nguyên cái cũ)
Chỉ làm **Bước 3** (thêm 1 khối) → **4** (validate) → **5** (push) → **6** (fetch). Đảm bảo token có quyền trên tkqc đó (Bước 2).

### Bớt / ngừng 1 tkqc
- Muốn **giữ lịch sử**: đổi `"active": true` → `"active": false`. Ngừng fetch, dữ liệu cũ vẫn còn.
- Muốn **xóa hẳn**: xóa cả khối tkqc đó.
- Rồi validate → push (không cần chạy fetch ngay cũng được).

### Đổi nhân sự phụ trách 1 tkqc
Sửa field `"staff"` → validate → push. (Lịch sử trước đó vẫn quy về nhân sự cũ theo dữ liệu đã lưu.)

### Cho mượn tkqc tạm thời (loan)
Thêm 2 field vào khối tkqc:
```json
"loaned_to_staff": "AI_AGENT",
"loaned_from_date": "2026-05-29"
```
→ Spend **trước** ngày đó tính cho `staff` gốc; **từ** ngày đó tính cho người mượn. Khôi phục: xóa 2 field này.

---

## ĐẶT TÊN CAMPAIGN ĐỂ TÁCH SPEND ĐÚNG (đọc kỹ nếu 1 tkqc nhiều SP)

Hệ thống tách chi tiêu theo **tên campaign**. Để quy spend về đúng sản phẩm,
tên campaign phải **chứa mã sản phẩm**. Convention hiện tại (nhận diện tự động):

| Sản phẩm | Từ khóa trong tên campaign | Nhóm |
|---|---|---|
| Máy dò D1 | `D1` (vd `12/4 - D1 - 5 video`) | MAY_DO |
| Máy ghi âm DR1 | `DR1` | GHI_AM |
| Camera DA8.1 | `DA8.1` / `Da8.1` | CAMERA_VIDEO_CALL |
| Noma 911/922 | `Noma 911`, `Noma 922`, hoặc chứa `noma` | NOMA |

> ⚠ Nếu agency mới **đặt tên campaign theo quy ước KHÁC** (vd dùng mã lạ), spend
> sẽ rơi vào "unclassified" và không tách được theo nhóm. Khi đó báo Claude cập
> nhật `FB_PRODUCT_DETECT` + `FB_PRODUCT_TO_GROUP` trong
> [`functions/lib/fbAdsHelpers.js`](../functions/lib/fbAdsHelpers.js) (thêm vài
> dòng regex). Cách kiểm tra nhanh tỉ lệ unclassified: xem field
> `fb_spend_unclassified` trong kết quả profit — nên < ~5% tổng spend.

---

## TROUBLESHOOTING

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Workflow `failure`, log có `Missing FB_ACCESS_TOKEN` | Secret chưa set | Bước 2 |
| Log có `(#190)` / `OAuthException` / `expired` | Token sai quyền hoặc hết hạn | Lấy token mới có quyền trên tkqc mới (Bước 2) |
| Log có `Unsupported get request` / `does not exist` | ID tkqc sai (kèm `act_`, thiếu/thừa số) | Sửa ID trong fb-config.json (chỉ phần số) |
| tkqc mới spend = 0 nhưng đã chạy QC | Token không thấy tkqc đó, hoặc tkqc chưa có chi tiêu trong 90 ngày | Kiểm tra quyền token trên BM |
| Profit/nhóm SP lệch nhiều | Tên campaign không khớp convention | Xem mục "Đặt tên campaign" |
| `validate` báo "ID bị khai báo TRÙNG" | Dán 2 lần cùng 1 ID | Xóa khối thừa |

---

*Liên quan: [ONBOARDING.md](../ONBOARDING.md) · script fetch:
[`scripts/fetch_fb_ads.py`](../scripts/fetch_fb_ads.py) · validate:
[`scripts/validate_fb_config.py`](../scripts/validate_fb_config.py)*
