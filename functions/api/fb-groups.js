/**
 * GET /api/fb-groups?account_id=<id>&days=14&target_cpl=110000
 * ------------------------------------------------------------
 * Trạng thái hai nhóm chạy TEST / SCALE của từng sản phẩm trong 1 tài khoản QC:
 * ad set nào đang sống, trong đó có ad nào, mỗi ad tiêu bao nhiêu / ra mấy kết quả
 * / CPL bao nhiêu, và chấm sẵn "bê sang SCALE · tắt · theo dõi · chưa đủ dữ liệu".
 *
 * Dùng cho 2 việc:
 *   1. Luồng tạo Ads tự động: tìm ad set "<SP> - TEST" đang chạy để ĐỔ VIDEO MỚI
 *      VÀO ĐÓ thay vì đẻ ad set mới mỗi lần (xem lib/fb-groups.js).
 *   2. Bảng "TEST vs SCALE" trong ads-creator.html.
 *
 * CPL mục tiêu: lấy ?target_cpl= nếu có, không thì tính từ chính nhóm SCALE của
 * sản phẩm đó (chi tiêu / kết quả). Không có cả hai thì KHÔNG chấm điểm — thà báo
 * "chưa có chuẩn để so" còn hơn phán bừa.
 *
 * Response: { ok, account_id, days, products:[{ product, target_cpl, test, scale }] }
 *   test/scale = { campaign_id, adset_id, adset_name, status, daily_budget, ads:[...] } | null
 */
import { getIdentity, canAccess } from "../lib/access.js";
import { parseGroupName, demKetQua, soNgayChay, chamDiem } from "../lib/fb-groups.js";

const GRAPH = "https://graph.facebook.com/v21.0";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fbGetAll(path, params, token, maxPages = 10) {
  const p = new URLSearchParams({ ...params, access_token: token, limit: params.limit || "200" });
  let next = `${GRAPH}${path}?${p}`;
  const out = [];
  let guard = 0;
  while (next && guard++ < maxPages) {
    const r = await fetch(next, { signal: AbortSignal.timeout(25000) });
    const d = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
    if (!r.ok || d.error) throw new Error(d.error?.message || `HTTP ${r.status}`);
    out.push(...(d.data || []));
    next = d.paging?.next || null;
  }
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = env.FB_ACCESS_TOKEN;
  if (!token) return json({ ok: false, error: "FB_ACCESS_TOKEN chưa cấu hình trên CRM" }, 500);

  const q = new URL(request.url).searchParams;
  const acct = String(q.get("account_id") || q.get("account") || "").replace(/^act_/, "");
  if (!acct) return json({ ok: false, error: "Thiếu ?account_id=" }, 400);
  const days = Math.min(Math.max(parseInt(q.get("days") || "14", 10) || 14, 1), 90);
  const targetCplParam = Number(q.get("target_cpl")) || 0;

  const id = await getIdentity(context);
  if (!canAccess(id, acct)) return json({ ok: false, error: "Không có quyền trên tài khoản này" }, 403);

  try {
    // Một lượt: mọi ad ACTIVE/PAUSED kèm ad set + campaign + số liệu. Tài khoản
    // của mình cỡ vài chục ad nên không cần lọc phía Meta.
    const ads = await fbGetAll("/act_" + acct + "/ads", {
      fields: [
        "name,status,effective_status,created_time",
        "adset{id,name,status,daily_budget,optimization_goal}",
        "campaign{id,name,status}",
        // video_id để đối chiếu ĐÚNG video nào đang thắng; object_story_spec là
        // đường lùi khi creative không trả thẳng video_id.
        "creative{effective_object_story_id,video_id,object_story_spec}",
        `insights.date_preset(last_${days}d){spend,actions,impressions}`,
      ].join(","),
      effective_status: '["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED","PENDING_REVIEW","DISAPPROVED","WITH_ISSUES","IN_PROCESS"]',
    }, token);

    const now = Date.now();
    const sanPham = new Map();   // product -> { test, scale }

    for (const ad of ads) {
      const camp = ad.campaign || {};
      const g = parseGroupName(camp.name) || parseGroupName((ad.adset || {}).name);
      if (!g) continue;   // campaign đặt tên kiểu cũ → không thuộc hộp nào, bỏ qua

      const ins = ((ad.insights || {}).data || [])[0] || {};
      const spend = Number(ins.spend) || 0;
      const results = demKetQua(ins.actions);
      const cre = ad.creative || {};
      const videoId = cre.video_id
        || (((cre.object_story_spec || {}).video_data || {}).video_id)
        || null;
      const item = {
        ad_id: ad.id,
        ad_name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        dang_chay: ad.status === "ACTIVE",
        created_time: ad.created_time,
        days: soNgayChay(ad.created_time, now),
        spend,
        results,
        cpl: results > 0 ? Math.round(spend / results) : null,
        impressions: Number(ins.impressions) || 0,
        post_id: cre.effective_object_story_id || null,
        video_id: videoId,          // ID video trên Facebook
        tiktok_id: null,            // ID video gốc trên TikTok — điền ở bước dưới
      };

      if (!sanPham.has(g.product)) sanPham.set(g.product, { test: null, scale: null });
      const nhom = sanPham.get(g.product);
      const key = g.group.toLowerCase();
      if (!nhom[key]) {
        const as = ad.adset || {};
        nhom[key] = {
          campaign_id: camp.id || null,
          campaign_name: camp.name || null,
          campaign_status: camp.status || null,
          adset_id: as.id || null,
          adset_name: as.name || null,
          adset_status: as.status || null,
          daily_budget: Number(as.daily_budget) || null,
          optimization_goal: as.optimization_goal || null,
          ads: [],
        };
      }
      nhom[key].ads.push(item);
    }

    // Gắn ID video GỐC TRÊN TIKTOK: sổ uploaded_videos lưu filename = "<id tiktok>.mp4"
    // kèm ad_id/video_id. Nhờ vậy nhìn bảng là biết ad này chạy đúng video nào bên
    // TikTok Shop, khỏi phải mò ngược. Sổ hỏng thì bỏ qua, không làm sập cả bảng.
    if (env.DB) {
      try {
        const rows = await env.DB.prepare(
          "SELECT filename, video_id, ad_id FROM uploaded_videos WHERE account_id = ?"
        ).bind(acct).all();
        const theoAd = new Map(), theoVideo = new Map();
        for (const r of rows.results || []) {
          const tt = String(r.filename || "").replace(/\.[^.]+$/, "");
          if (!tt) continue;
          if (r.ad_id) theoAd.set(String(r.ad_id), tt);
          if (r.video_id) theoVideo.set(String(r.video_id), tt);
        }
        for (const nhom of sanPham.values()) {
          for (const hop of [nhom.test, nhom.scale]) {
            for (const a of (hop ? hop.ads : [])) {
              a.tiktok_id = theoAd.get(String(a.ad_id))
                || (a.video_id ? theoVideo.get(String(a.video_id)) : null)
                || null;
            }
          }
        }
      } catch (e) { /* sổ lỗi → cột UID để trống, phần còn lại vẫn dùng được */ }
    }

    const products = [];
    for (const [product, nhom] of sanPham) {
      // CPL chuẩn = CPL thật của nhóm SCALE (gộp mọi ad). Không có thì dùng tham số.
      let target = targetCplParam;
      if (!target && nhom.scale) {
        const s = nhom.scale.ads.reduce((t, a) => t + a.spend, 0);
        const k = nhom.scale.ads.reduce((t, a) => t + a.results, 0);
        if (k > 0) target = Math.round(s / k);
      }
      if (nhom.test) {
        for (const a of nhom.test.ads) {
          const d = chamDiem(a, { target_cpl: target });
          a.verdict = a.dang_chay ? d.verdict : "off";
          a.ly_do = a.dang_chay ? d.ly_do : "ad đang tắt";
        }
        nhom.test.ads.sort((a, b) => Date.parse(b.created_time || 0) - Date.parse(a.created_time || 0));
        nhom.test.so_ad_dang_chay = nhom.test.ads.filter(a => a.dang_chay).length;
      }
      if (nhom.scale) {
        nhom.scale.ads.sort((a, b) => Date.parse(b.created_time || 0) - Date.parse(a.created_time || 0));
        nhom.scale.so_ad_dang_chay = nhom.scale.ads.filter(a => a.dang_chay).length;
      }
      products.push({ product, target_cpl: target || null, test: nhom.test, scale: nhom.scale });
    }
    products.sort((a, b) => a.product.localeCompare(b.product, "vi"));

    return json({ ok: true, account_id: acct, days, products });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e).slice(0, 300) }, 502);
  }
}
