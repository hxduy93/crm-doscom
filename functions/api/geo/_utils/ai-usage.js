// Cloudflare Workers AI — neuron usage estimation + logging.
//
// Workers AI free tier: 10,000 neurons/ngày (reset 00:00 UTC).
// Quá tier: $0.011/1,000 neurons.
//
// Flux Schnell pricing (May 2026, empirical):
//   - 4 steps, 1280x720:  ~3,000 neurons
//   - 4 steps, 1024x1024: ~3,400 neurons
//   - 6 steps, 1280x720:  ~4,500 neurons
//   - 8 steps, 1280x720:  ~6,000 neurons
//   - 4 steps, 768x432:   ~1,800 neurons
//
// Công thức ước lượng: base = steps * 750, scale theo pixel count.

export const FREE_TIER_DAILY_LIMIT = 10000;
export const COST_PER_1K_NEURONS_USD = 0.011;

export function estimateNeurons({ width = 1280, height = 720, steps = 4 }) {
  const baseNeurons = (steps || 4) * 750;
  const pixelFactor = (width * height) / (1280 * 720);
  return Math.round(baseNeurons * Math.max(pixelFactor, 0.3));
}

export function estimateCostForUsage(totalNeurons) {
  // Chi phí phần VƯỢT free tier
  const over = Math.max(0, totalNeurons - FREE_TIER_DAILY_LIMIT);
  return Number((over / 1000 * COST_PER_1K_NEURONS_USD).toFixed(6));
}

export function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ghi nhận usage cho 1 lần gen ảnh. Tự upsert geo_ai_usage row của ngày hiện tại.
 */
export async function logAIUsage(env, { neurons, isImage = true }) {
  if (!env.DB || !neurons) return;
  const today = getTodayUTC();
  const now = Math.floor(Date.now() / 1000);

  const existing = await env.DB.prepare(
    `SELECT total_neurons, total_images FROM geo_ai_usage WHERE date = ?`
  ).bind(today).first();

  const newNeurons = (existing?.total_neurons || 0) + neurons;
  const newImages  = (existing?.total_images  || 0) + (isImage ? 1 : 0);
  const newCost    = estimateCostForUsage(newNeurons);

  await env.DB.prepare(`
    INSERT INTO geo_ai_usage (date, total_neurons, total_images, total_cost_usd, free_tier_limit, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      total_neurons = ?,
      total_images = ?,
      total_cost_usd = ?,
      updated_at = ?
  `).bind(
    today, newNeurons, newImages, newCost, FREE_TIER_DAILY_LIMIT, now,
    newNeurons, newImages, newCost, now
  ).run();

  return {
    date: today,
    neurons_added: neurons,
    total_neurons_today: newNeurons,
    total_images_today: newImages,
    cost_today_usd: newCost,
    free_tier_remaining: Math.max(0, FREE_TIER_DAILY_LIMIT - newNeurons),
    over_free_tier: newNeurons > FREE_TIER_DAILY_LIMIT,
  };
}

/**
 * Lấy snapshot usage hôm nay. Trả null nếu chưa có row (chưa gen ảnh nào hôm nay).
 */
export async function getTodayUsage(env) {
  if (!env.DB) return null;
  const today = getTodayUTC();
  const row = await env.DB.prepare(
    `SELECT * FROM geo_ai_usage WHERE date = ?`
  ).bind(today).first();
  return row || {
    date: today,
    total_neurons: 0,
    total_images: 0,
    total_cost_usd: 0,
    free_tier_limit: FREE_TIER_DAILY_LIMIT,
  };
}
