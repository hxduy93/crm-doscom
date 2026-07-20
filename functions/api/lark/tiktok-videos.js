// GET /api/lark/tiktok-videos?days=14&top=20
// Top video TikTok Shop theo GMV, đọc từ Lark Base → bảng hieu_suat_video.
//
// ⚠️ Bảng này ~6.000 dòng (mỗi video × mỗi ngày 1 dòng). Quét sạch mất ~24s →
// Cloudflare Pages Function HẾT GIỜ. Nên lọc theo ngày NGAY Ở PHÍA LARK bằng
// /records/search: 14 ngày còn ~700 dòng, chạy ~2s. Thêm cache KV 30 phút.
//
// days: số ngày gần nhất (mặc định 14, trần 90).
// top : số video trả về (mặc định 20, trần 100).
//
// Trả: { ok, days, since, scanned, unique_videos, videos[], cached }

import {
  searchRecordsSince, listRecords, resolveAppToken,
  larkText, larkNum, larkLinkIds,
} from "../../lib/lark.js";

const TABLE_VIDEO = "tblpIc7Z8iIrmCJK";   // hieu_suat_video
const TABLE_SHOP = "tbl9pAULqkKXrgPR";    // tiktok_shop_credentials (CHỈ lấy cột shop_name)
const DATE_FIELD = "Ngày dữ liệu";
const CACHE_TTL = 1800;                    // 30 phút
const FIELDS = [
  "Tiêu đề video", "GMV", "Số đơn", "Lượt xem video", "Ngày dữ liệu",
  "Link video", "Username", "Shop", "Tỷ lệ click (%)", "Ngày đăng video",
  // Tên SP dùng làm TÊN THƯ MỤC khi tải video về → ads-creator lấy tên thư mục
  // làm tên sản phẩm trong tên campaign. Lấy sẵn ở đây để khỏi gõ tay.
  "Tên SP đính kèm",
];

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function toVnDate(ms) {
  if (!ms) return null;
  return new Date(Number(ms) + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// /records/search trả cột liên kết chỉ có link_record_ids, KHÔNG kèm tên shop.
// Nên phải tra bảng shop 1 lần rồi map record_id → shop_name. Bảng chỉ 3 dòng.
// ⚠️ Bảng shop còn chứa access_token / app_secret TikTok — CHỈ xin cột shop_name.
async function shopNameMap(env, kv, appToken) {
  const cacheKey = "lark:tiktok_shop_names";
  try {
    if (kv) {
      const c = await kv.get(cacheKey);
      if (c) return JSON.parse(c);
    }
  } catch { /* ignore */ }

  const map = {};
  try {
    const out = await listRecords(env, kv, appToken, TABLE_SHOP, {
      maxRecords: 50,
      fieldNames: ["shop_name"],
    });
    for (const r of out.records) {
      const n = larkText(r.fields["shop_name"]);
      if (n) map[r.record_id] = n;
    }
    if (kv) await kv.put(cacheKey, JSON.stringify(map), { expirationTtl: 86400 });
  } catch { /* tra tên shop hỏng → hiển thị "—", không chặn cả trang */ }
  return map;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const q = new URL(request.url).searchParams;
  const days = Math.min(Math.max(Number(q.get("days")) || 14, 1), 90);
  const top = Math.min(Number(q.get("top")) || 20, 100);
  const nocache = q.get("nocache") === "1";
  const kv = env.INVENTORY;
  const cacheKey = `lark:tiktok_videos:v2:${days}:${top}`;

  if (!nocache && kv) {
    try {
      const c = await kv.get(cacheKey);
      if (c) {
        const parsed = JSON.parse(c);
        parsed.cached = true;
        return json(parsed);
      }
    } catch { /* cache hỏng → quét lại */ }
  }

  try {
    const since = Date.now() - days * 86400 * 1000;
    const { appToken } = await resolveAppToken(env, kv, {
      wiki: env.LARK_WIKI_TOKEN,
      base: env.LARK_BASE_TOKEN,
    });
    const [out, shops] = await Promise.all([
      searchRecordsSince(env, kv, appToken, TABLE_VIDEO, DATE_FIELD, since, {
        fieldNames: FIELDS,
        maxRecords: 3000,
      }),
      shopNameMap(env, kv, appToken),
    ]);

    // 1 video có nhiều dòng (mỗi ngày 1 bản ghi) → gộp theo link rồi cộng GMV.
    const byVideo = new Map();
    for (const rec of out.records) {
      const f = rec.fields;
      const link = larkText(f["Link video"]);
      const title = larkText(f["Tiêu đề video"]) || "(không tiêu đề)";
      const key = link || title;
      if (!byVideo.has(key)) {
        byVideo.set(key, {
          title, link,
          username: larkText(f["Username"]),
          shop: larkLinkIds(f["Shop"]).map((id) => shops[id]).filter(Boolean)[0] || "—",
          product: larkText(f["Tên SP đính kèm"]),
          gmv: 0, orders: 0, views: 0,
          last_date: null,
          posted: toVnDate(f["Ngày đăng video"]),
        });
      }
      const v = byVideo.get(key);
      v.gmv += larkNum(f["GMV"]);
      v.orders += larkNum(f["Số đơn"]);
      v.views += larkNum(f["Lượt xem video"]);
      const d = toVnDate(f["Ngày dữ liệu"]);
      if (d && (!v.last_date || d > v.last_date)) v.last_date = d;
    }

    const videos = [...byVideo.values()].sort((a, b) => b.gmv - a.gmv).slice(0, top);

    const payload = {
      ok: true,
      days,
      since: toVnDate(since),
      scanned: out.records.length,
      // true = còn dòng chưa quét (chạm trần) → "top" chỉ đúng trong phạm vi đã quét.
      has_more: out.has_more,
      unique_videos: byVideo.size,
      count: videos.length,
      videos,
      cached: false,
    };

    try {
      if (kv) await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: CACHE_TTL });
    } catch { /* ignore */ }

    return json(payload);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e), code: e.code ?? null }, 502);
  }
}
