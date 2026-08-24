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

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const GATEWAY_ID = "doscom-erp";

/* 2026-08-16: Cloudflare bỏ width/height khỏi input schema của flux-1-schnell — gửi kèm
   là mọi lượt gen fail với 5006. Model tự trả 1024x1024. Giữ width/height ở đây CHỈ để
   ước lượng neuron, KHÔNG gửi lên Workers AI. Xem thêm generate-image.js. */
export async function generateFlux(env, { scene, steps = 4 }) {
  if (!env.AI) {
    const e = new Error("Thiếu binding Workers AI 'AI' — Pages → Settings → Functions → Bindings → Workers AI");
    e.kind = "no_binding";
    throw e;
  }
  const prompt = buildImagePrompt(scene).slice(0, 2000);
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

/* Trả { image_url, image_base64, image_note, cost_usd }.
   image_note khác null nghĩa là bài THIẾU ảnh — UI phải hiện, đừng nuốt. */
export async function pickImage(env, { skuMain, images, scene }) {
  const fromLib = images && images[skuMain];
  if (fromLib) return { image_url: fromLib, image_base64: null, image_note: null, cost_usd: 0 };

  try {
    const f = await generateFlux(env, { scene });
    return { image_url: null, image_base64: f.b64, image_note: null, cost_usd: f.cost_usd };
  } catch (e) {
    const why = e.kind === "no_binding"
      ? "chưa bật binding Workers AI"
      : e.kind === "quota"
        ? "Workers AI báo hết lượt"
        : "Flux sinh ảnh lỗi";
    return {
      image_url: null,
      image_base64: null,
      cost_usd: 0,
      image_note: `Bài chưa có ảnh: SKU ${skuMain} chưa có ảnh trong thư viện và ${why}. `
                + `Nạp ảnh nền trắng cho SKU này rồi bấm Sinh lại.`,
    };
  }
}
