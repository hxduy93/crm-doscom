# Hermes Chat — Setup trên CRM Doscom

Port từ `facebookadsallinone` (2026-06-24). Chat agent hỏi-đáp dữ liệu FB Ads / KPI /
GEO ngay trong CRM. Claude Haiku 4.5 qua AI Gateway `doscom-erp` + fastpath rule-based
skip LLM cho query đơn giản (~60% → $0).

## Kiến trúc

```
Widget nổi (FAB) trên mọi trang   hermes-widget.js  (inject vào index.html)
hoặc trang riêng                   agent-hermes-chat.html
    ↓
POST /api/hermes/chat              functions/api/hermes/chat.js
    ↓
┌─ Step 1: Fastpath rule-based ──────┐  → tool trực tiếp, SKIP LLM, $0
│ "spend [staff] [time]", "kpi", "geo"│
└─────────────────────────────────────┘
    ↓ (không match)
┌─ Step 2: LLM agent loop (tool-use) ─┐  → Claude Haiku 4.5 (gateway doscom-erp)
│ Max iter 5 · max_tokens 600 · sanity│
└─────────────────────────────────────┘
    ↓
Persist D1 crm-doscom-db (hermes_sessions/messages/FTS5/user_prefs)
```

## Khác biệt so với bản facebookadsallinone

| Hạng mục | facebookadsallinone | CRM Doscom (bản này) |
|---|---|---|
| Auth | cookie `doscom_session` + `SESSION_SECRET` (`_middleware.js`) | `getIdentity()` (Cloudflare Access) — CRM đang public → khoá chung `public@crm-doscom` |
| D1 | `doscom_geo` | `crm-doscom-db` (binding `DB`) |
| Migration | `0006_hermes_chat.sql` | `0008_hermes_chat.sql` |
| LLM | Gemini→Claude hybrid | Claude Haiku 4.5 only (đồng bộ agent CRM) |
| GEO queue | đọc field `articles` | đọc field `items` (shape `/api/geo/queue` của CRM) |
| Kill switch | — | tôn trọng `USE_CLAUDE=false` (chỉ giữ fastpath) |

## Ops cần làm

### 1. Secret (1 lần)
| Tên | Loại | Đã có? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Secret | Cần verify đã set cho project `crm-doscom` |
| `CF_ACCOUNT_ID` | Var (wrangler.toml) | ✅ |

Verify/nạp secret:
```
npx wrangler pages secret list --project-name crm-doscom
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name crm-doscom   # nếu thiếu
```
KV `INVENTORY` + binding `AI` đã có sẵn trong `wrangler.toml` → không cần thêm.

### 2. Deploy
Push lên `master` → GitHub Actions ([deploy.yml](../.github/workflows/deploy.yml)) tự:
1. Copy `hermes-widget.js` + `agent-hermes-chat.html` vào `dist/`.
2. **Apply migration** `0008_hermes_chat.sql` vào `crm-doscom-db` (`wrangler d1 migrations apply --remote`).
3. Deploy Pages.

→ Không cần chạy migration bằng tay; bước apply là idempotent.

### 3. Test sau deploy
1. Mở https://crm-doscom.pages.dev → bấm nút 💬 góc phải dưới.
2. Chip "PN tháng này" → response có số + footer `provider: fastpath` ($0).
3. Câu phức tạp "so sánh spend DUY vs PN tháng này" → `provider: claude-haiku-4-5`.

## Tool registry (read-only)
`get_fb_spend` · `get_fb_staff_spend` · `get_kpi_status` · `get_geo_queue` ·
`search_past_chats` · `remember_preference`.

## Kiểm thử
`node --test` (auto-discovery; Node 24 không nhận `node --test tests/`). Test offline ở
[tests/hermes.test.mjs](../tests/hermes.test.mjs) kiểm `sanityCheck` — chống bịa số.

## Pitfalls
1. Fastpath chỉ match regex đơn giản — câu phức tạp rơi vào LLM.
2. Sanity check chỉ soi số VND/đ — không catch claim dạng text.
3. D1 trên Pages không CASCADE — code DELETE messages trước session.
4. Multi-user: hiện mọi người chia sẻ session chung (public). Bật Cloudflare Access →
   `getIdentity` trả email thật → tự tách session theo từng user, không cần sửa code.
```
