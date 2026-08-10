# CRM Doscom

Giao diện vận hành + **nhà máy dữ liệu** của Doscom.

- `index.html` — trang **Tổng quan** (khung modular): KPI thật, biểu đồ, ô "➕ thêm module".
- `data/` — dữ liệu thật do chính repo này sinh ra (xem *Pipeline dữ liệu*). Trang đọc cùng origin nên hiện số thật, không cần CORS.
- Thiết kế: Nunito bo tròn, sáng/tối, responsive.

## Pipeline dữ liệu

Từ 2026-08-10 phần **lấy dữ liệu** được gộp từ repo cũ `facebook-ads-dashboard` về đây, để CRM không còn phụ thuộc repo đó nữa.

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

### Công tắc `DATA_PIPELINE_ENABLED`

Cụm workflow lấy dữ liệu chỉ chạy khi repo variable `DATA_PIPELINE_ENABLED = 1`.

- Chưa bật → `refresh-data.yml` chạy đường **cũ**: `scripts/refresh_data.py` đi copy dữ liệu từ repo `facebook-ads-dashboard`.
- Bật → mọi thứ tự làm tại repo này, không đụng repo cũ nữa.

```bash
# nạp secret (lấy giá trị từ nơi bạn đang giữ / tạo lại ở từng dịch vụ)
gh secret set PANCAKE_API_KEY      -R hxduy93/crm-doscom
gh secret set PANCAKE_SHOP_ID      -R hxduy93/crm-doscom
gh secret set PANCAKE_CRM_API_KEY  -R hxduy93/crm-doscom
gh secret set FB_ACCESS_TOKEN      -R hxduy93/crm-doscom
gh secret set WINDSOR_API_KEY      -R hxduy93/crm-doscom

# rồi bật công tắc
gh variable set DATA_PIPELINE_ENABLED --body 1 -R hxduy93/crm-doscom
```

Đối chiếu số trước/sau khi bật: `python scripts/compare_dashboard_data.py` (so file vừa ráp với bản repo cũ đang chạy).

## Chạy thử cục bộ
Cần server (vì fetch /data): `python -m http.server 8125` rồi mở http://127.0.0.1:8125/
