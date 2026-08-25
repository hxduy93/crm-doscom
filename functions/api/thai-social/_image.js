// Sinh ảnh cho bài fanpage Thái.
//
// Ảnh bài là ảnh GHÉP: nền do AI sinh + sản phẩm thật đè lên + chữ Thái (xem _poster.js).
// File này lo lớp NỀN, và lo đường lui khi SKU chưa có ảnh sản phẩm:
//   1. SKU có ảnh trong thư viện → AI chỉ sinh NỀN. Nhãn chai luôn đúng vì là ảnh thật.
//   2. SKU chưa có ảnh → AI vẽ cả sản phẩm. Nhãn sẽ sai, nên luôn kèm cảnh báo.
//   3. Không sinh được gì → bài vẫn giữ caption nhưng ĐÁNH DẤU thiếu ảnh và nói rõ vì sao.
//      Không bao giờ trả bài như thể đã đủ ảnh.
//
// Đi qua binding AI + gateway doscom-erp giống /api/geo/generate-image, dùng chung hàm đo
// chi phí của agent-geo để một chỗ đếm cho cả hai.

import { estimateNeurons, logAIUsage } from "../geo/_utils/ai-usage.js";
import { buildImagePrompt } from "./_prompt.js";
import { buildScenePrompt, seedFrom, NEGATIVE_PROMPT } from "./_poster.js";

/* Model sinh ảnh.

   Đổi 25/08/2026 vì người dùng phản ánh ảnh đơn điệu. flux-1-schnell là bản chưng cất
   nhanh nhất, 4 bước, KHÔNG nhận `seed` lẫn `negative_prompt` — nên hai bài cùng góc bán
   hàng ra ảnh gần y hệt, và mấy chữ "NO bottle" trong prompt thuận đôi khi làm nó vẽ
   THÊM chai vào nền.

   lucid-origin (Leonardo.AI, Cloudflare host) nhận seed + guidance + tới 40 bước, bám
   prompt tốt hơn hẳn. Đo giá: 1024×1024 ở 20 bước ≈ $0,031/ảnh, RẺ HƠN flux-1-schnell
   4 bước (~3.400 neuron ≈ $0,037). 2 ảnh/ngày ≈ $1,8/tháng.

   Giữ flux làm đường lui: model đối tác có thể chưa bật trên tài khoản, và mất ảnh thì
   hỏng cả bài. */
const MODEL_MAIN = "@cf/leonardo/lucid-origin";
const MODEL_FALLBACK = "@cf/black-forest-labs/flux-1-schnell";
const GATEWAY_ID = "doscom-erp";

/* 2026-08-16: Cloudflare bỏ width/height khỏi input schema của flux-1-schnell — gửi kèm
   là mọi lượt gen fail với 5006. lucid-origin thì CÓ nhận width/height. Nên tham số phải
   dựng riêng theo từng model, đừng gửi chung một gói. */
function inputFor(model, { prompt, seed, steps }) {
  if (model === MODEL_MAIN) {
    return { prompt, seed, steps: steps || 20, guidance: 4.5, width: 1024, height: 1024,
             negative_prompt: NEGATIVE_PROMPT };
  }
  return { prompt, steps: 4 };   // flux-1-schnell: chỉ hai tham số này là an toàn
}

// Giá: lucid-origin $0,007/ô 512×512 + $0,00013/bước. flux tính theo neuron.
function costOf(model, steps) {
  if (model === MODEL_MAIN) return Number((4 * 0.007 + (steps || 20) * 0.00013).toFixed(6));
  const n = estimateNeurons({ width: 1024, height: 1024, steps: 4 });
  return Number((n / 1000 * 0.011).toFixed(6));
}

export async function generateFlux(env, { scene, steps = 20, raw = false, seed = 0 }) {
  if (!env.AI) {
    const e = new Error("Thiếu binding Workers AI 'AI' — Pages → Settings → Functions → Bindings → Workers AI");
    e.kind = "no_binding";
    throw e;
  }
  const prompt = (raw ? String(scene || "") : buildImagePrompt(scene)).slice(0, 2000);

  let lastErr = null;
  for (const model of [MODEL_MAIN, MODEL_FALLBACK]) {
    try {
      const res = await env.AI.run(model, inputFor(model, { prompt, seed, steps }),
                                   { gateway: { id: GATEWAY_ID } });
      if (!res || !res.image) throw new Error("model trả về rỗng");
      const cost = costOf(model, steps);
      // Ghi nhận để bảng chi phí AI vẫn cộng được; quy về "neuron tương đương" theo đơn giá
      // neuron, vì bảng đó vốn tính theo neuron.
      try { await logAIUsage(env, { neurons: Math.round(cost / 0.011 * 1000), isImage: true }); } catch {}
      return { b64: res.image, model, cost_usd: cost };
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      // Hết lượt thì đổi model cũng vô ích — dừng luôn.
      if (/quota|limit|neuron/i.test(msg)) {
        const e = new Error(`Workers AI báo hết lượt: ${msg}`);
        e.kind = "quota";
        throw e;
      }
    }
  }
  const e = new Error(`Sinh ảnh lỗi: ${String(lastErr?.message || lastErr)}`);
  e.kind = "flux";
  throw e;
}

/* Chuẩn bị NGUYÊN LIỆU ảnh cho một bài. Trả:
     { image_url, bg_base64, image_base64, image_note, cost_usd }

   Hai đường, tuỳ SKU đã có ảnh thật hay chưa:

   A. CÓ ảnh sản phẩm trong thư viện (đường chính) — Flux chỉ sinh NỀN, sản phẩm lấy ảnh
      thật, chữ do trình duyệt vẽ. `image_base64` để trống: ảnh ghép hoàn chỉnh do trình
      duyệt dựng lúc người dùng xem duyệt rồi lưu ngược lại.

   B. CHƯA có ảnh sản phẩm — rơi về cách cũ: Flux vẽ cả sản phẩm, ra thẳng `image_base64`.
      Nhãn chai sẽ sai, nên đây chỉ là đường lui và luôn kèm ghi chú.

   Thiếu ảnh thì PHẢI nói rõ trong image_note. Im lặng trả bài thiếu ảnh là kiểu hỏng tệ nhất. */
export async function buildArtwork(env, { skuMain, images, angle, scene, seedKey = "" }) {
  const product = images && images[skuMain];

  /* Seed dựng từ bài + góc bán hàng: cùng một bài luôn ra cùng tấm (mở lại không đổi),
     nhưng hai bài khác nhau ra hai tấm khác nhau. "Ép làm mới" truyền seedKey khác. */
  const seed = seedFrom(`${seedKey}|${skuMain}|${angle}`);

  if (product) {
    try {
      const f = await generateFlux(env, {
        scene: buildScenePrompt(angle, scene, seed), raw: true, seed,
      });
      return { image_url: product, bg_base64: f.b64, image_base64: null,
               image_note: null, cost_usd: f.cost_usd, image_model: f.model };
    } catch (e) {
      // Không có nền thì vẫn còn ảnh sản phẩm để đăng — kém hơn nhưng không mất bài.
      return { image_url: product, bg_base64: null, image_base64: null, cost_usd: 0,
               image_note: `Chưa sinh được nền cho ảnh (${whyFlux(e)}). Bài đang dùng ảnh sản phẩm trơn. `
                         + `Bấm "Sinh lại" để thử lại nền.` };
    }
  }

  try {
    const f = await generateFlux(env, { scene, seed });
    return { image_url: null, bg_base64: null, image_base64: f.b64, cost_usd: f.cost_usd,
             image_note: `SKU ${skuMain} chưa có ảnh thật trong thư viện nên ảnh này do AI vẽ cả sản phẩm — `
                       + `nhãn có thể SAI. Soát kỹ trước khi đăng, hoặc nạp ảnh nền trắng cho SKU này.` };
  } catch (e) {
    return { image_url: null, bg_base64: null, image_base64: null, cost_usd: 0,
             image_note: `Bài chưa có ảnh: SKU ${skuMain} chưa có ảnh trong thư viện và ${whyFlux(e)}. `
                       + `Nạp ảnh nền trắng cho SKU này rồi bấm Sinh lại.` };
  }
}

function whyFlux(e) {
  return e && e.kind === "no_binding" ? "chưa bật binding Workers AI"
       : e && e.kind === "quota" ? "Workers AI báo hết lượt"
       : "Flux sinh ảnh lỗi";
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/* Đọc ảnh thư viện thành bytes để gửi thẳng cho Graph API.

   BẮT BUỘC đi qua binding ASSETS chứ không fetch bằng URL công khai: crm-doscom.pages.dev
   nằm sau Cloudflare Access, mọi file /sku-images/* trả 302 về trang đăng nhập khi gọi từ
   ngoài (đo thật 24/08/2026). Facebook đi lấy ảnh qua URL sẽ nhận trang HTML đăng nhập,
   không phải ảnh. ASSETS đọc trực tiếp từ bản deploy nên không đụng Access.

   Trả null nếu không đọc được — chỗ gọi phải coi như bài thiếu ảnh, đừng đăng bừa. */
export async function loadLibraryImage(env, request, path) {
  if (!path || !path.startsWith("/")) return null;
  const ext = (path.split(".").pop() || "").toLowerCase();
  const type = MIME[ext] || "image/png";
  try {
    let res = null;
    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
      res = await env.ASSETS.fetch(new URL(path, request.url).toString());
    }
    if (!res || !res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 100) return null;
    const bytes = new Uint8Array(buf);
    // Kiểm CHỮ KÝ file chứ không kiểm kích thước: trang chuyển hướng của Access chỉ 143 byte
    // nhưng một ngưỡng byte là thứ dễ sai. Không đúng magic number thì không phải ảnh, chấm hết.
    if (!isImageBytes(bytes)) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}

/* PNG: 89 50 4E 47 · JPEG: FF D8 FF · WEBP: "RIFF"…"WEBP" · GIF: "GIF8" */
function isImageBytes(b) {
  if (!b || b.length < 12) return false;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;
  return false;
}
