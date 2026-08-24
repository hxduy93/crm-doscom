// POST /api/thai-social/schedule/run
//
// Worker doscom-cron gọi endpoint này. Với mỗi fanpage đang bật, tới giờ đã cài và hôm nay
// chưa có bài sinh theo lịch → tạo bài rồi sinh nội dung + ảnh.
//
// CHỈ SINH, KHÔNG ĐĂNG. File này tuyệt đối không import _graph.js — có test khoá lại
// trong tests/thai-social.test.mjs.

import { ok, fail, requireToken, requireDB, nowSec, vnDate, vnHour, vnWeekday, parseWeekdays } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  let b = {};
  try { b = await request.json(); } catch { /* body rỗng cũng được — cron không cần gửi gì */ }

  // Cho phép ép giờ/ngày khi chạy thử; mặc định lấy giờ VN hiện tại.
  const at = Number(b.at_epoch) || nowSec();
  const day = vnDate(at);
  const hour = Number.isInteger(b.force_hour) ? b.force_hour : vnHour(at);
  const weekday = vnWeekday(at);
  const dryRun = b.dry_run === true;

  const { results } = await env.DB.prepare(
    `SELECT * FROM thai_pages WHERE active = 1 ORDER BY name`
  ).all();

  const created = [];
  const skipped = [];

  for (const page of results || []) {
    const days = parseWeekdays(page.weekdays);
    if (!days.includes(weekday)) { skipped.push({ page_id: page.page_id, why: "ngoai_lich_thu" }); continue; }
    if (Number(page.post_hour_vn) !== hour) { skipped.push({ page_id: page.page_id, why: "chua_toi_gio" }); continue; }

    // Chống sinh trùng: DB còn một UNIQUE index chặn ở tầng dưới, đây chỉ là để trả lời
    // cho tử tế và không đốt credit AI khi cron chạy lại.
    const existed = await env.DB.prepare(
      `SELECT id FROM thai_post_queue WHERE page_id = ? AND vn_date = ? AND source = 'schedule'`
    ).bind(page.page_id, day).first();
    if (existed) { skipped.push({ page_id: page.page_id, why: "da_co_bai_hom_nay", post_id: existed.id }); continue; }

    if (!page.default_sku_main) { skipped.push({ page_id: page.page_id, why: "chua_cai_san_pham_mac_dinh" }); continue; }
    if (dryRun) { created.push({ page_id: page.page_id, dry_run: true }); continue; }

    // Gọi lại chính endpoint sinh bài để CHỈ CÓ MỘT đường sinh — sửa luật viết bài thì
    // sửa một chỗ, lịch và bấm tay không bao giờ lệch nhau.
    const url = new URL(request.url);
    url.pathname = "/api/thai-social/generate";
    url.search = "";

    let res, body;
    try {
      res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Thai-Token": env.THAI_SOCIAL_TOKEN,
          // Đi tiếp qua Cloudflare Access bằng service token của chính lời gọi vào đây.
          ...(request.headers.get("CF-Access-Client-Id")
            ? {
                "CF-Access-Client-Id": request.headers.get("CF-Access-Client-Id"),
                "CF-Access-Client-Secret": request.headers.get("CF-Access-Client-Secret"),
              }
            : {}),
        },
        body: JSON.stringify({
          page_id: page.page_id,
          sku_main: page.default_sku_main,
          sku_addon: page.default_sku_addon || null,
          source: "schedule",
        }),
      });
      body = await res.json();
    } catch (e) {
      skipped.push({ page_id: page.page_id, why: "loi_goi_generate", detail: String(e?.message || e) });
      continue;
    }

    if (!res.ok || !body || body.ok !== true) {
      skipped.push({ page_id: page.page_id, why: "generate_that_bai", detail: (body && body.error) || `HTTP ${res.status}` });
      continue;
    }

    created.push({
      page_id: page.page_id,
      post_id: body.data.post.id,
      image_note: body.data.image_note || null,
    });
  }

  return ok({ vn_date: day, vn_hour: hour, vn_weekday: weekday, created, skipped });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Thai-Token, CF-Access-Client-Id, CF-Access-Client-Secret",
    },
  });
}
