# Hermes Chat — Setup Guide (Phase 1 — hybrid free)

Chat agent kiểu Hermes tích hợp dashboard. Hybrid LLM: **Gemini 2.5 Flash free** primary + **Claude Haiku 4.5** fallback. Có fastpath rule-based skip LLM cho query đơn giản.

## Kiến trúc

```
Browser tab "💬 Hermes Chat"          agent-hermes-chat.html
    ↓
POST /api/hermes/chat                 functions/api/hermes/chat.js
    ↓
┌─ Step 1: Fastpath rule-based ──────┐
│ Match regex "spend [staff] [time]", "kpi", "geo [status]"
│ → Gọi tool trực tiếp, format template, RETURN. SKIP LLM. $0.
└─────────────────────────────────────┘
    ↓ (nếu không match)
┌─ Step 2: LLM agent loop (tool-use) ─┐
│ Default: Gemini 2.5 Flash (FREE 1500 req/ngày)
│ Fallback: Claude Haiku 4.5 ($0.003/conv) khi Gemini rate limit
│ Max iter: 5 · max_tokens: 600 · sanity check regex
└─────────────────────────────────────┘
    ↓
Persist D1 hermes_messages + sessions + FTS5
```

## Setup ops — 5 bước

### Bước 1: Apply migration

D1 binding `DB` → database `doscom_geo` (cùng database GEO).

1. Cloudflare dashboard → **Workers & Pages → D1 → `doscom_geo`** → tab **Console**
2. Copy toàn bộ `migrations/0006_hermes_chat.sql` → paste → **Execute**
3. Verify: `SELECT name FROM sqlite_master WHERE name LIKE 'hermes_%';` → 4 tên: `hermes_sessions`, `hermes_messages`, `hermes_messages_fts`, `hermes_user_prefs`.

### Bước 2: Verify env vars

| Tên | Loại | Lý do | Đã có sẵn? |
|---|---|---|---|
| `GEMINI_API_KEY` | Secret | Default LLM (FREE) | ✅ (GEO Monitor đã dùng) |
| `ANTHROPIC_API_KEY` | Secret | Fallback Claude Haiku | ✅ |
| `CF_ACCOUNT_ID` | Plain | AI Gateway URL | ✅ |
| `SESSION_SECRET` | Secret | HMAC auth | ✅ |

→ Nếu GEO Content đã chạy production, **không cần thêm secret nào mới**.

### Bước 3: Nạp credit Anthropic (tùy chọn, cho fallback)

Gemini free tier 1,500 req/ngày là **dư cho scale của bạn** (10-50 conv/ngày). Nhưng nếu sợ burst:
- Vào https://console.anthropic.com → Billing → Add credit
- Nạp $5-10 (đủ ~1,500-3,000 fallback request với Haiku 4.5)
- Không nạp → khi Gemini rate limit, chat sẽ trả lỗi

### Bước 4: Deploy

Push các file sau lên main:
```
migrations/0006_hermes_chat.sql
functions/lib/hermesAgent.js          # hybrid LLM, sanity check
functions/lib/hermesTools.js          # 6 read-only tools
functions/lib/hermesFastpath.js       # rule-based skip LLM
functions/api/hermes/chat.js          # entry endpoint
functions/api/hermes/sessions.js
functions/api/hermes/history.js
agent-hermes-chat.html
template.html                          # tab nav
index.html                             # tab nav
```

Cloudflare Pages auto-deploy.

### Bước 5: Test

1. Mở dashboard → tab **💬 Hermes Chat**
2. Click chip "Spend Phương Nam tháng này"
3. Verify response:
   - Có số liệu cụ thể
   - Footer hiển thị `provider: fastpath` (skip LLM, $0)
4. Hỏi câu phức tạp "phân tích trend campaign Noma 911 30 ngày qua và đề xuất action"
   - Footer hiển thị `provider: gemini` ($0) hoặc `claude` ($0.003)

## Chi phí thực tế

| Loại query | Tỷ lệ ước tính | Cost/query | Cost/tháng (50 conv/ngày) |
|---|---:|---:|---:|
| Fastpath match (spend/kpi/geo đơn giản) | 60-70% | $0 | $0 |
| Gemini free (câu phức tạp, trong quota) | 25-35% | $0 | $0 |
| Claude Haiku fallback (rate limit/error) | 0-5% | $0.003 | $0-2 |
| **Tổng dự kiến** | | | **$0-2** |

Mỗi tháng nhìn dashboard:
- **Anthropic console**: https://console.anthropic.com/usage — xem có fallback nhiều không
- **AI Gateway analytics** trên CF: xem total request Gemini

## Tool registry hiện có

| Tool | Mục đích | Mutate? | Fastpath? |
|---|---|---|---|
| `get_fb_spend` | Spend FB theo time + group | ❌ | ✅ (R4) |
| `get_fb_staff_spend` | Spend per nhân sự (chuẩn) | ❌ | ✅ (R1) |
| `get_kpi_status` | KPI tháng + tiến độ | ❌ | ✅ (R2) |
| `get_geo_queue` | List bài GEO | ❌ | ✅ (R3) |
| `search_past_chats` | FTS5 search chat history | ❌ | — |
| `remember_preference` | Lưu user pref | ✅ | — |

## Roadmap

| Phase | Việc |
|---|---|
| 2 | Mutation tools: `pause_campaign`, `generate_geo_article` (2-step confirm) |
| 3 | Telegram bot (CF Worker → /api/hermes/chat) |
| 4 | PWA wrap (manifest + service worker + Web Push) |
| 5 | Multi-user role + audit log |
| 6 | Skill auto-mining cron (closed learning loop) |

## Verify nhanh bằng curl

```bash
# Fastpath test (cần TEST_BYPASS_TOKEN)
curl -X POST https://facebookadsallinone.pages.dev/api/hermes/chat \
  -H "Content-Type: application/json" \
  -H "X-Test-Token: $TEST_BYPASS_TOKEN" \
  -d '{"message":"spend phương nam tháng này"}'
# → Response provider: "fastpath", cost_usd: 0

# Force LLM
curl -X POST https://facebookadsallinone.pages.dev/api/hermes/chat \
  -H "Content-Type: application/json" \
  -H "X-Test-Token: $TEST_BYPASS_TOKEN" \
  -d '{"message":"spend phương nam tháng này","force_llm":true}'
# → Response provider: "gemini", cost_usd: 0 (free tier)
```

## Pitfalls

1. **Fastpath không match câu phức tạp** — chỉ regex đơn giản. Câu kiểu "so sánh DUY vs PN tuần này và tháng này" sẽ rơi vào LLM.
2. **Gemini rate limit 10 req/phút** — burst đông user sẽ tự fallback Claude. Nếu Claude credit cũng hết → trả lỗi.
3. **Sanity check chỉ regex số VND** — không catch hallucination kiểu "campaign X đang ACTIVE" (text claim). Phase 2 sẽ thêm.
4. **D1 không CASCADE** trên Pages — code đã DELETE messages trước khi DELETE session.
5. **Gemini tool-use ID** — Gemini không cho ID cho function call, code tự gen `gemini_call_xxx` để map với Claude format.
