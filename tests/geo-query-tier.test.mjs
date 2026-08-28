import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARTICLE_PROMOTE_DAYS,
  COSTLY_JOBS_PER_DAY,
  PROMOTE_DAYS,
  buildJobPlan,
  decideTier,
  hasBrandSignal,
  isCostlyEngine,
  isDue,
  nextRunAt,
  runSignature,
  tierIntervalDays,
} from "../functions/api/geo/_utils/query-tier.js";

const DAY = 86400;
const NOW = 1_800_000_000;

// ---------------------------------------------------------------- nhịp theo tầng

test("nhịp quét: A hàng ngày, B 7 ngày, C 14 ngày; tầng lạ rơi về C", () => {
  assert.equal(tierIntervalDays("A"), 1);
  assert.equal(tierIntervalDays("B"), 7);
  assert.equal(tierIntervalDays("C"), 14);
  assert.equal(tierIntervalDays("a"), 1);        // không phân biệt hoa thường
  assert.equal(tierIntervalDays(null), 14);      // thiếu tier = quét thưa nhất, KHÔNG phải dày nhất
  assert.equal(tierIntervalDays("Z"), 14);
});

test("chỉ chatgpt bị xếp tầng — gemini rẻ nên chạy hàng ngày cho tất cả", () => {
  assert.equal(isCostlyEngine("chatgpt"), true);
  assert.equal(isCostlyEngine("ChatGPT"), true);
  assert.equal(isCostlyEngine("gemini"), false);
  assert.equal(isCostlyEngine(undefined), false);
});

test("nextRunAt cộng đúng số ngày của tầng", () => {
  assert.equal(nextRunAt("A", NOW), NOW + 1 * DAY);
  assert.equal(nextRunAt("C", NOW), NOW + 14 * DAY);
});

test("isDue: chưa có lịch thì chạy ngay; đúng mốc cũng tính là tới hạn", () => {
  assert.equal(isDue({ next_run_at: null }, NOW), true);
  assert.equal(isDue({}, NOW), true);
  assert.equal(isDue({ next_run_at: NOW }, NOW), true);
  assert.equal(isDue({ next_run_at: NOW - 1 }, NOW), true);
  assert.equal(isDue({ next_run_at: NOW + 1 }, NOW), false);
});

// ---------------------------------------------------------------- vân tay kết quả

test("vân tay dùng cả 3 cờ: được nhắc mà không được cite là khác trạng thái", () => {
  assert.equal(runSignature({ doscom_mentioned: 1, noma_mentioned: 0, brand_url_cited: 0 }), "1|0|0");
  assert.equal(runSignature({ doscom_mentioned: 1, noma_mentioned: 0, brand_url_cited: 1 }), "1|0|1");
  assert.equal(runSignature({}), "0|0|0");
  // detectMentions trả boolean, geo_runs lưu 0/1 — hai kiểu phải ra cùng vân tay
  assert.equal(
    runSignature({ doscom_mentioned: true, noma_mentioned: false, brand_url_cited: true }),
    runSignature({ doscom_mentioned: 1, noma_mentioned: 0, brand_url_cited: 1 })
  );
});

test("hasBrandSignal chỉ đúng khi có ít nhất một cờ bật", () => {
  assert.equal(hasBrandSignal("0|0|0"), false);
  assert.equal(hasBrandSignal("0|0|1"), true);
});

// ---------------------------------------------------------------- thăng / giáng tầng

test("kết quả đổi → lên tầng A, giữ 30 ngày", () => {
  const d = decideTier({
    tier: "C", tierUntil: null,
    prevSignature: "0|0|0", newSignature: "1|0|0",
    nowSec: NOW,
  });
  assert.equal(d.tier, "A");
  assert.equal(d.tier_until, NOW + PROMOTE_DAYS * DAY);
  assert.equal(d.changed, true);
});

test("lượt ĐẦU TIÊN (chưa có lượt trước) KHÔNG được thăng tầng", () => {
  // Nếu thăng ở đây thì mọi câu hỏi mới đều nhảy lên tầng A — đúng thứ đang muốn tránh.
  const d = decideTier({
    tier: "C", tierUntil: null,
    prevSignature: null, newSignature: "0|0|0",
    nowSec: NOW,
  });
  assert.equal(d.tier, "C");
  assert.equal(d.changed, false);
});

test("tầng A còn hạn thì giữ nguyên, không ghi D1 thừa", () => {
  const d = decideTier({
    tier: "A", tierUntil: NOW + 5 * DAY,
    prevSignature: "1|0|0", newSignature: "1|0|0",
    nowSec: NOW,
  });
  assert.equal(d.tier, "A");
  assert.equal(d.changed, false);
});

test("tầng A THIẾU hạn giữ → cấp hạn, KHÔNG hạ tầng ngay lượt đầu", () => {
  // Bẫy thật 28/08/2026: migration backfill đặt tier='A' nhưng tier_until=NULL.
  // Coi "thiếu hạn" là "hết hạn" thì 8 câu tầng A tụt xuống C ngay mẻ chạy đầu tiên,
  // vứt sạch phần phân loại vừa tính từ lịch sử geo_runs.
  const d = decideTier({
    tier: "A", tierUntil: null,
    prevSignature: "0|0|0", newSignature: "0|0|0",
    nowSec: NOW,
  });
  assert.equal(d.tier, "A");
  assert.equal(d.tier_until, NOW + PROMOTE_DAYS * DAY);
  assert.equal(d.changed, true);
});

test("tầng A hết hạn mà vẫn đứng yên → hạ về C nếu chưa từng được nhắc", () => {
  const d = decideTier({
    tier: "A", tierUntil: NOW - 1,
    prevSignature: "0|0|0", newSignature: "0|0|0",
    nowSec: NOW,
  });
  assert.equal(d.tier, "C");
  assert.equal(d.tier_until, null);
  assert.equal(d.changed, true);
});

test("tầng A hết hạn nhưng đang được nhắc → hạ về B để còn canh tụt hạng", () => {
  const d = decideTier({
    tier: "A", tierUntil: NOW - 1,
    prevSignature: "1|0|1", newSignature: "1|0|1",
    nowSec: NOW,
  });
  assert.equal(d.tier, "B");
  assert.equal(d.changed, true);
});

test("C bắt đầu được nhắc mà vân tay không đổi → tự lên B", () => {
  const d = decideTier({
    tier: "C", tierUntil: null,
    prevSignature: "1|0|0", newSignature: "1|0|0",
    nowSec: NOW,
  });
  assert.equal(d.tier, "B");
  assert.equal(d.changed, true);
});

test("C vẫn không được nhắc → đứng yên, không ghi D1", () => {
  const d = decideTier({
    tier: "C", tierUntil: null,
    prevSignature: "0|0|0", newSignature: "0|0|0",
    nowSec: NOW,
  });
  assert.equal(d.tier, "C");
  assert.equal(d.changed, false);
});

// ---------------------------------------------------------------- dựng kế hoạch job

const ENGINES = ["chatgpt", "gemini"];

test("engine rẻ chạy cho MỌI query, engine đắt chỉ cho query tới hạn", () => {
  const queries = [
    { id: "q1", tier: "A", next_run_at: NOW - DAY },   // tới hạn
    { id: "q2", tier: "C", next_run_at: NOW + 9 * DAY }, // chưa tới hạn
  ];
  const { jobs, skipped } = buildJobPlan(queries, ENGINES, 1, NOW);

  const gemini = jobs.filter(j => j.engine === "gemini").map(j => j.query_id);
  const chatgpt = jobs.filter(j => j.engine === "chatgpt").map(j => j.query_id);

  assert.deepEqual(gemini.sort(), ["q1", "q2"]);   // rẻ → cả hai
  assert.deepEqual(chatgpt, ["q1"]);               // đắt → chỉ câu tới hạn
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].query_id, "q2");
  assert.equal(skipped[0].tier, "C");
});

test("query tới hạn được dời lịch theo ĐÚNG tầng của nó", () => {
  const queries = [
    { id: "qa", tier: "A", next_run_at: 0 },
    { id: "qb", tier: "B", next_run_at: 0 },
    { id: "qc", tier: "C", next_run_at: 0 },
  ];
  const { reschedule } = buildJobPlan(queries, ENGINES, 1, NOW);
  const map = Object.fromEntries(reschedule.map(r => [r.query_id, r.next_run_at]));
  assert.equal(map.qa, NOW + 1 * DAY);
  assert.equal(map.qb, NOW + 7 * DAY);
  assert.equal(map.qc, NOW + 14 * DAY);
});

test("query CHƯA tới hạn thì không bị dời lịch — dời là đẩy lùi vô hạn", () => {
  const queries = [{ id: "q2", tier: "C", next_run_at: NOW + 9 * DAY }];
  const { reschedule } = buildJobPlan(queries, ENGINES, 1, NOW);
  assert.equal(reschedule.length, 0);
});

test("runs_per_query nhân lên đúng số job của từng engine", () => {
  const queries = [{ id: "q1", tier: "A", next_run_at: 0 }];
  const { jobs } = buildJobPlan(queries, ENGINES, 3, NOW);
  assert.equal(jobs.length, 6);                                  // 2 engine × 3 lượt
  assert.deepEqual(jobs.filter(j => j.engine === "chatgpt").map(j => j.run_seq), [1, 2, 3]);
});

test("chỉ có engine rẻ thì không đụng tới lịch tầng", () => {
  const queries = [{ id: "q1", tier: "C", next_run_at: 0 }];
  const { jobs, reschedule, skipped } = buildJobPlan(queries, ["gemini"], 1, NOW);
  assert.equal(jobs.length, 1);
  assert.equal(reschedule.length, 0);
  assert.equal(skipped.length, 0);
});

// ---------------------------------------------------------------- tiết kiệm thật

test("ngân sách: TRẦN giữ đúng 10 lượt/ngày = $7,60/tháng như chủ dự án chốt", () => {
  // Trần là con số DUY NHẤT quyết định tiền. Đây là test canh ngân sách:
  // đổi COSTLY_JOBS_PER_DAY mà quên báo chủ dự án là test này đỏ.
  assert.equal(COSTLY_JOBS_PER_DAY, 10);
  const tranThang = COSTLY_JOBS_PER_DAY * 30.4 * 0.025;
  assert.ok(tranThang > 7.3 && tranThang < 7.9, `trần $${tranThang.toFixed(2)}/tháng`);

  // Phân bổ đo thật trên geo_runs 28/08/2026: A=8, B=1, C=35.
  const perDay = 8 / tierIntervalDays("A") + 1 / tierIntervalDays("B") + 35 / tierIntervalDays("C");

  // Nhịp tầng nhỉnh hơn trần một chút → trần cắt ~0,6 lượt/ngày, tầng C thực tế
  // giãn thành ~15 ngày/lần. CỐ Ý: tiền do trần quyết, không do nhịp.
  assert.ok(perDay > COSTLY_JOBS_PER_DAY, "nhịp tầng phải chạm trần thì trần mới là thứ quyết tiền");
  assert.ok(perDay - COSTLY_JOBS_PER_DAY < 1.5, `trần cắt quá nhiều: ${(perDay - COSTLY_JOBS_PER_DAY).toFixed(2)} lượt/ngày`);

  // Tiền thật = mức thấp hơn giữa nhịp và trần.
  const thucTe = Math.min(perDay, COSTLY_JOBS_PER_DAY) * 30.4 * 0.025;
  assert.ok(thucTe > 7.3 && thucTe < 7.9, `dự phóng $${thucTe.toFixed(2)}/tháng`);
});

test("trần ngày cắt đúng số lượt đắt, engine rẻ KHÔNG bị cắt", () => {
  const queries = Array.from({ length: 20 }, (_, i) => ({
    id: `q${i}`, tier: "A", next_run_at: NOW - (20 - i) * 3600,
  }));
  const { jobs, capped, skipped } = buildJobPlan(queries, ENGINES, 1, NOW, 7);

  assert.equal(jobs.filter(j => j.engine === "chatgpt").length, 7);   // đắt: cắt theo trần
  assert.equal(jobs.filter(j => j.engine === "gemini").length, 20);   // rẻ: đủ cả 20
  assert.equal(capped, 13);
  assert.equal(skipped.filter(x => x.reason === "vượt trần ngày").length, 13);
});

test("trần ưu tiên câu QUÁ HẠN LÂU NHẤT — không câu nào bị bỏ quên vĩnh viễn", () => {
  const queries = [
    { id: "moi",     tier: "C", next_run_at: NOW - 60 },
    { id: "cu-nhat", tier: "C", next_run_at: NOW - 30 * DAY },
    { id: "cu-vua",  tier: "C", next_run_at: NOW - 5 * DAY },
  ];
  const { jobs } = buildJobPlan(queries, ["chatgpt"], 1, NOW, 2);
  assert.deepEqual(jobs.map(j => j.query_id), ["cu-nhat", "cu-vua"]);
});

test("câu bị trần cắt KHÔNG được dời lịch — mai vẫn quá hạn, được ưu tiên", () => {
  const queries = [
    { id: "q1", tier: "C", next_run_at: NOW - 2 * DAY },
    { id: "q2", tier: "C", next_run_at: NOW - 1 * DAY },
  ];
  const { reschedule } = buildJobPlan(queries, ["chatgpt"], 1, NOW, 1);
  assert.equal(reschedule.length, 1);
  assert.equal(reschedule[0].query_id, "q1");   // chỉ câu ĐƯỢC chạy mới dời lịch
});

test("trần 0 hoặc không hợp lệ → coi như không có trần, đừng chặn sạch", () => {
  const queries = [{ id: "q1", tier: "A", next_run_at: 0 }];
  assert.equal(buildJobPlan(queries, ["chatgpt"], 1, NOW, 0).jobs.length, 1);
  assert.equal(buildJobPlan(queries, ["chatgpt"], 1, NOW, NaN).jobs.length, 1);
});

test("bài GEO mới đăng kéo câu hỏi lên tầng A đủ lâu để đo tác dụng", () => {
  // 14 ngày: đủ để Google index + engine cập nhật, mà không giữ mãi ở tầng đắt.
  assert.equal(ARTICLE_PROMOTE_DAYS, 14);
  assert.ok(ARTICLE_PROMOTE_DAYS < PROMOTE_DAYS);
});
