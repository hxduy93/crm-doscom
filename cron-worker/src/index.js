// Cloudflare Cron Worker cho Doscom — chạy ĐÚNG GIỜ (Cloudflare cron đáng tin hơn GitHub
// schedule, vốn hay trễ 10 phút → vài tiếng). Mỗi mốc giờ VN, gọi GitHub workflow_dispatch
// cho refresh-data.yml của crm-doscom (kéo dữ liệu mới + deploy dashboard) — chạy NGAY.
//
// Secrets (wrangler secret put):
//   GH_PAT       — fine-grained PAT, quyền Actions: Read+Write trên repo hxduy93/crm-doscom.
//   TRIGGER_KEY  — chuỗi ngẫu nhiên để test tay qua URL (?key=...).

import { buDonThai } from "./don-thai.js";

const CRM = { repo: "hxduy93/crm-doscom", ref: "master", workflow: "refresh-data.yml" };

/* KÉO DỮ LIỆU cũng do Worker hẹn giờ (20/11/2026). Trước đó fetch-pancake chạy bằng
   GitHub schedule "07:00/13:00" nhưng thực tế chạy 11:27 và 21:44 (trễ 4–9 tiếng) →
   mốc dựng dashboard 9h dùng đơn của tối hôm trước, 15h dùng đơn của 11h27; chủ dự án
   so với POS thấy "sai doanh số" ở mọi nguồn (đúng bằng các đơn tạo sau lần kéo).
   Tiền tố chuỗi cron → workflow cần dispatch; mốc dựng dashboard (02:00/08:00 UTC) giữ nguyên. */
const FETCH_JOBS = {
  "0 0,6 ": { repo: CRM.repo, ref: CRM.ref, workflow: "fetch-pancake.yml" },  // 07:00 + 13:00 VN
  "0 1,7 ": { repo: CRM.repo, ref: CRM.ref, workflow: "fetch-fb-ads.yml" },   // 08:00 + 14:00 VN
};

async function dispatch(env, job) {
  const url = `https://api.github.com/repos/${job.repo}/actions/workflows/${job.workflow}/dispatches`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GH_PAT}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "doscom-cron-worker",
      },
      body: JSON.stringify({ ref: job.ref }),
    });
    // GitHub trả 204 khi dispatch thành công
    return { workflow: job.workflow, status: res.status, ok: res.status === 204,
             err: res.status === 204 ? undefined : (await res.text()).slice(0, 200) };
  } catch (e) {
    return { workflow: job.workflow, ok: false, err: String(e).slice(0, 200) };
  }
}

async function runPlan(env, cron) {
  // Mốc kéo dữ liệu: chỉ dispatch workflow fetch tương ứng, KHÔNG dựng dashboard.
  for (const [prefix, job] of Object.entries(FETCH_JOBS)) {
    if (cron.startsWith(prefix)) {
      const out = { cron, results: [await dispatch(env, job)] };
      console.log("doscom-cron", cron, JSON.stringify(out));
      return out;
    }
  }
  // Mốc dựng dashboard (9h/15h VN): kéo dữ liệu mới + deploy dashboard.
  const r = await dispatch(env, CRM);
  const out = { cron, results: [r] };

  /* Chỉ mốc 9h SÁNG (02:00 UTC) mới dò và bù đơn Thái chưa lên Google Sheet —
     một lần/ngày là đủ, và trước giờ sale bắt đầu gọi đơn đêm qua.
     Chạy tay thì luôn chạy, để còn test được. */
  /* So theo TIỀN TỐ giờ chứ không so cả chuỗi: chuỗi cron còn đính day-of-week
     (`0 2 * * 1-6`) và sẽ đổi tiếp mỗi lần sửa lịch — so cả chuỗi là job này
     âm thầm ngừng chạy mà không báo gì. */
  if (cron.startsWith("0 2 ") || cron === "manual") {
    out.donThai = await buDonThai(env).catch((e) => ({ loi: String(e).slice(0, 200) }));
  }

  console.log("doscom-cron", cron, JSON.stringify(out));
  return out;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPlan(env, event.cron));
  },
  // Test tay: GET https://doscom-cron.<subdomain>.workers.dev/?key=<TRIGGER_KEY>
  async fetch(req, env) {
    const u = new URL(req.url);
    if (!env.TRIGGER_KEY || u.searchParams.get("key") !== env.TRIGGER_KEY) {
      return new Response("forbidden", { status: 403 });
    }
    const out = await runPlan(env, u.searchParams.get("cron") || "manual");
    return new Response(JSON.stringify(out, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
};
