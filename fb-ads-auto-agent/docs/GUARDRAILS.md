# GUARDRAILS — Quy tắc cứng agent KHÔNG được vượt qua

Các guardrail dưới đây được implement trong [src/guardrails.ts](../src/guardrails.ts) và `executeDecision()` trong [src/actions.ts](../src/actions.ts).

## 1. Killswitch (KV)

Nếu KV key `AGENT_KILLSWITCH = "1"`, run sẽ skip toàn bộ logic, ghi 1 row vào D1 với `status='killswitch'`. Bật bằng:
```bash
npx wrangler kv key put --binding=AGENT_KV AGENT_KILLSWITCH 1 --remote
```

## 2. Account whitelist

Agent CHỈ làm việc trên `AD_ACCOUNT_ID` được pin trong `wrangler.toml`. Mọi decision liên quan account khác bị block với reason `account_mismatch`.

## 3. Daily spend cap

- `DAILY_SPEND_CAP_USD` (default $10) là giới hạn cứng.
- Khi `daily_spend_usd ≥ cap` → mọi action `scale_budget` (tăng) bị block với `spend_cap_hit`.
- Nếu budget mới + daily_spend > 1.2 × cap → block với `projected_spend_exceeds_cap`.
- Hệ thống fetch spend trong ngày từ Meta API mỗi run, fallback về giá trị D1 nếu API fail.

## 4. Max budget delta

`MAX_BUDGET_DELTA_PCT` (default 0.30 = 30%). Mọi `scale_budget` có `|new - old|/old > 30%` bị block với `delta_too_large`.

## 5. Reallocate zero-sum

`reallocate` phải có `from_delta + to_delta ≈ 0` (sai lệch < $0.5). Nếu không, block với `reallocate_not_zero_sum`.

## 6. Min spend trước khi quyết định

Trong system prompt: nếu campaign có <50 conversions VÀ <7 ngày spend, Haiku mặc định `noop`. Tránh decision trên data quá ít.

## 7. Shadow mode toggle

`SHADOW_MODE = "true"` → mọi decision đều bị block với `shadow_mode`, log đầy đủ nhưng KHÔNG gọi Meta API. Dùng để verify Haiku reasoning trước khi cho live.

## 8. Audit trail

Mọi run + decision được log vào D1:
- `runs` table: 1 row/run với tokens + cost + status
- `decisions` table: 1 row/decision với reasoning đầy đủ + executed flag + blocked_reason

Query trong dashboard:
```sql
SELECT * FROM decisions WHERE blocked_reason IS NOT NULL ORDER BY created_at DESC LIMIT 20;
```

## 9. Notification cho high-importance

Mọi decision `importance='high'` (pause campaign, scale >20%, hit cap) được gửi email
ngay sau run qua MailChannels → `NOTIFY_EMAIL`.

## 10. Cron interval

`0 2,5,8,11 * * *` UTC = 9h/12h/15h/18h ICT. 4 run/ngày, không hơn.
