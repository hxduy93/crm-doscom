// /api/landings/generate — từ 1 master prompt, Gemini Flash sinh ra config landing
// (nội dung chữ ĐẦY ĐỦ theo khung noma911) + prompt gen ảnh tiếng Anh cho các ô scene.
// KHÔNG lưu DB — UI nhận về để tạo draft + cho user chỉnh. Admin-only qua middleware.
//
// Body: { prompt: "mô tả sản phẩm/ưu đãi..." }
// Trả:  { ok, config }  (config khớp field renderLanding.js)

const DEFAULT_MODEL = "gemini-3-flash-preview";
const GATEWAY_ID = "doscom-erp";

// Slot ảnh có dùng lại ảnh PNG sản phẩm → prompt phải kèm câu chuẩn DALL·E.
const PRODUCT_SLOTS = new Set(["hero", "heroMobile", "solution", "design", "apply", "proof"]);
const PRODUCT_CLAUSE =
  " — Use the exact product from the uploaded reference image; keep its shape, label and colors unchanged. Photorealistic commercial product photography, clean composition, no added text or logos.";
const SCENE_CLAUSE =
  " — Photorealistic editorial photography, clean composition, no text, no logos, brand-safe.";

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

// Chỉ dẫn cho Gemini: trả JSON đúng khung renderLanding (noma911). Dùng nối chuỗi (không backtick).
function buildInstruction(userPrompt) {
  return [
    "Bạn là chuyên gia copywriting landing page bán hàng tiếng Việt (phong cách chuyển đổi cao, COD, ngành gia dụng/ô tô/làm đẹp).",
    "Từ mô tả sản phẩm/ưu đãi của người dùng dưới đây, viết nội dung ĐẦY ĐỦ cho 1 landing page nhiều section theo đúng khung JSON.",
    "",
    "MÔ TẢ CỦA NGƯỜI DÙNG:",
    userPrompt,
    "",
    "Trả về DUY NHẤT một JSON object đúng cấu trúc sau (KHÔNG thêm chữ ngoài JSON, KHÔNG markdown):",
    "{",
    '  "brand": "tên thương hiệu ngắn",',
    '  "title": "tiêu đề SEO của trang",',
    '  "description": "meta description 1 câu",',
    '  "announce": "1 câu thông báo ưu đãi ngắn (vd: MUA 2 TẶNG 1 — Freeship toàn quốc)",',
    '  "hero": {',
    '    "badges": ["3 badge ngắn, vd Chính hãng, Hàng có sẵn, 4.9 sao"],',
    '    "titleLines": [ {"text":"dòng tiêu đề 1"}, {"text":"dòng 2"}, {"text":"dòng 3 nhấn mạnh","accent":true} ],',
    '    "sub": "1-2 câu mô tả lợi ích chính",',
    '    "stats": [ {"num":"5\'","label":"nhãn ngắn"}, {"num":"3in1","label":"..."}, {"num":"199K","label":"Combo từ"} ],',
    '    "ctaText": "Nhận tư vấn miễn phí →",',
    '    "trust": ["Thanh toán khi nhận (COD)", "Chính hãng"]',
    "  },",
    '  "trust": ["3 cụm tin cậy ngắn cho thanh trust bar"],',
    '  "pullQuote": "1 câu chốt vấn đề/insight gây tò mò",',
    '  "problem": { "eyebrow":"Vấn đề thường gặp", "title":"tiêu đề mục nguyên nhân (có thể \\n xuống dòng)", "sub":"1 câu dẫn",',
    '    "causes": [ {"badge":"Nguyên nhân #1","title":"...","desc":"..."} ] },  // ĐÚNG 4 phần tử',
    '  "solution": { "eyebrow":"Giải pháp", "h2":"tên sản phẩm + công dụng", "lead":"1 câu tóm tắt",',
    '    "intro":"2-3 câu cơ chế hoạt động", "features":[ {"icon":"✨","strong":"từ khoá","text":"mô tả"} ] },  // ĐÚNG 3 features',
    '  "design": { "eyebrow":"Thiết kế thông minh", "h2":"vì sao dễ dùng",',
    '    "features":[ {"num":1,"h4":"...","p":"..."} ] },  // ĐÚNG 4 features',
    '  "applications": { "eyebrow":"Tính ứng dụng", "h2":"...", "p":"1 câu",',
    '    "surfaces":[ {"icon":"🚗","h4":"...","p":"..."} ],  // ĐÚNG 4',
    '    "handlesTitle":"Xử lý sạch mọi...", "handles":["6-9 mục ngắn"] },',
    '  "proof": { "eyebrow":"Chất lượng kiểm chứng", "h2":"...", "p":"1 câu",',
    '    "stats":[ {"num":"99%","label":"..."} ],  // ĐÚNG 4',
    '    "certs":["3 chứng nhận/đảm bảo ngắn"] },',
    '  "compare": { "eyebrow":"So sánh", "h2":"...", "p":"1 câu", "colNormal":"Cách thường","colNormalNote":"giá/thời gian",',
    '    "colNoma":"Sản phẩm","colNomaNote":"giá", "rows":[ {"label":"tiêu chí","normal":"nhược điểm","noma":"ưu điểm"} ],  // 5-6 dòng',
    '    "savings":"~3.000.000đ", "ctaText":"Đặt ngay →" },',
    '  "steps": { "eyebrow":"Hướng dẫn sử dụng", "h2":"...", "items":[ {"h3":"...","p":"..."} ] },  // ĐÚNG 3',
    '  "combo": { "eyebrow":"⚡ Mua 2 Tặng 1", "h2":"Chọn combo", "p":"1 câu",',
    '    "cards":[ {"tag":"⭐ Đáng mua","featured":true,"h3":"tên gói","desc":"...","price":"398K","oldPrice":0,"gift":"Tặng ...","value":"combo-chinh","imgSlots":["product"]} ],  // 2-3 card',
    '    "giftHead":"🎁 Quà tặng khi mua combo", "gifts":[ {"value":"qua1","label":"...","desc":"...","slot":"gift1","oldPrice":200000} ] },  // 1-2 quà',
    '  "products": [ {"value":"ma-goi","label":"tên gói","desc":"mô tả ngắn","price":"199K","noGift":true} ],  // 2-3 gói; gói rẻ nhất noGift:true',
    '  "specs": { "eyebrow":"Thông số sản phẩm", "h2":"...", "rows":[ {"label":"...","value":"..."} ] },  // 6-9 dòng',
    '  "faq": { "eyebrow":"Câu hỏi thường gặp", "h2":"FAQ", "items":[ {"q":"...","a":"..."} ] },  // 5-7 câu',
    '  "footer": { "company":"tên công ty", "desc":"1-2 câu giới thiệu", "bottom":"© 2026 ...",',
    '    "cols":[ {"title":"Sản phẩm","links":[{"text":"...","href":"#"}]} ] },',
    '  "sticky": { "title":"199K — Combo từ", "sub":"Thanh toán khi nhận · COD" },',
    '  "imagePrompts": {',
    '    "hero": "English scene description for a hero background photo featuring the product",',
    '    "heroMobile": "English scene description, vertical framing, product centered",',
    '    "cause1": "English scene illustrating problem #1 (NO product)",',
    '    "cause2": "...", "cause3": "...", "cause4": "...",',
    '    "solution": "English before/after or product close-up scene",',
    '    "design": "English close-up showing the product design/parts",',
    '    "apply": "English montage of the product being used",',
    '    "proof": "English result/comparison shot"',
    "  }",
    "}",
    "",
    "QUY TẮC ẢNH (imagePrompts): viết TIẾNG ANH, chỉ MÔ TẢ CẢNH (không nhắc thương hiệu thật, không yêu cầu chữ trong ảnh). Hệ thống sẽ TỰ thêm câu dùng ảnh PNG sản phẩm — bạn KHÔNG cần viết câu đó.",
    "Nội dung chữ bằng TIẾNG VIỆT có dấu, văn phong bán hàng ngắn gọn, đúng sản phẩm người dùng mô tả. Số phần tử mảng tuân thủ ghi chú (causes 4, solution.features 3, design.features 4, surfaces 4, proof.stats 4, steps 3).",
  ].join("\n");
}

// Cắt mảng về đúng độ dài, bù phần tử rỗng theo factory.
function fitArray(a, n, factory) {
  const out = Array.isArray(a) ? a.slice(0, n) : [];
  while (out.length < n) out.push(factory(out.length));
  return out;
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
        generationConfig: { temperature: 0.8, responseMimeType: "application/json", maxOutputTokens: 8192 },
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
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return json({ ok: false, error: "Không parse được JSON từ Gemini", raw: raw.slice(0, 300) }, 502);
    try { cfg = JSON.parse(m[0]); } catch { return json({ ok: false, error: "JSON Gemini hỏng", raw: raw.slice(0, 300) }, 502); }
  }

  /* ----- Chuẩn hoá tối thiểu để khớp renderLanding + UI ----- */
  cfg.theme = cfg.theme || { primary: "#FF6B1A", orangeDeep: "#E55100", gold: "#D4A017", dark: "#0a0a0a" };
  cfg.hero = cfg.hero || {};
  cfg.hero.titleLines = Array.isArray(cfg.hero.titleLines) && cfg.hero.titleLines.length ? cfg.hero.titleLines : [{ text: cfg.title || cfg.brand || "" }];
  cfg.problem = cfg.problem || {};
  cfg.problem.causes = fitArray(cfg.problem.causes, 4, (i) => ({ badge: "Nguyên nhân #" + (i + 1), title: "", desc: "" }));
  cfg.solution = cfg.solution || {};
  cfg.solution.features = fitArray(cfg.solution.features, 3, () => ({ icon: "✨", strong: "", text: "" }));
  cfg.design = cfg.design || {};
  cfg.design.features = fitArray(cfg.design.features, 4, (i) => ({ num: i + 1, h4: "", p: "" }));
  cfg.applications = cfg.applications || {};
  cfg.applications.surfaces = fitArray(cfg.applications.surfaces, 4, () => ({ icon: "✨", h4: "", p: "" }));
  cfg.proof = cfg.proof || {};
  cfg.proof.stats = fitArray(cfg.proof.stats, 4, () => ({ num: "", label: "" }));
  cfg.steps = cfg.steps || {};
  cfg.steps.items = fitArray(cfg.steps.items, 3, () => ({ h3: "", p: "" }));
  cfg.products = Array.isArray(cfg.products) && cfg.products.length ? cfg.products : [{ value: "goi-1", label: "", price: "", noGift: true }];

  // imagePrompts: thêm câu dùng ảnh PNG sản phẩm cho slot product, câu scene-safe cho slot còn lại.
  const ip = cfg.imagePrompts && typeof cfg.imagePrompts === "object" ? cfg.imagePrompts : {};
  const SCENE_SLOTS = ["hero", "heroMobile", "cause1", "cause2", "cause3", "cause4", "solution", "design", "apply", "proof"];
  const finalPrompts = {};
  for (const slot of SCENE_SLOTS) {
    const base = String(ip[slot] || "").trim();
    if (!base) { finalPrompts[slot] = ""; continue; }
    finalPrompts[slot] = base + (PRODUCT_SLOTS.has(slot) ? PRODUCT_CLAUSE : SCENE_CLAUSE);
  }
  cfg.imagePrompts = finalPrompts;
  cfg.images = {};

  return json({ ok: true, config: cfg });
}
