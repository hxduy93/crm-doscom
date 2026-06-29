// POST /api/clarity/optimize
// Nhận số liệu Clarity (metrics[] từ /api/clarity/insights) → Claude đề xuất TỐI ƯU landing.
// Tái dùng pattern gọi Claude Haiku qua Cloudflare AI Gateway 'doscom-erp' (giống weekly-ai.js).
// RED LINES: Claude qua gateway doscom-erp · kill switch USE_CLAUDE · cache KV theo ngày VN
// (mode tốn tiền PHẢI cache để F5 cùng ngày không tốn credit).

const CLAUDE_MODEL = "claude-opus-4-8";
const CACHE_VER = "v2";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function vnDateStr() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }

const SYSTEM_PROMPT = `Bạn là chuyên gia tối ưu chuyển đổi (CRO) landing page bán hàng, 8 năm kinh nghiệm thị trường Việt Nam.
Bối cảnh: landing bán bộ chăm sóc kính ô tô NOMA (911 tẩy ố, 922 phủ nano, 310 chống hấp hơi). Mục tiêu: tăng tỉ lệ điền form đặt hàng (combo 398K). Cấu trúc trang theo anchor: #top (hero) → sản phẩm → #san-pham-kem (922/310 mua kèm) → #combo (mua 2 tặng 1) → #dat-hang (form).

Bạn nhận SỐ LIỆU UX THẬT từ Microsoft Clarity (3 ngày), theo từng URL/anchor:
- Traffic: totalSessionCount, distinctUserCount, totalBotSessionCount.
- ScrollDepth: averageScrollDepth (%) — khách cuộn sâu tới đâu.
- EngagementTime: totalTime / activeTime (giây) — nơi khách dừng/xem lâu.
- RageClickCount / DeadClickCount: bấm bực bội / bấm vô tác dụng (subTotal, sessionsWithMetricPercentage) — dấu hiệu UX lỗi.
- QuickbackClick: quay lại nhanh (thoát ngay) — nội dung không giữ chân.
- ExcessiveScroll: cuộn quá nhiều (tìm không thấy). ScriptErrorCount: lỗi kỹ thuật.

Viết ĐỀ XUẤT TỐI ƯU bằng markdown tiếng Việt, BẮT BUỘC dẫn SỐ cụ thể từ data (đừng chung chung):
## 1. Đọc nhanh hành vi khách
2–3 câu: khách cuộn sâu không, dừng lâu ở section nào, có dấu hiệu khó chịu (rage/dead/quickback) ở đâu — dẫn số.
## 2. Vấn đề & đề xuất (ưu tiên cao → thấp)
Mỗi mục: **VẤN ĐỀ** (dẫn số liệu/anchor) · **ĐỀ XUẤT** sửa cụ thể trên trang · **TÁC ĐỘNG** kỳ vọng tới tỉ lệ đặt hàng.
## 3. Việc nên làm ngay (3–5 gạch đầu dòng ngắn, actionable)

🚨 CHỈ dùng số có trong data. Thiếu chỗ nào ghi rõ "thiếu dữ liệu …". KHÔNG bịa. Ngắn gọn, đi thẳng vào việc.`;

async function callClaude(env, userPrompt) {
  const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/anthropic/v1/messages`;
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`Claude API ${r.status}: ${errText.slice(0, 300)}`);
  }
  const data = await r.json();
  const textBlock = (data.content || []).find(b => b.type === "text");
  if (!textBlock?.text) throw new Error("Claude trả về nội dung rỗng");
  return { text: textBlock.text, usage: data.usage || {}, model: data.model || CLAUDE_MODEL };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Kill switch
  if (env.USE_CLAUDE === "false") {
    return json({ ok: false, error: "Đề xuất AI đang tắt (USE_CLAUDE=false)." }, 503);
  }
  if (!env.ANTHROPIC_API_KEY || !env.CF_ACCOUNT_ID) {
    return json({ ok: false, error: "Chưa cấu hình Claude: thiếu ANTHROPIC_API_KEY hoặc CF_ACCOUNT_ID trên Cloudflare Pages (crm-doscom)." }, 502);
  }

  let payload;
  try { payload = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const metrics = payload && payload.metrics;
  if (!Array.isArray(metrics) || !metrics.length) {
    return json({ ok: false, error: "Chưa có số liệu Clarity để phân tích (mở tab Heatmap để tải số trước)." }, 400);
  }

  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const cacheKey = `clarity:optimize:${CACHE_VER}:${vnDateStr()}`;

  // Cache theo ngày — F5 cùng ngày không tốn credit Claude.
  if (env.INVENTORY && !refresh) {
    const cached = await env.INVENTORY.get(cacheKey);
    if (cached) { try { const o = JSON.parse(cached); o.cached = true; return json(o); } catch {} }
  }

  const userPrompt = "SỐ LIỆU CLARITY (JSON, 3 ngày, theo URL/anchor):\n" + JSON.stringify(metrics, null, 1);

  try {
    const out = await callClaude(env, userPrompt);
    const res = { ok: true, suggestions: out.text, model: out.model, usage: out.usage, at: vnDateStr(), cached: false };
    if (env.INVENTORY) { try { await env.INVENTORY.put(cacheKey, JSON.stringify(res), { expirationTtl: 24 * 3600 }); } catch {} }
    return json(res);
  } catch (err) {
    const msg = String(err?.message || err);
    const needCredit = /credit balance is too low|Plans & Billing|insufficient|billing|402/i.test(msg);
    return json({
      ok: false,
      need_credit: needCredit,
      error: needCredit
        ? "Tài khoản Anthropic chưa đủ credit để chạy Claude. Vào console.anthropic.com → Plans & Billing nạp credit."
        : "Claude lỗi: " + msg,
    }, 502);
  }
}
