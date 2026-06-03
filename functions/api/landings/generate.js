// /api/landings/generate — từ 1 master prompt, Gemini Flash sinh ra config landing
// (nội dung chữ) + prompt gen ảnh cho 5 ô AI (hero, usage, benefit1..3).
// KHÔNG lưu DB — UI nhận về để tạo draft + cho user chỉnh. Admin-only qua middleware.
//
// Body: { prompt: "mô tả sản phẩm/ưu đãi..." }
// Trả:  { ok, config }  (config khớp field renderLanding.js)

const DEFAULT_MODEL = "gemini-3-flash-preview";
const GATEWAY_ID = "doscom-erp";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function baseUrl(env) {
  if (env.CF_ACCOUNT_ID) {
    return "https://gateway.ai.cloudflare.com/v1/" + env.CF_ACCOUNT_ID + "/" + GATEWAY_ID + "/google-ai-studio/v1beta";
  }
  return "https://generativelanguage.googleapis.com/v1beta";
}

// Chỉ dẫn cho Gemini: trả JSON đúng khung renderLanding. Dùng nối chuỗi (không backtick) cho phần text.
function buildInstruction(userPrompt) {
  return [
    "Bạn là chuyên gia copywriting landing page bán hàng tiếng Việt (phong cách chuyển đổi cao, COD).",
    "Từ mô tả sản phẩm/ưu đãi của người dùng dưới đây, hãy viết nội dung cho 1 landing page chuẩn.",
    "",
    "MÔ TẢ CỦA NGƯỜI DÙNG:",
    userPrompt,
    "",
    "Trả về DUY NHẤT một JSON object đúng cấu trúc sau (không thêm chữ ngoài JSON):",
    "{",
    '  "brand": "tên thương hiệu ngắn",',
    '  "title": "tiêu đề SEO của trang",',
    '  "description": "meta description 1 câu",',
    '  "hero": { "headline": "tiêu đề lớn giật tít", "sub": "1 câu mô tả lợi ích chính", "badges": ["3-4 badge ngắn, vd Chính hãng, Giao nhanh, COD"] },',
    '  "usageTitle": "tiêu đề mục công dụng/cách dùng",',
    '  "usageDesc": "2-3 câu mô tả công dụng nổi bật",',
    '  "benefits": [ { "icon": "1 emoji", "title": "tiêu đề lợi ích", "desc": "mô tả ngắn" } ],  // ĐÚNG 3 phần tử',
    '  "products": [ { "label": "tên gói/combo", "value": "ma-goi-khong-dau", "price": 0, "oldPrice": 0 } ],  // 2-3 gói, giá để 0 nếu không rõ (user sẽ điền)',
    '  "offer": { "priceNote": "1 câu thúc đẩy mua, vd Freeship toàn quốc - Thanh toán khi nhận" },',
    '  "footer": { "company": "tên công ty/shop", "address": "" },',
    '  "imagePrompts": {',
    '    "hero": "English image prompt for a lifestyle/hero photo of the product in use",',
    '    "usage": "English image prompt illustrating the product benefit/effect or before-after",',
    '    "benefit1": "English image prompt for benefit #1",',
    '    "benefit2": "English image prompt for benefit #2",',
    '    "benefit3": "English image prompt for benefit #3"',
    "  }",
    "}",
    "",
    "QUY TẮC ẢNH (imagePrompts): viết bằng TIẾNG ANH, mô tả cảnh/minh hoạ, phong cách photography chuyên nghiệp, sạch sẽ.",
    "TUYỆT ĐỐI KHÔNG yêu cầu chữ trong ảnh, KHÔNG logo thương hiệu thật, KHÔNG khuôn mặt rõ ràng. benefits phải khớp 1-1 với benefit1/benefit2/benefit3.",
    "Nội dung chữ bằng TIẾNG VIỆT có dấu, văn phong bán hàng, ngắn gọn, đúng sản phẩm người dùng mô tả.",
  ].join("\n");
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ ok: false, error: "GEMINI_API_KEY chưa cấu hình" }, 500);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const prompt = String(d.prompt || "").trim();
  if (!prompt) return json({ ok: false, error: "Thiếu prompt mô tả sản phẩm" }, 400);

  const MODEL = env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = baseUrl(env) + "/models/" + MODEL + ":generateContent?key=" + env.GEMINI_API_KEY;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildInstruction(prompt) }] }],
        generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
      }),
    });
  } catch (err) {
    return json({ ok: false, error: "Gọi Gemini lỗi: " + String(err?.message || err) }, 502);
  }

  if (!res.ok) {
    const txt = (await res.text()).slice(0, 400);
    return json({ ok: false, error: "Gemini HTTP " + res.status + ": " + txt }, 502);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const raw = parts.map(p => p?.text).filter(Boolean).join("").trim();
  if (!raw) return json({ ok: false, error: "Gemini trả rỗng" }, 502);

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    // phòng khi model bọc ```json ... ```
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return json({ ok: false, error: "Không parse được JSON từ Gemini", raw: raw.slice(0, 300) }, 502);
    try { cfg = JSON.parse(m[0]); } catch { return json({ ok: false, error: "JSON Gemini hỏng", raw: raw.slice(0, 300) }, 502); }
  }

  // Chuẩn hoá tối thiểu để khớp renderLanding + UI 6 ô.
  cfg.benefits = Array.isArray(cfg.benefits) ? cfg.benefits.slice(0, 3) : [];
  while (cfg.benefits.length < 3) cfg.benefits.push({ icon: "✔", title: "", desc: "" });
  cfg.products = Array.isArray(cfg.products) && cfg.products.length ? cfg.products : [{ label: "", value: "goi-1", price: 0, oldPrice: 0 }];
  cfg.imagePrompts = cfg.imagePrompts || {};
  cfg.theme = cfg.theme || { primary: "#e11d48", accent: "#f59e0b" };

  return json({ ok: true, config: cfg });
}
