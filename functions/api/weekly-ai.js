// POST /api/weekly-ai
// Nhận summary số liệu báo cáo tuần (đã tính sẵn ở client) → Claude viết NHẬN XÉT
// hiệu quả quảng cáo + ĐỀ XUẤT cải thiện (markdown tiếng Việt).
// Tái dùng pattern gọi Claude Haiku qua Cloudflare AI Gateway (giống agent-fb-ai.js).
// CRM public, không gate token. Chỉ chạy Claude — thiếu credit thì trả lỗi rõ ràng.

const CLAUDE_MODEL = "claude-haiku-4-5";

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

const SYSTEM_PROMPT = `Bạn là Sarah — chuyên gia Facebook/Google Ads 8 năm, audit account Việt Nam cho Doscom (bán thiết bị ô tô + dòng chăm sóc xe Noma).
Nhiệm vụ: đọc số liệu báo cáo tuần (ĐÃ TÍNH SẴN, không cần tính lại) và viết NHẬN XÉT hiệu quả quảng cáo + ĐỀ XUẤT cải thiện.

═══ BỐI CẢNH DOSCOM ═══
- 2 nhân sự chạy FB Ads: DUY + PHƯƠNG NAM (PN), chốt đơn qua Pancake. Ngoài ra có kênh WEBSITE (chạy Google Ads) + Page Facebook.
- Mục tiêu: tỷ lệ chi phí/doanh thu (CIR) ≤ 40% (tức ROAS ≥ 2.5×). CPA thấp = tốt. AOV tăng = tốt. Biên lợi nhuận phải dương.
- 2 dòng SP: "Doscom" (D1, DA8.1, DR1, DV1...) AOV cao 1–2.5M; "Noma" (Noma 911/922/250) AOV thấp ~200–400K, chơi volume.
- Δ (delta) trong data = so với kỳ liền trước cùng độ dài. CIR/CPA giảm = tốt; doanh thu/đơn/lợi nhuận tăng = tốt.

═══ DỮ LIỆU INPUT (các field chính) ═══
- range / prevRange: kỳ báo cáo + kỳ so sánh.
- kpi: KPI tháng + MTD + dự phóng cuối tháng.
- kenh[]: mỗi kênh có spend (gồm Google unmatch), spendDelta, dt (doanh thu tạm tính), dtDelta, don (đơn giao), cir, cpa, cpaDelta, loiNhuan.
- cpaTb / aov: CPA & AOV trung bình toàn công ty + Δ.
- topTangTruong[] / topGiam[]: SKU tăng/giảm mạnh theo DT.
- topLoiNhuan[]: SKU lãi nhất. khoBan[]: SKU tốn spend mà CIR cao / 0 đơn.
- dongSP: CPA & AOV theo dòng Doscom vs Noma.
- creativeTot[] / creativeYeu[] / campaignLo[]: campaign CTR tốt / yếu / lỗ.
- duBaoChiPhi: dự kiến chi phí QC kỳ tới theo kênh.

═══ OUTPUT (markdown tiếng Việt 100%, BẮT BUỘC dẫn SỐ cụ thể từ data, KHÔNG chung chung) ═══
## 1. Đánh giá tổng quan
2–3 câu: tổng chi phí, doanh thu, CIR, lợi nhuận kỳ này + so kỳ trước (dùng Δ). Tiến độ KPI tháng.
## 2. Kênh hiệu quả vs cần xem lại
So DUY / PN / Google theo CIR · CPA · lợi nhuận. Chỉ rõ kênh tốt nhất + kênh đang lỗ/CIR cao, kèm số.
## 3. Sản phẩm & dòng SP
SKU tăng trưởng nên đẩy (dẫn %DT), SKU khó bán nên cắt (dẫn spend/CIR). Nhận xét Doscom vs Noma theo CPA/AOV.
## 4. Creative
Creative/campaign CTR tốt nên nhân/scale; campaign lỗ nên tắt — nêu tên + số.
## 5. Hành động tuần tới (3–5 việc cụ thể)
Mỗi việc: **LÀM GÌ** (có số/ngân sách) + **VÌ SAO** (dẫn số) + **TÁC ĐỘNG** kỳ vọng.
## 6. Nhận xét dự báo chi phí
Mức chi phí dự kiến kỳ tới có hợp lý không, nên tăng/giảm ngân sách kênh nào, vì sao.

🚨 KHÔNG bịa số không có trong data. Thiếu data field nào thì ghi rõ "thiếu dữ liệu …". Giữ ngắn gọn, súc tích, ưu tiên actionable.`;

async function callClaude(env, userPrompt) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY chưa set trên Cloudflare Pages");
  if (!env.CF_ACCOUNT_ID) throw new Error("CF_ACCOUNT_ID chưa set trên Cloudflare Pages");

  const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/anthropic/v1/messages`;
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 2800,
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

  let payload;
  try { payload = await request.json(); }
  catch { return json({ ok: false, error: "invalid_json" }, 400); }

  if (!env.ANTHROPIC_API_KEY || !env.CF_ACCOUNT_ID) {
    return json({
      ok: false,
      error: "Chưa cấu hình Claude: thiếu ANTHROPIC_API_KEY hoặc CF_ACCOUNT_ID trên Cloudflare Pages (crm-doscom).",
    }, 502);
  }

  const userPrompt = "DỮ LIỆU BÁO CÁO TUẦN (JSON, đã tính sẵn):\n" + JSON.stringify(payload, null, 1);

  try {
    const out = await callClaude(env, userPrompt);
    return json({ ok: true, analysis: out.text, model: out.model, usage: out.usage });
  } catch (err) {
    const msg = String(err?.message || err);
    const needCredit = /credit balance is too low|Plans & Billing|insufficient|billing|402/i.test(msg);
    return json({
      ok: false,
      need_credit: needCredit,
      error: needCredit
        ? "Tài khoản Anthropic chưa đủ credit để chạy Claude Haiku. Vào console.anthropic.com → Plans & Billing nạp credit (tối thiểu ~$5)."
        : "Claude Haiku lỗi: " + msg,
    }, 502);
  }
}
