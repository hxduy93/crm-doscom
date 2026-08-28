// Lịch quét theo TẦNG cho các câu hỏi GEO — logic thuần, không đụng D1.
//
// Bài toán: engine chatgpt gọi kèm tool web_search, giá CỐ ĐỊNH $0,025 mỗi lượt
// (bảng giá OpenAI: $25/1.000 lượt) bất kể câu hỏi dài ngắn. Đo trên geo_runs tới
// 28/08/2026: 1.991 lượt = $51,06, trong đó ~$50 là phí tool. Mà 35/44 câu hỏi
// chưa bao giờ được nhắc qua trung bình 45 lượt mỗi câu — tiền đổ vào chỗ đứng yên.
//
// Cách chữa: giữ nguyên web_search (nó CHÍNH LÀ phép đo — gemini không có web
// grounding nên brand_url_cited luôn 0), nhưng đổi NHỊP quét theo tín hiệu:
//   A — kết quả từng thay đổi   → hàng ngày
//   B — luôn được nhắc          → 7 ngày/lần
//   C — chưa bao giờ được nhắc  → 14 ngày/lần
// Engine rẻ (gemini, $0,00037/lượt) vẫn chạy hàng ngày cho TẤT CẢ câu hỏi và làm
// chuông báo: gemini đổi kết quả cũng đủ kéo câu hỏi lên tầng A, nên tầng C không
// thành điểm mù dù 14 ngày mới tốn một lượt chatgpt.

const DAY = 86400;

/** Engine tính tiền theo LƯỢT (phí tool cố định) — chỉ nhóm này bị xếp tầng. */
export const COSTLY_ENGINES = new Set(["chatgpt"]);

/** Số ngày giữa hai lượt chạy engine đắt, theo tầng. */
export const TIER_INTERVAL_DAYS = { A: 1, B: 7, C: 14 };

/** Giữ ở tầng A bao lâu sau khi kết quả thay đổi. */
export const PROMOTE_DAYS = 30;

/** Giữ ở tầng A bao lâu sau khi đăng bài GEO nhắm vào câu hỏi đó. */
export const ARTICLE_PROMOTE_DAYS = 14;

export function isCostlyEngine(engine) {
  return COSTLY_ENGINES.has(String(engine || "").toLowerCase());
}

export function tierIntervalDays(tier) {
  const t = String(tier || "").toUpperCase();
  return TIER_INTERVAL_DAYS[t] ?? TIER_INTERVAL_DAYS.C;
}

export function nextRunAt(tier, nowSec) {
  return nowSec + tierIntervalDays(tier) * DAY;
}

/** Câu hỏi đã tới hạn chạy engine đắt chưa. Chưa có lịch (null) = chạy ngay. */
export function isDue(query, nowSec) {
  const n = query?.next_run_at;
  if (n === null || n === undefined || n === "") return true;
  return Number(n) <= nowSec;
}

/**
 * Vân tay kết quả một lượt chạy: đổi vân tay = có tín hiệu mới đáng đo dày.
 * Dùng cả 3 cờ vì brand có thể được nhắc mà không được trích dẫn URL và ngược lại.
 */
export function runSignature(run) {
  const f = (v) => (Number(v) > 0 ? 1 : 0);
  return `${f(run?.doscom_mentioned)}|${f(run?.noma_mentioned)}|${f(run?.brand_url_cited)}`;
}

/** Vân tay có ít nhất một cờ bật = engine đang nhắc tới brand. */
export function hasBrandSignal(signature) {
  return String(signature || "").includes("1");
}

/**
 * Quyết tầng mới sau một lượt chạy vừa ghi xong.
 *
 * prevSignature = null (lượt đầu tiên của cặp query×engine) thì KHÔNG thăng tầng —
 * chưa có gì để so, thăng ở đây là thăng cho mọi câu hỏi mới, đúng thứ đang muốn tránh.
 *
 * Trả { tier, tier_until, tier_reason, changed }. changed=false thì khỏi ghi D1.
 */
export function decideTier({ tier, tierUntil, prevSignature, newSignature, nowSec }) {
  const cur = String(tier || "C").toUpperCase();

  // 1) Kết quả vừa đổi → lên tầng A và giữ 30 ngày, kể cả tín hiệu đến từ engine rẻ.
  if (prevSignature && newSignature && prevSignature !== newSignature) {
    return {
      tier: "A",
      tier_until: nowSec + PROMOTE_DAYS * DAY,
      tier_reason: "kết quả vừa thay đổi",
      changed: true,
    };
  }

  // 2) Đang ở tầng A: còn hạn thì giữ nguyên, hết hạn mà vẫn đứng yên thì hạ tầng.
  if (cur === "A") {
    if (tierUntil && Number(tierUntil) > nowSec) {
      return { tier: "A", tier_until: Number(tierUntil), tier_reason: null, changed: false };
    }
    const t = hasBrandSignal(newSignature) ? "B" : "C";
    return {
      tier: t,
      tier_until: null,
      tier_reason: `hạ tầng: ${PROMOTE_DAYS} ngày không đổi kết quả`,
      changed: true,
    };
  }

  // 3) Tầng B/C tự chỉnh theo tín hiệu mới nhất — được nhắc thì canh dày hơn.
  const steady = hasBrandSignal(newSignature) ? "B" : "C";
  if (steady !== cur) {
    return {
      tier: steady,
      tier_until: null,
      tier_reason: steady === "B" ? "đang được nhắc — canh hàng tuần" : "chưa được nhắc — canh hai tuần/lần",
      changed: true,
    };
  }

  return { tier: cur, tier_until: null, tier_reason: null, changed: false };
}

/**
 * Dựng danh sách job cần tạo cho một lượt cron.
 *
 * Engine rẻ: mọi câu hỏi active, như cũ.
 * Engine đắt: chỉ câu hỏi đã tới hạn theo tầng.
 *
 * Trả kèm `skipped` để endpoint báo ra — bỏ bớt việc mà im lặng thì lần sau
 * người đọc log tưởng đã quét đủ.
 */
export function buildJobPlan(queries, engines, runsPerQuery, nowSec) {
  const jobs = [];
  const reschedule = [];
  const skipped = [];
  const hasCostly = engines.some(isCostlyEngine);

  for (const q of queries) {
    const due = isDue(q, nowSec);

    for (const engine of engines) {
      if (isCostlyEngine(engine) && !due) {
        skipped.push({ query_id: q.id, engine, tier: q.tier || "C", next_run_at: q.next_run_at ?? null });
        continue;
      }
      for (let seq = 1; seq <= runsPerQuery; seq++) {
        jobs.push({ query_id: q.id, engine, run_seq: seq });
      }
    }

    if (hasCostly && due) {
      reschedule.push({ query_id: q.id, next_run_at: nextRunAt(q.tier, nowSec) });
    }
  }

  return { jobs, reschedule, skipped };
}
