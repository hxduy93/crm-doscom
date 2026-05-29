# FB Ads Auto Agent

Cloudflare Worker chạy autonomous agent dùng Claude Haiku 4.5 để tự tối ưu Meta Ads campaign — pause/scale/reallocate/rotate creative — 4 lần/ngày, có guardrail cứng để không vượt $10/ngày spend cap.

**Hoàn toàn cô lập** với Doscom dashboard ([../functions/](../functions/)) và GEO Agent — riêng worker, riêng D1, riêng KV, riêng ad account.

## Tóm tắt

| Item | Value |
|---|---|
| Stack | Cloudflare Worker + D1 + KV + Cron Triggers |
| LLM | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Cron | 9h / 12h / 15h / 18h ICT (UTC+7) → 4 run/ngày |
| Daily spend cap | $10 (hard stop) |
| Max budget delta | ±30%/campaign/run |
| Cost ước tính | ~$0.04/ngày (~$1.2/tháng Haiku) + Workers Free tier |
| Notification | Email qua MailChannels → `doscom.vietnam@gmail.com` khi có high-importance action |
| Storage | D1 `fb_agent_decisions` + KV `FB_AGENT_KV` (killswitch) |
| Cloudflare account | `doscom.vietnam@gmail.com` (account ID `cffb0c35f8c649872436b2087a64b7bc`) |

## Tài liệu

- [docs/SETUP.md](docs/SETUP.md) — chuẩn bị Meta System User token + Cloudflare resources, deploy lần đầu
- [docs/GUARDRAILS.md](docs/GUARDRAILS.md) — 10 quy tắc cứng agent không được vượt
- [docs/DECISIONS_PROTOCOL.md](docs/DECISIONS_PROTOCOL.md) — output schema Haiku phải tuân

## File structure

```
fb-ads-auto-agent/
├── README.md (this file)
├── package.json
├── tsconfig.json
├── wrangler.toml.example  # template → copy thành wrangler.toml (gitignored)
├── schema.sql             # D1 schema
├── src/
│   ├── index.ts           # Worker entry: scheduled() + fetch() endpoints
│   ├── agent.ts           # Haiku 4.5 brain
│   ├── prompts.ts         # SYSTEM_PROMPT + buildUserPrompt()
│   ├── meta-api.ts        # Meta Graph API wrapper (read insights + write actions)
│   ├── guardrails.ts      # Killswitch, spend cap, delta check, account whitelist
│   ├── actions.ts         # executeDecision() — gọi Meta API có guardrail
│   ├── gmail-notifier.ts  # Email khi có high-importance decision
│   └── types.ts
└── docs/
    ├── SETUP.md
    ├── GUARDRAILS.md
    └── DECISIONS_PROTOCOL.md
```

## Endpoints

| Endpoint | Mô tả |
|---|---|
| `GET /health` | Health check |
| `GET /run?key=LAST8_OF_API_KEY` | Trigger 1 run thủ công (test) |
| `GET /runs` | List 30 run gần nhất |
| `GET /decisions?run_id=N` | List decisions của 1 run |

## Cách bắt đầu

Xem [docs/SETUP.md](docs/SETUP.md) cho chi tiết từng bước. Tóm tắt:

```powershell
cd "E:\Facebook Ads\github-repo\fb-ads-auto-agent"
npm install
Copy-Item wrangler.toml.example wrangler.toml
# Sửa wrangler.toml với AD_ACCOUNT_ID + D1 + KV IDs
npm run d1:init:remote
# Set secrets qua Git Bash (KHÔNG PowerShell — sẽ inject BOM)
npm run deploy
```

## Killswitch

Tắt agent từ xa bất cứ lúc nào:
```powershell
npx wrangler kv key put --binding=AGENT_KV AGENT_KILLSWITCH 1 --remote
```

## Mối quan hệ với Doscom dashboard

| Item | Doscom Dashboard | FB Ads Auto Agent |
|---|---|---|
| Deploy target | Cloudflare Pages `facebookadsallinone` | Cloudflare Worker `fb-ads-auto-agent` |
| Folder | `/` (root) | `/fb-ads-auto-agent/` |
| FB token | `FB_ACCESS_TOKEN` (user, 60d) | `FB_SYSTEM_USER_TOKEN` (system user, never expires) |
| Ad accounts | 7 production accounts | 1 dedicated test account |
| LLM | Sonnet 4.6 qua AI Gateway | Haiku 4.5 trực tiếp |
| Autonomy | Human-in-loop (button click) | Full auto (cron, 4×/day) |
| Cloudflare account | `doscom.vietnam@gmail.com` | `doscom.vietnam@gmail.com` |

Hai dự án dùng chung Cloudflare account nhưng KHÔNG share KV/D1/secret — hoàn toàn cô lập về data và logic.
