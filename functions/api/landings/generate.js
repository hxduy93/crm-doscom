// /api/landings/generate — từ 1 master prompt, Gemini Flash sinh ra config landing
// (nội dung chữ ĐẦY ĐỦ theo khung noma911) + prompt gen ảnh tiếng Anh cho các ô scene.
// KHÔNG lưu DB — UI nhận về để tạo draft + cho user chỉnh. Admin-only qua middleware.
//
// Body: { prompt: "mô tả sản phẩm/ưu đãi..." }
// Trả:  { ok, config }  (config khớp field renderLanding.js)

const DEFAULT_MODEL = "gemini-3-flash-preview";
const GATEWAY_ID = "doscom-erp";

// Slot ảnh nên có sản phẩm xuất hiện rõ → dùng câu compose ảnh mẫu mạnh.
const PRODUCT_SLOTS = new Set(["hero", "heroMobile", "solution", "design", "apply", "proof"]);

// Câu tham chiếu ảnh mẫu (ChatGPT/DALL·E nhận ảnh đính kèm).
const REF_STRONG =
  "Use the attached reference product image as the EXACT product: keep its exact shape, label, text and colors unchanged, do not redesign or relabel it; composite it photorealistically into the scene at a natural scale.";
const REF_COND =
  "If the product appears in this image, use the attached reference product image as the exact product (keep its shape, label and colors unchanged).";
const STYLE =
  "Photorealistic commercial photography, sharp focus, professional lighting, clean uncluttered composition. Do NOT render any text, letters, captions, watermark or brand logo in the image (a requested colored highlight mark is allowed).";

// Kích thước/tỉ lệ khuyến nghị từng ô (khớp vị trí trên landing).
const SIZE = {
  hero: "Wide landscape banner, aspect ratio 16:9 (about 1600x900px); keep the left third relatively empty for text overlay.",
  heroMobile: "Vertical poster, aspect ratio 9:16 (about 1080x1920px); product centered, works as a mobile background.",
  cause1: "Square 1:1 (about 1024x1024px).",
  cause2: "Square 1:1 (about 1024x1024px).",
  cause3: "Square 1:1 (about 1024x1024px).",
  cause4: "Square 1:1 (about 1024x1024px).",
  solution: "Aspect ratio 4:3 (about 1200x900px); clear before/after or hero close-up.",
  design: "Aspect ratio 1:1 (about 1200x1200px); clean studio close-up of the product details.",
  apply: "Aspect ratio 4:3 (about 1200x900px); the product being used in a real context.",
  proof: "Aspect ratio 4:3 (about 1200x900px); convincing result / comparison shot.",
};
const SCENE_SLOTS = Object.keys(SIZE);

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
    "Bạn là chuyên gia copywriting landing page bán hàng tiếng Việt (phong cách chuyển đổi cao, COD, ngành gia dụng/ô tô/làm đẹp/công nghệ).",
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
    '    "hero":"...", "heroMobile":"...", "cause1":"...", "cause2":"...", "cause3":"...", "cause4":"...",',
    '    "solution":"...", "design":"...", "apply":"...", "proof":"..."',
    "  },  // mỗi ô = 1-2 câu TIẾNG ANH MÔ TẢ CẢNH cụ thể, sống động (bối cảnh, ánh sáng, góc máy). KHÔNG nhắc thương hiệu thật.",
    '  "imageHighlights": {',
    '    "hero":"", "solution":"", "design":"", "apply":"", "proof":"", "cause1":"", "cause2":"", "cause3":"", "cause4":"", "heroMobile":""',
    "  }",
    "}",
    "",
    "QUY TẮC ẢNH RẤT QUAN TRỌNG:",
    "- imagePrompts: chỉ mô tả CẢNH (tiếng Anh). Hệ thống sẽ TỰ thêm: câu dùng ảnh mẫu sản phẩm, kích thước/tỉ lệ, và style. Bạn KHÔNG cần viết các câu đó.",
    "- imageHighlights: NẾU bức ảnh cần CHỈ RÕ một chi tiết quan trọng/ẩn/nhỏ của sản phẩm để người xem chú ý (vd: mắt camera ẩn trong ổ cắm, nút bấm, cảm biến, vùng vết ố trên kính, điểm trước/sau), hãy ghi TÊN CHÍNH XÁC chi tiết đó bằng tiếng Anh (vd: \"the hidden camera lens inside the socket\"). Hệ thống sẽ tự thêm yêu cầu khoanh tròn đỏ vào đúng chi tiết đó. Nếu ảnh không cần chỉ điểm gì thì để chuỗi rỗng.",
    "- Đặc biệt với sản phẩm có tính năng ẩn/khó thấy (camera ngụy trang, cảm biến...), các ảnh demo (solution/design/apply/proof) NÊN có imageHighlights chỉ vào tính năng đó.",
    "",
    "Nội dung chữ bằng TIẾNG VIỆT có dấu, văn phong bán hàng ngắn gọn, đúng sản phẩm. Số phần tử mảng tuân thủ ghi chú (causes 4, solution.features 3, design.features 4, surfaces 4, proof.stats 4, steps 3).",
  ].join("\n");
}

// Cắt mảng về đúng độ dài, bù phần tử rỗng theo factory.
function fitArray(a, n, factory) {
  const out = Array.isArray(a) ? a.slice(0, n) : [];
  while (out.length < n) out.push(factory(out.length));
  return out;
}

// Ghép prompt cuối cho 1 slot: cảnh + highlight (khoanh đỏ) + ảnh mẫu + kích thước + style.
function composePrompt(slot, scene, highlight) {
  scene = String(scene || "").trim();
  if (!scene) return "";
  const parts = [scene];
  const hl = String(highlight || "").trim();
  if (hl) {
    parts.push(
      "IMPORTANT — visual callout: draw a clearly visible bright RED circle (and a thin red arrow) around " + hl +
      " so the viewer immediately notices it. Keep the red mark clean and obvious."
    );
  }
  parts.push(PRODUCT_SLOTS.has(slot) ? REF_STRONG : REF_COND);
  parts.push(SIZE[slot] || "");
  parts.push(STYLE);
  return parts.filter(Boolean).join(" ");
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

  // imagePrompts: ghép cảnh + highlight + ảnh mẫu + kích thước + style cho từng slot.
  const ip = cfg.imagePrompts && typeof cfg.imagePrompts === "object" ? cfg.imagePrompts : {};
  const ih = cfg.imageHighlights && typeof cfg.imageHighlights === "object" ? cfg.imageHighlights : {};
  const finalPrompts = {};
  for (const slot of SCENE_SLOTS) finalPrompts[slot] = composePrompt(slot, ip[slot], ih[slot]);
  cfg.imagePrompts = finalPrompts;
  delete cfg.imageHighlights;
  cfg.images = {};

  return json({ ok: true, config: cfg });
}
