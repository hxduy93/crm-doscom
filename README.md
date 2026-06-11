# CRM Doscom

Giao diện vận hành **độc lập** với dashboard cũ (facebookadsallinone) — tách riêng để cập nhật của dashboard cũ không ảnh hưởng giao diện mới.

- `index.html` — trang **Tổng quan** (khung modular): KPI thật, biểu đồ, ô "➕ thêm module".
- `data/` — **bản sao (snapshot)** dữ liệu thật từ dashboard cũ. Trang đọc cùng origin nên hiện số thật, không cần CORS.
- Thiết kế: Nunito bo tròn, sáng/tối, responsive.

## Số liệu (snapshot hiện tại)
Chi tiêu QC, doanh thu giao TC, ROAS gộp, tổng đơn, Google grade, lead→đơn — lấy từ `data/*.json` thật.

## Hướng phát triển
- [ ] Tự đồng bộ `data/` định kỳ từ repo cũ (GitHub Action) → số luôn mới mà vẫn tách biệt.
- [ ] Nhét dần các module cũ vào 2 ô slot: bảng theo nhân sự, theo nhóm SP, lãi lỗ, khách hàng…
- [ ] Deploy Cloudflare Pages → `crm-doscom.pages.dev`.

## Chạy thử cục bộ
Cần server (vì fetch /data): `python -m http.server 8125` rồi mở http://127.0.0.1:8125/
