# AGENTS.md — CRM Doscom

> File này được AI coding agent (Antigravity, và các tool theo chuẩn AGENTS.md) tự đọc mỗi phiên.
> Mục tiêu: AI luôn nhận diện đúng dự án trước khi viết code, kể cả khi KHÔNG gọi lệnh /opsx.

## Dự án này dùng OpenSpec (spec-driven)

**BẮT BUỘC trước khi tạo/sửa bất kỳ code nào trong `functions/`:**
1. Đọc `openspec/config.yaml` (mục `context:`) — hiến pháp dự án: tech stack, quy ước API, red lines, **luật tính dữ liệu** (đã từng sai).
2. Đọc spec của agent liên quan trong `openspec/specs/<tên>/spec.md` để biết contract hiện có → **TÁI DÙNG, không viết trùng**.
3. Nếu phát hiện mâu thuẫn/định làm trùng → DỪNG, báo người dùng trước khi code.

## Tự kiểm tra sau khi viết/sửa code (BẮT BUỘC)
1. Sau khi sửa code, TỰ chạy bộ kiểm: `node --test tests/` — đọc kết quả.
2. Nếu ĐỎ → tự sửa, chạy lại cho tới khi XANH mới báo "xong". KHÔNG giao code chưa kiểm.
3. Nếu phần vừa làm có tính toán dữ liệu mà chưa có test → viết thêm test trong `tests/` theo đúng LUẬT TÍNH DỮ LIỆU ở `openspec/config.yaml`.
4. Phát hiện MÂU THUẪN (phần mới khác khuôn/cách tính của phần đã có, hoặc trái luật trong config) → DỪNG, nêu rõ "A đang thế này, B yêu cầu thế kia" và HỎI người dùng cái nào đúng. KHÔNG tự ý chọn rồi code tiếp.

## Thay đổi đáng kể → đi qua workflow OpenSpec
- `/opsx:propose "<mô tả>"` — tạo đề xuất (proposal + design + tasks) để duyệt TRƯỚC khi code.
- `/opsx:apply` — thực thi theo tasks.
- `/opsx:sync` — cập nhật contract mới vào `openspec/specs/`.
- `/opsx:archive` — lưu trữ change đã xong.
- `/opsx:explore` — phân tích/đối chiếu code với spec.

## Các agent đã có (chi tiết ở openspec/specs/)
- `agent-fb-ai` · `agent-google-ai` · `agent-weekly-ai` · `noma911-orders` · `agent-geo`

## Vài red line nhanh (đầy đủ ở openspec/config.yaml)
- Secret qua `env`, KHÔNG hard-code. Claude qua AI Gateway `doscom-erp` + kill switch `USE_CLAUDE`.
- Endpoint ghi dữ liệu phải có token. Đổi schema D1 → thêm `migrations/000X_*.sql`.
- KHÔNG bịa số liệu. Trả lời người dùng: tiếng Việt.
