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
//
// NGÂN SÁCH (chốt 28/08/2026): chủ dự án chấp nhận 10 lượt chatgpt/ngày
//   → 10 × 30,4 × $0,025 = $7,60/tháng (~195.000đ).
//
// TRẦN COSTLY_JOBS_PER_DAY chính là thứ giữ đúng mức đó, KHÔNG phải nhịp tầng.
// Nhịp tầng cho ra 8/1 + 1/7 + 35/14 = 10,64 lượt/ngày — nhỉnh hơn trần một chút,
// nên trần cắt ~0,6 lượt mỗi ngày và tầng C trên thực tế giãn thành ~15 ngày/lần
// thay vì 14. Cố ý để vậy: trần là con số DUY NHẤT quyết định tiền, muốn đổi ngân
// sách thì sửa mỗi nó. Nhịp tầng chỉ xếp ai được ưu tiên trong hạn mức.
//
// Lý do phải có trần chứ không tin vào nhịp tầng: mỗi lần một câu đổi kết quả là nó
// nhảy lên tầng A, nên số câu tầng A tự lớn dần và chi phí trôi theo mà không ai thấy.
// Engine rẻ (gemini, $0,00037/lượt) vẫn chạy hàng ngày cho TẤT CẢ câu hỏi và làm
// chuông báo: gemini đổi kết quả cũng đủ kéo câu hỏi lên tầng A, nên tầng C không
// thành điểm mù dù 14 ngày mới tốn một lượt chatgpt.

const DAY = 86400;

/** Engine tính tiền theo LƯỢT (phí tool cố định) — chỉ nhóm này bị xếp tầng. */
export const COSTLY_ENGINES = new Set(["chatgpt"]);

/** Số ngày giữa hai lượt chạy engine đắt, theo tầng. */
export const TIER_INTERVAL_DAYS = { A: 1, B: 7, C: 14 };

/**
 * Trần cứng số lượt engine đắt được tạo MỖI NGÀY. 10 × 30,4 × $0,025 = $7,60/tháng
 * (~195.000đ) — mức chủ dự án chốt 28/08/2026.
 * Chỉnh qua env GEO_COSTLY_JOBS_PER_DAY. Đây là thứ THẬT SỰ chặn tiền — nhịp tầng
 * chỉ xếp thứ tự ai được ưu tiên trong hạn mức đó.
 */
export const COSTLY_JOBS_PER_DAY = 10;

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
    // Tầng A mà THIẾU hạn giữ (backfill từ migration, hoặc ai đó sửa tay) → cấp hạn
    // chuẩn, KHÔNG hạ tầng. Coi "thiếu hạn" là "hết hạn" thì mọi câu hỏi vừa được xếp
    // tầng A sẽ rơi xuống C ngay lượt chạy đầu tiên, vứt đúng phần phân loại vừa tính.
    // (Đã xảy ra thật 28/08/2026: 8 câu tầng A tụt còn 7 sau mẻ chạy đầu.)
    if (!tierUntil) {
      return {
        tier: "A",
        tier_until: nowSec + PROMOTE_DAYS * DAY,
        tier_reason: "cấp hạn giữ tầng A",
        changed: true,
      };
    }
    if (Number(tierUntil) > nowSec) {
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
export function buildJobPlan(queries, engines, runsPerQuery, nowSec, costlyCap = COSTLY_JOBS_PER_DAY) {
  const jobs = [];
  const reschedule = [];
  const skipped = [];

  const cheapEngines  = engines.filter(e => !isCostlyEngine(e));
  const costlyEngines = engines.filter(isCostlyEngine);

  // Engine rẻ: mọi câu hỏi, không xếp tầng, không đụng trần.
  for (const q of queries) {
    for (const engine of cheapEngines) {
      for (let seq = 1; seq <= runsPerQuery; seq++) {
        jobs.push({ query_id: q.id, engine, run_seq: seq });
      }
    }
  }

  if (costlyEngines.length === 0) return { jobs, reschedule, skipped, capped: 0 };

  // Engine đắt: lọc câu tới hạn, xếp CÂU QUÁ HẠN LÂU NHẤT LÊN TRƯỚC rồi cắt theo trần.
  // Không sắp xếp thì trần cắt theo thứ tự ngẫu nhiên của D1 và một số câu có thể
  // bị bỏ qua vĩnh viễn — đúng kiểu hỏng âm thầm mà không ai thấy.
  const due = queries
    .filter(q => isDue(q, nowSec))
    .sort((a, b) => (Number(a.next_run_at ?? 0) - Number(b.next_run_at ?? 0)));

  const cap = Number.isFinite(costlyCap) && costlyCap > 0 ? Math.floor(costlyCap) : due.length;
  const chosen = due.slice(0, cap);
  const overCap = due.slice(cap);

  for (const q of chosen) {
    for (const engine of costlyEngines) {
      for (let seq = 1; seq <= runsPerQuery; seq++) {
        jobs.push({ query_id: q.id, engine, run_seq: seq });
      }
    }
    reschedule.push({ query_id: q.id, next_run_at: nextRunAt(q.tier, nowSec) });
  }

  // Câu chưa tới hạn → hoãn theo tầng. Câu tới hạn nhưng vượt trần → KHÔNG dời lịch,
  // để mai chúng vẫn quá hạn và được ưu tiên lên đầu.
  for (const q of queries) {
    if (isDue(q, nowSec)) continue;
    for (const engine of costlyEngines) {
      skipped.push({ query_id: q.id, engine, tier: q.tier || "C", reason: "chưa tới hạn", next_run_at: q.next_run_at ?? null });
    }
  }
  for (const q of overCap) {
    for (const engine of costlyEngines) {
      skipped.push({ query_id: q.id, engine, tier: q.tier || "C", reason: "vượt trần ngày", next_run_at: q.next_run_at ?? null });
    }
  }

  return { jobs, reschedule, skipped, capped: overCap.length };
}
