// Cloudflare Cron Worker cho Doscom — chạy ĐÚNG GIỜ (Cloudflare cron đáng tin hơn GitHub
// schedule, vốn hay trễ 10 phút → vài tiếng). Mỗi mốc giờ VN, gọi GitHub workflow_dispatch
// cho refresh-data.yml của crm-doscom (kéo dữ liệu mới + deploy dashboard) — chạy NGAY.
//
// Secrets (wrangler secret put):
//   GH_PAT       — fine-grained PAT, quyền Actions: Read+Write trên repo hxduy93/crm-doscom.
//   TRIGGER_KEY  — chuỗi ngẫu nhiên để test tay qua URL (?key=...).

const CRM = { repo: "hxduy93/crm-doscom", ref: "master", workflow: "refresh-data.yml" };

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
  // Mọi mốc giờ (9h/13h/17h VN) đều: kéo dữ liệu mới + deploy dashboard.
  const r = await dispatch(env, CRM);
  console.log("doscom-cron", cron, JSON.stringify(r));
  return { cron, results: [r] };
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
