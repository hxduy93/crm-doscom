// Endpoint: GET /api/geo/ai-usage
//
// Trả về Cloudflare Workers AI usage hôm nay (UTC) + 7 ngày gần nhất.
// UI dùng để hiển thị banner cảnh báo khi gần/vượt free tier 10K neurons/ngày.

import { FREE_TIER_DAILY_LIMIT, getTodayUTC, getTodayUsage } from "./_utils/ai-usage.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return jsonResponse({ error: "D1 binding 'DB' missing" }, 500);

  const today = await getTodayUsage(env);

  // Last 7 days
  const { results: history } = await env.DB.prepare(`
    SELECT date, total_neurons, total_images, total_cost_usd
    FROM geo_ai_usage
    WHERE date >= date('now', '-6 days')
    ORDER BY date DESC
  `).all();

  // Status classification cho UI
  const todayNeurons = today.total_neurons || 0;
  const usagePercent = Math.min(100, Math.round((todayNeurons / FREE_TIER_DAILY_LIMIT) * 100));
  let status = "ok";
  if (usagePercent >= 100)       status = "over_free";
  else if (usagePercent >= 95)   status = "critical";
  else if (usagePercent >= 70)   status = "warning";

  return jsonResponse({
    today: {
      date: today.date,
      neurons_used: todayNeurons,
      images_generated: today.total_images || 0,
      cost_usd: today.total_cost_usd || 0,
      free_tier_limit: FREE_TIER_DAILY_LIMIT,
      free_tier_remaining: Math.max(0, FREE_TIER_DAILY_LIMIT - todayNeurons),
      usage_percent: usagePercent,
      status,
    },
    last_7_days: history || [],
  });
}
