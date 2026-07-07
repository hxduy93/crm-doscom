// Cloudflare Cron Worker cho Doscom — chạy ĐÚNG GIỜ (Cloudflare cron đáng tin hơn GitHub
// schedule, vốn hay trễ 10 phút → vài tiếng). Mỗi mốc giờ VN, gọi GitHub workflow_dispatch
// để chạy workflow tương ứng (dispatch khởi động NGAY, không bị trễ như schedule).
//
// Secrets cần set (wrangler secret put):
//   GH_PAT       — fine-grained PAT, quyền Actions: Read+Write trên cả 2 repo.
//   TRIGGER_KEY  — chuỗi ngẫu nhiên để test tay qua URL (?key=...).

const FB  = { repo: "hxduy93/facebook-ads-dashboard", ref: "main",   workflow: "brand-staff-matrix.yml" };
const CRM = { repo: "hxduy93/crm-doscom",             ref: "master", workflow: "refresh-data.yml" };

// cron UTC -> danh sách workflow cần dispatch (giữ nguyên lịch cũ, chỉ đổi bộ hẹn giờ):
//   9h VN  : fetch Pancake tươi (FB) + refresh + deploy dashboard (CRM)
//   13h VN : refresh dashboard
//   15h VN : fetch Pancake tươi + build (FB)
//   17h VN : refresh dashboard
const PLAN = {
  "0 2 * * *":  [FB, CRM],
  "0 6 * * *":  [CRM],
  "0 8 * * *":  [FB],
  "0 10 * * *": [CRM],
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
  const jobs = PLAN[cron] || [FB, CRM]; // fallback an toàn: chạy hết
  const results = [];
  for (const j of jobs) results.push(await dispatch(env, j));
  console.log("doscom-cron", cron, JSON.stringify(results));
  return { cron, results };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPlan(env, event.cron));
  },
  // Test tay: GET https://doscom-cron.<subdomain>.workers.dev/?key=<TRIGGER_KEY>&cron=0%202%20*%20*%20*
  async fetch(req, env) {
    const u = new URL(req.url);
    if (!env.TRIGGER_KEY || u.searchParams.get("key") !== env.TRIGGER_KEY) {
      return new Response("forbidden", { status: 403 });
    }
    const cron = u.searchParams.get("cron") || "0 2 * * *";
    const out = await runPlan(env, cron);
    return new Response(JSON.stringify(out, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
};
