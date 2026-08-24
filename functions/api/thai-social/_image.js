// Chọn ảnh cho bài fanpage Thái.
//
// Thứ tự ưu tiên — cố ý đặt ảnh THẬT trước:
//   1. Thư viện ảnh sản phẩm nền trắng (xem _skus.js). Nhãn đúng, tỉ lệ đúng.
//   2. Flux Schnell, chỉ khi SKU chưa có ảnh trong thư viện.
//   3. Không có ảnh → bài vẫn giữ caption, nhưng ĐÁNH DẤU thiếu ảnh và nói rõ vì sao.
//      Không bao giờ trả bài như thể đã đủ ảnh.
//
// Đường gọi Flux giống hệt /api/geo/generate-image (binding AI + gateway doscom-erp),
// dùng chung hàm đo neuron của agent-geo để một chỗ đếm cost cho cả hai.

import { estimateNeurons, logAIUsage } from "../geo/_utils/ai-usage.js";
import { buildImagePrompt } from "./_prompt.js";
import { buildScenePrompt } from "./_poster.js";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const GATEWAY_ID = "doscom-erp";

/* 2026-08-16: Cloudflare bỏ width/height khỏi input schema của flux-1-schnell — gửi kèm
   là mọi lượt gen fail với 5006. Model tự trả 1024x1024. Giữ width/height ở đây CHỈ để
   ước lượng neuron, KHÔNG gửi lên Workers AI. Xem thêm generate-image.js. */
export async function generateFlux(env, { scene, steps = 4, raw = false }) {
  if (!env.AI) {
    const e = new Error("Thiếu binding Workers AI 'AI' — Pages → Settings → Functions → Bindings → Workers AI");
    e.kind = "no_binding";
    throw e;
  }
  const prompt = (raw ? String(scene || "") : buildImagePrompt(scene)).slice(0, 2000);
  let res;
  try {
    res = await env.AI.run(MODEL, { prompt, steps }, { gateway: { id: GATEWAY_ID } });
  } catch (err) {
    const msg = String(err?.message || err);
    const e = new Error(`Workers AI Flux lỗi: ${msg}`);
    e.kind = /quota|limit|neuron/i.test(msg) ? "quota" : "flux";
    throw e;
  }
  if (!res || !res.image) {
    const e = new Error("Flux trả về rỗng");
    e.kind = "flux";
    throw e;
  }
  const neurons = estimateNeurons({ width: 1024, height: 1024, steps });
  try { await logAIUsage(env, { neurons, isImage: true }); } catch { /* đo cost hỏng không được làm gãy bài */ }
  return { b64: res.image, neurons, cost_usd: Number((neurons / 1000 * 0.011).toFixed(6)) };
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
export async function buildArtwork(env, { skuMain, images, angle, scene }) {
  const product = images && images[skuMain];

  if (product) {
    try {
      const f = await generateFlux(env, { scene: buildScenePrompt(angle, scene), raw: true });
      return { image_url: product, bg_base64: f.b64, image_base64: null,
               image_note: null, cost_usd: f.cost_usd };
    } catch (e) {
      // Không có nền thì vẫn còn ảnh sản phẩm để đăng — kém hơn nhưng không mất bài.
      return { image_url: product, bg_base64: null, image_base64: null, cost_usd: 0,
               image_note: `Chưa sinh được nền cho ảnh (${whyFlux(e)}). Bài đang dùng ảnh sản phẩm trơn. `
                         + `Bấm "Sinh lại" để thử lại nền.` };
    }
  }

  try {
    const f = await generateFlux(env, { scene });
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
