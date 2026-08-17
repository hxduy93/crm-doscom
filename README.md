# CRM Doscom

Giao diện vận hành + **nhà máy dữ liệu** của Doscom.

- `index.html` — trang **Tổng quan** (khung modular): KPI thật, biểu đồ, ô "➕ thêm module".
- `data/` — dữ liệu thật do chính repo này sinh ra (xem *Pipeline dữ liệu*). Trang đọc cùng origin nên hiện số thật, không cần CORS.
- Thiết kế: Nunito bo tròn, sáng/tối, responsive.

## Pipeline dữ liệu

Từ 2026-08-10 repo này **tự lấy dữ liệu**, không còn phụ thuộc repo `facebook-ads-dashboard` (đã xoá — toàn bộ 7.808 commit + code dashboard cũ nằm ở nhánh **`legacy-fb-ads-dashboard`** của chính repo này, xem bằng `git checkout legacy-fb-ads-dashboard`).

| Workflow | Lịch | Script | Ra file |
|---|---|---|---|
| `fetch-pancake.yml` | 30' một lần, 10–17h VN | `fetch_pancake_revenue.py` | `data/product-revenue.json` |
| `build-lead-to-order.yml` | 30' một lần, 10–18h VN | `fetch_pancake_crm_contacts.py` → `build_lead_to_order.py` | `data/lead-to-order.json` |
| `fetch-fb-ads.yml` | 3h một lần | `fetch_fb_ads.py` | `data/fb-ads-data.json` |
| `fetch-google-ads.yml` | 30' một lần | `fetch_google_ads_spend.py` | `data/google-ads-spend.json` |
| `fetch-google-ads-ads.yml` | 1h một lần | `fetch_google_ads_ads.py` | `data/google-ads-ads.json` |
| `fetch-google-ads-placement.yml` | 1h một lần | `fetch_google_ads_placement.py` | `data/google-ads-placement.json` |
| `fetch-google-ads-search-terms.yml` | 1h một lần | `fetch_google_ads_search_terms.py` | `data/google-ads-search-terms.json` |
| `compute-google-ads-context.yml` | 30' một lần | `compute_google_ads_metrics.py` | `data/google-ads-context.json` |
| `update-product-costs.yml` | bấm tay | `build_product_costs.py` | `data/product-costs.json` |
| `refresh-data.yml` | 9h/13h/17h VN (Cron Worker gọi) | `build_dashboard_data.py` | `data/dashboard-data.json` + deploy |

`build_dashboard_data.py` là bước cuối: gọi FB Graph API lấy insights rồi ráp chung với các file trên
thành `data/dashboard-data.json` — file **duy nhất** mà giao diện đọc.

### Secret cần có

```bash
gh secret set PANCAKE_API_KEY      -R hxduy93/crm-doscom   # đọc đơn POS
gh secret set PANCAKE_SHOP_ID      -R hxduy93/crm-doscom   # 1942196207
gh secret set PANCAKE_CRM_API_KEY  -R hxduy93/crm-doscom   # đọc CRM contacts (lead)
gh secret set FB_ACCESS_TOKEN      -R hxduy93/crm-doscom   # FB Marketing API
gh secret set WINDSOR_API_KEY      -R hxduy93/crm-doscom   # Google Ads qua Windsor.ai
```

Thiếu secret nào thì workflow tương ứng **đỏ và dừng**, KHÔNG ghi đè dữ liệu cũ —
đã có guard ở cả 3 chỗ (FB insights rỗng, Pancake fetch lỗi/tụt >50%, CRM contacts thiếu).
Kiểm token FB trước khi nạp: `FB_TOKEN=EAA... node scripts/fb-token-check.mjs`.

## Nút "Cập nhật dữ liệu" (đường bấm tay)

⚠️ **Từ 15/08/2026 bảng workflow ở trên KHÔNG chạy**: GitHub khoá Actions toàn tài khoản
`hxduy93` (mọi dispatch trả `422 Actions has been disabled for this user`). Dữ liệu đứng
3 ngày mà không có dấu hiệu gì trên giao diện.

Đường thay thế: nút **"Cập nhật dữ liệu"** ở thanh trên cùng trang Tổng quan. Bấm nút ghi
một yêu cầu vào D1; **runner** chạy trên máy người vận hành nhận việc rồi chạy 13 bước
pipeline thật + deploy. Cài đặt và vận hành: [`runner/README.md`](runner/README.md).

Kèm theo đó, ô "cập nhật …" cạnh nút nay **đổi màu theo tuổi dữ liệu** (dưới 24h bình
thường / 24–72h vàng / trên 72h đỏ) — để lần sau dữ liệu đứng thì nhìn là biết ngay.

**Khi GitHub mở khoá Actions trở lại: chọn MỘT đường, đừng bật cả hai.** Cron GitHub và
runner cùng ghi `data/*.json` rồi cùng deploy là đúng kiểu race đã làm hỏng workflow trước
đây. Quay về GitHub thì tắt Task Scheduler của runner trước.

## Chạy thử cục bộ
Cần server (vì fetch /data): `python -m http.server 8125` rồi mở http://127.0.0.1:8125/
