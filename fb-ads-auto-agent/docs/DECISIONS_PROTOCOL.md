# DECISIONS_PROTOCOL — Output schema Haiku 4.5 phải tuân

Haiku 4.5 nhận system prompt + user prompt (campaign insights 7 ngày + run context), trả về JSON đúng schema này:

```json
{
  "decisions": [
    {
      "campaign_id": "120201234567890123",
      "campaign_name": "DA8.1 — Camera VideoCall — Conversion",
      "adset_id": "120201234567890456",
      "ad_id": null,
      "action_type": "scale_budget",
      "payload": {
        "budget_old_usd": 5.00,
        "budget_new_usd": 6.50
      },
      "reasoning": "ROAS 7d = 2.8, CPA $1.20 thấp hơn KPI $1.50, frequency 1.8 còn dư địa. Tăng 30% (max delta).",
      "importance": "high"
    }
  ]
}
```

## Action types

| `action_type` | Payload | Mục tiêu | Importance gợi ý |
|---|---|---|---|
| `pause` | `{}` | Pause campaign/adset/ad đã set ID | `high` nếu campaign, `medium` adset, `low` ad |
| `scale_budget` | `{ "budget_old_usd": N, "budget_new_usd": M }` | Tăng/giảm budget | `high` nếu \|delta\|≥20%, `medium` 10-20%, `low` <10% |
| `reallocate` | `{ "from_adset_id", "to_adset_id", "from_budget_old_usd", "to_budget_old_usd", "from_delta_usd": -X, "to_delta_usd": +X }` | Zero-sum giữa 2 adset cùng campaign | `medium` |
| `rotate_creative` | `{ "creative_id": "..." }` | Pause 1 ad (creative bão hòa) | `low` |
| `noop` | `{}` | Không action | `low` |

## ID semantics

- `campaign_id` luôn bắt buộc.
- `adset_id` set khi action tác động lên adset (scale_budget cấp adset, reallocate, pause adset).
- `ad_id` set khi action tác động lên ad (rotate_creative, pause ad cụ thể).
- Quy ước pause: nếu `ad_id` có → pause ad; else if `adset_id` có → pause adset; else pause campaign.

## Reasoning style

PHẢI có số liệu cụ thể trong reasoning:
- ✅ "ROAS 2.8 ổn định 3 ngày, CPA $1.20 < KPI $1.50, frequency 1.8"
- ❌ "Campaign chạy ổn nên tăng budget"

## Importance impact

- `high` → gửi email notification ngay
- `medium` → log + summary email cuối ngày (TODO future feature)
- `low` → chỉ log D1

## Parsing fallback

Trong [src/agent.ts](../src/agent.ts) `parseDecisions()`:
- Trim markdown fence ```` ```json ... ``` ````
- Nếu JSON parse fail → tìm `{` đầu tiên và `}` cuối, parse phần giữa
- Nếu vẫn fail → throw → run status = `error`

## Khi nào Haiku có thể return mảng rỗng?

- Daily spend đã chạm 80% cap (system prompt cấm scale up)
- Tất cả campaign data <50 conversions VÀ <7 ngày
- Tất cả campaign performance trong khoảng ổn (CPA ≤ KPI, ROAS ≥ target)

Empty array → `decisions_made = 0`, không error.
