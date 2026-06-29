// Fastpath: pattern-match câu hỏi đơn giản → gọi tool trực tiếp, SKIP LLM.
// Pattern Doscom Ops Agent — tiết kiệm 30-50% LLM call cho query lặp lại.
//
// Mỗi rule có:
//   - test(text): regex/keyword match
//   - run(ctx, match): execute tool và format response Vietnamese
//
// Trả về null nếu không match → fall through agent loop có LLM.
//
// Cost: $0 vì không gọi LLM. Latency ~500ms (chỉ fetch tool data).

import { runTool } from "./hermesTools.js";

function vnd(n) {
  return new Intl.NumberFormat("vi-VN").format(n) + " VND";
}

function pct(n, d = 1) {
  return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)) + "%";
}

// ────────────────────────────────────────────────────────────
// Rules — sắp xếp theo độ specific giảm dần (rule hẹp trước)
// ────────────────────────────────────────────────────────────

// Detect staff trong text
function detectStaff(text) {
  if (/ph[ưu][ơo]ng\s*nam|\bpn\b/i.test(text)) return "PHUONG_NAM";
  if (/\bduy\b/i.test(text)) return "DUY";
  return null;
}

// Detect time preset
function detectTimePreset(text) {
  const t = text.toLowerCase();
  if (/(hôm nay|today)/.test(t)) return "today";
  if (/(hôm qua|yesterday)/.test(t)) return "yesterday";
  if (/(tuần này|this week)/.test(t)) return "this_week";
  if (/(tuần (trước|qua)|last week)/.test(t)) return "last_week";
  if (/(tháng này|this month|mtd|mt d)/.test(t)) return "this_month";
  if (/(tháng (trước|qua)|last month)/.test(t)) return "last_month";
  if (/7\s*ng[àa]y/.test(t)) return "last_7d";
  if (/30\s*ng[àa]y/.test(t)) return "last_30d";
  if (/90\s*ng[àa]y/.test(t)) return "last_90d";
  return null;
}

// Đếm số time-preset KHÁC NHAU xuất hiện trong text (để nhận query đa-kỳ
// kiểu "tuần này và tuần trước" → là so sánh, fastpath không kham nổi).
function countTimePresets(text) {
  const t = text.toLowerCase();
  const pats = [
    /hôm nay|today/, /hôm qua|yesterday/, /tuần này|this week/,
    /tuần (trước|qua)|last week/, /tháng này|this month|mtd/,
    /tháng (trước|qua)|last month/, /7\s*ng[àa]y/, /30\s*ng[àa]y/, /90\s*ng[àa]y/,
  ];
  return pats.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
}

// Tín hiệu câu vượt khả năng fastpath → phải nhường cho LLM (gọi tool nhiều lần,
// ghép kết quả, so sánh, parse ngày tùy chỉnh). Fastpath chỉ được short-circuit
// khi xử lý TRỌN VẸN cả câu; có bất kỳ tín hiệu dưới đây → bail.
const COMPARE_RE = /so s[áa]nh|so v[ớo]i|\bvs\b|chênh l[ệe]ch|tăng hay gi[ảa]m|cùng k[ỳy]|với k[ỳy]|với kho[ảa]ng/i;
// Ngày/khoảng ngày tùy chỉnh: "15-21/6", "15/6", "ngày 15", "từ 15/6".
const DATE_RE = /\d{1,2}\s*[-–]\s*\d{1,2}\s*\/\s*\d{1,2}|\bng[àa]y\s*\d{1,2}|\bt[ừu]\s+\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s*\/\s*\d{1,2}(\s*\/\s*\d{2,4})?/;

export function isComplexQuery(text) {
  const t = String(text || "");
  if (COMPARE_RE.test(t)) return true;   // so sánh / với kỳ / với khoảng
  if (DATE_RE.test(t)) return true;      // có ngày/khoảng ngày tùy chỉnh
  if (countTimePresets(t) >= 2) return true; // đa-kỳ ("tuần này và tuần trước")
  return false;
}

const RULES = [
  // ─────────────────────────────────────────────
  // R1: "spend của [staff] [time]" hoặc "[staff] spend bao nhiêu [time]"
  // ─────────────────────────────────────────────
  {
    name: "fb_staff_spend",
    test: (text) => {
      const hasSpend = /(spend|chi phí|chi tiêu|tốn|đốt)/i.test(text);
      const staff = detectStaff(text);
      return hasSpend && staff ? { staff, time: detectTimePreset(text) || "this_month" } : null;
    },
    run: async (ctx, match) => {
      const data = await runTool("get_fb_staff_spend", { staff: match.staff, time_preset: match.time }, ctx);
      if (data?.error) return `❌ Lỗi lấy data: ${data.error}`;
      const lines = [];
      lines.push(`**${match.staff} — ${match.time}**`);
      lines.push(``);
      lines.push(`💰 Tổng spend: **${vnd(data.total_spend_vnd)}**`);
      if (data.total_conversions > 0) {
        lines.push(`📈 Conversions: ${data.total_conversions} · CPA TB: ${vnd(data.cpa_avg)}`);
      }
      lines.push(``);
      lines.push(`| Account | Spend | Active | Paused (đã đốt) |`);
      lines.push(`|---|---:|---:|---:|`);
      for (const a of data.accounts) {
        if (a.spend === 0) continue;
        lines.push(`| ${a.id} | ${vnd(a.spend)} | ${a.active_campaigns} | ${a.paused_with_spend} |`);
      }
      lines.push(``);
      lines.push(`_${data.note || ""}_`);
      return lines.join("\n");
    },
  },

  // ─────────────────────────────────────────────
  // R2: "kpi" — KPI tháng + tiến độ
  // ─────────────────────────────────────────────
  {
    name: "kpi_status",
    test: (text) => /\bkpi\b/i.test(text) ? {} : null,
    run: async (ctx) => {
      const k = await runTool("get_kpi_status", {}, ctx);
      if (k?.error) return `❌ ${k.error}`;
      const status = k.progress_pct >= 100 ? "✅ ĐẠT" :
                     k.progress_pct >= 80 ? "🟢 ON TRACK" :
                     k.progress_pct >= 50 ? "🟡 CẨN THẬN" : "🔴 RỦI RO";
      return [
        `**KPI tháng — ${k.time_range?.label || "this_month"}**`,
        ``,
        `🎯 Mục tiêu: ${vnd(k.kpi_revenue_monthly_vnd)}`,
        `📊 Hiện tại: ${vnd(k.revenue_mtd_vnd)} (${pct(k.progress_pct)})`,
        `💵 Profit: ${vnd(k.profit_mtd_vnd)}`,
        `📉 Còn thiếu: ${vnd(k.gap_vnd)}`,
        ``,
        `Trạng thái: ${status}`,
      ].join("\n");
    },
  },

  // ─────────────────────────────────────────────
  // R3: "geo [status?]" — GEO queue
  // ─────────────────────────────────────────────
  {
    name: "geo_queue",
    test: (text) => {
      if (!/\bgeo\b|content pipeline|chờ duyệt|pending review|bài (viết|đăng)/i.test(text)) return null;
      let status = null;
      if (/chờ duyệt|pending/i.test(text)) status = "pending_review";
      else if (/đã (đăng|publish)|published/i.test(text)) status = "published";
      else if (/đang viết|drafting/i.test(text)) status = "drafting";
      let brand = "all";
      if (/doscom/i.test(text)) brand = "doscom";
      else if (/noma/i.test(text)) brand = "noma";
      return { status, brand };
    },
    run: async (ctx, match) => {
      const data = await runTool("get_geo_queue", {
        status: match.status, brand: match.brand, limit: 10,
      }, ctx);
      if (data?.error) return `❌ ${data.error}`;
      if (!data.count) return `📝 Không có bài GEO nào${match.status ? ` ở status ${match.status}` : ""}.`;
      const lines = [`📝 **${data.count} bài GEO** (${match.brand}${match.status ? `, ${match.status}` : ""}):`, ``];
      lines.push(`| # | Brand | Status | Title |`);
      lines.push(`|---|---|---|---|`);
      for (let i = 0; i < data.articles.length; i++) {
        const a = data.articles[i];
        lines.push(`| ${i+1} | ${a.brand} | ${a.status} | ${a.title || "(no title)"} |`);
      }
      return lines.join("\n");
    },
  },

  // ─────────────────────────────────────────────
  // R4: "spend [time]" KHÔNG có staff — total
  // ─────────────────────────────────────────────
  {
    name: "fb_total_spend",
    test: (text) => {
      const hasSpend = /(spend|chi phí|chi tiêu|tốn|đốt)/i.test(text);
      const time = detectTimePreset(text);
      const noStaff = !detectStaff(text);
      return hasSpend && time && noStaff ? { time } : null;
    },
    run: async (ctx, match) => {
      const data = await runTool("get_fb_spend", { time_preset: match.time, group: "ALL" }, ctx);
      if (data?.error) return `❌ ${data.error}`;
      const accs = data.accounts_summary?.filter(a => a.spend > 0) || [];
      const total = accs.reduce((s, a) => s + a.spend, 0);
      const lines = [`💰 **Tổng spend FB — ${data.time_range?.label || match.time}**: ${vnd(total)}`, ``];
      if (data.profit_total) {
        lines.push(`📈 Revenue: ${vnd(data.profit_total.revenue)} · Profit: ${vnd(data.profit_total.profit)} · ${data.profit_total.orders} orders`);
        lines.push(``);
      }
      lines.push(`| Account | Spend | Leads | Conv |`);
      lines.push(`|---|---:|---:|---:|`);
      for (const a of accs) {
        lines.push(`| ${a.name?.slice(0, 30) || a.id} | ${vnd(a.spend)} | ${a.leads || 0} | ${a.conversions || 0} |`);
      }
      return lines.join("\n");
    },
  },
];

// ────────────────────────────────────────────────────────────
// Main: match + execute
// ────────────────────────────────────────────────────────────
export async function tryFastpath(userMessage, ctx) {
  const text = String(userMessage || "").trim();
  if (text.length === 0 || text.length > 200) return null;  // câu quá dài → để LLM

  // Câu có ý so sánh / nhiều kỳ / ngày tùy chỉnh → fastpath không kham nổi.
  // Nhường cho agent loop (LLM) để gọi tool nhiều lần và ghép kết quả.
  if (isComplexQuery(text)) return null;

  for (const rule of RULES) {
    let match;
    try { match = rule.test(text); } catch { continue; }
    if (!match) continue;
    try {
      const response = await rule.run(ctx, match);
      return {
        matched: rule.name,
        match_input: match,
        response,
      };
    } catch (e) {
      // Rule match nhưng exec fail → trả error rõ ràng thay vì fallback LLM
      // (LLM không có data sẽ bịa số → tệ hơn nói thẳng "lỗi fetch data").
      console.warn(`Fastpath ${rule.name} exec fail:`, e.message);
      return {
        matched: rule.name + "_error",
        match_input: match,
        response: `⚠ Lỗi lấy data cho rule \`${rule.name}\`: ${e.message}\n\nThử lại sau 5s hoặc báo admin nếu kéo dài.`,
      };
    }
  }
  return null;
}
