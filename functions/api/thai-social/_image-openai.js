// Sinh ảnh nền bằng model ảnh của OpenAI (dòng gpt-image).
//
// Vì sao thêm (25/08/2026): chủ dự án xem ảnh do Workers AI sinh và vẫn thấy xấu. Dòng
// gpt-image bám bố cục và dựng đồ hoạ tốt hơn hẳn mấy model khuếch tán mở — đúng thứ cần
// cho ảnh bài bán hàng. Không rẻ hơn, nhưng đây là chỗ đáng trả tiền: mỗi ngày 2 ảnh.
//
// Đường ra BẮT BUỘC qua Cloudflare AI Gateway `doscom-erp`, không gọi thẳng api.openai.com:
// Cloudflare định tuyến người dùng Việt Nam vào colo Hong Kong, gọi thẳng bị trả
// 403 "unsupported_country_region_territory". Cùng bài học đã ghi ở _utils/openai-chat.js
// và lib/ai-endpoint.js — đừng "tối ưu" bằng cách bỏ gateway.
//
// Giá tính theo TOKEN chứ không theo ảnh (bảng giá OpenAI 25/08/2026, USD/1M token đầu ra):
//   gpt-image-2 $30 · gpt-image-1.5 $32 · gpt-image-1 $40 · gpt-image-1-mini $8
// Nên chi phí thật lấy từ `usage` API trả về, KHÔNG ước lượng cứng trong code.

const PRICE_OUT_PER_1M = {
  "gpt-image-2": 30,
  "gpt-image-1.5": 32,
  "gpt-image-1": 40,
  "gpt-image-1-mini": 8,
};

// Thử lần lượt: tài khoản chưa được mở model mới thì tự tụt xuống model cũ hơn.
const MODEL_CHAIN = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"];

function baseUrl(env) {
  if (env.CF_ACCOUNT_ID) {
    return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/openai`;
  }
  return "https://api.openai.com/v1";
}

function costFrom(model, usage) {
  const out = (usage && (usage.output_tokens || usage.total_tokens)) || 0;
  const price = PRICE_OUT_PER_1M[model] || 30;
  return Number((out * price / 1_000_000).toFixed(6));
}

export function openaiImageAvailable(env) {
  return !!(env && env.OPENAI_API_KEY);
}

/* Sinh MỘT ảnh nền. Trả { b64, model, cost_usd }.

   size/quality đổi được qua env để chỉnh chất lượng đổi lấy tiền mà không phải deploy:
     THAI_IMAGE_SIZE     mặc định 1024x1024
     THAI_IMAGE_QUALITY  mặc định "medium" (low rẻ nhất, high nét nhất, đắt gấp ~4)
     THAI_IMAGE_MODEL    ép dùng đúng một model, bỏ qua chuỗi thử */
export async function generateOpenAIImage(env, { prompt }) {
  if (!openaiImageAvailable(env)) {
    const e = new Error("Thiếu OPENAI_API_KEY");
    e.kind = "no_key";
    throw e;
  }

  const size = env.THAI_IMAGE_SIZE || "1024x1024";
  const quality = env.THAI_IMAGE_QUALITY || "medium";
  const chain = env.THAI_IMAGE_MODEL ? [env.THAI_IMAGE_MODEL] : MODEL_CHAIN;

  let lastErr = null;
  for (const model of chain) {
    let res;
    try {
      res = await fetch(`${baseUrl(env)}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: String(prompt || "").slice(0, 4000),
          size,
          quality,
          n: 1,
          output_format: "png",
        }),
        // Ảnh chất lượng cao mất khá lâu; 90s như openai-chat.js là chưa đủ.
        signal: AbortSignal.timeout(150000),
      });
    } catch (err) {
      lastErr = err;
      continue;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      lastErr = new Error(`OpenAI ${model} ${res.status}: ${txt.slice(0, 250)}`);
      // Hết tiền / bị chặn vùng thì đổi model cũng vô ích — dừng ngay, đừng đốt thêm lượt.
      if (res.status === 401 || res.status === 429 || /region|territory|billing|quota/i.test(txt)) {
        lastErr.kind = res.status === 429 ? "quota" : "blocked";
        throw lastErr;
      }
      continue;   // 404/400 do model chưa mở → thử model kế
    }

    let data = null;
    try { data = await res.json(); } catch { data = null; }
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) {
      lastErr = new Error(`OpenAI ${model} trả về không có ảnh`);
      continue;
    }
    return { b64, model, cost_usd: costFrom(model, data.usage) };
  }

  const e = new Error(`OpenAI sinh ảnh lỗi: ${String(lastErr?.message || lastErr)}`);
  e.kind = lastErr?.kind || "openai";
  throw e;
}
