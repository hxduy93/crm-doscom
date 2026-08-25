/* ══════════════════════════════════════════════════════════════════════════════
   ĐỌC / GHI BÀI VIẾT WORDPRESS — phần "hướng dẫn sử dụng" trên doscom.vn & noma.vn.

   Sản phẩm bán hàng đi qua WooCommerce REST (_wc.js). Bài hướng dẫn KHÔNG phải sản
   phẩm: nó là POST của WordPress, nằm trong các danh mục "Hướng dẫn sử dụng",
   "Hướng dẫn chăm sóc xe", "NOMA Product Guide"… nên phải đi đường /wp-json/wp/v2/posts
   với Application Password (cùng cặp user/app password đang dùng để up ảnh).

   ⚠ VÌ SAO BẮT BUỘC context=edit: `content.rendered` là bản WordPress đã DỰNG LẠI —
   shortcode đã chạy, khối Gutenberg `<!-- wp:… -->` đã biến mất. Ghi bản đó ngược lại
   là xoá sạch cấu trúc block của bài. Chỉ `content.raw` mới là nội dung gốc trong DB,
   nên: quét thì tạm chấp nhận bản rendered, còn GHI thì tuyệt đối chỉ ghi khi có raw.
   ══════════════════════════════════════════════════════════════════════════════ */
import { boDau } from "./_gap.js";

const wpAuth = (u, p) => "Basic " + btoa(`${u}:${p}`);

/* Danh mục nào được coi là "hướng dẫn". Dò theo TÊN + SLUG đã bỏ dấu để bắt được cả
   "Hướng Dẫn Sử Dụng", "huong-dan-diy", "NOMA Product Guide". Cố ý rộng: hai web có
   hàng chục danh mục do agent GEO tự tạo, liệt kê tay là chắc chắn sót. */
const DANH_MUC_HD = /(huong dan|guide|how to|su dung|cach dung|instruction|manual|tutorial)/;

export function laDanhMucHuongDan(cat) {
  const ten = boDau(cat && cat.name);
  const slug = boDau(String((cat && cat.slug) || "").replace(/-/g, " "));
  return DANH_MUC_HD.test(`${ten} ${slug}`);
}

/* Bài này có nói về NOMA không. Quan trọng vì doscom.vn trộn hai thế giới: bài hướng
   dẫn camera/máy dò Doscom nằm chung danh mục với bài NOMA. Brand Core NOMA (định danh
   thương hiệu, xuất xứ OEM) KHÔNG được áp lên bài Doscom — xem brandcore-scan.js. */
export function laBaiNoma(p) {
  return /\bnoma\b/i.test(`${(p && p.name) || ""} ${(p && p.content) || ""}`);
}

// WordPress trả tiêu đề rendered có entity (&#8211;, &amp;) — đổi lại cho dễ đọc.
function goEntity(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

/* Một bài WP về khuôn dùng chung với sản phẩm ({id,name,permalink,status}) để giao diện
   "Sửa brandcore" hiển thị được cả hai loại bằng cùng một đoạn code.
   `raw` = có đọc được nội dung gốc không → quyết định có cho GHI hay không. */
function chuanHoaBai(p) {
  const coRaw = typeof (p && p.content && p.content.raw) === "string";
  return {
    id: p.id,
    name: goEntity((p.title && (p.title.raw || p.title.rendered)) || `#${p.id}`),
    permalink: p.link || "",
    status: p.status || "publish",
    content: coRaw ? p.content.raw : ((p.content && p.content.rendered) || ""),
    raw: coRaw,
    categories: Array.isArray(p.categories) ? p.categories : [],
  };
}

/* Gọi WP REST. Thử context=edit trước (để có content.raw); tài khoản không đủ quyền
   sửa bài thì WP trả 401/403 → rơi về context=view (chỉ quét được, không ghi được).
   Nói rõ bằng cờ `raw` thay vì im lặng ghi bản rendered — im lặng ở đây = phá bài. */
async function wpLay(c, duong, params, { timeout = 25000 } = {}) {
  const q = new URLSearchParams(params);
  const goi = async (ctx) => {
    q.set("context", ctx);
    q.set("_cb", String(Date.now())); // tránh CDN trả bản cũ ngay sau khi vừa sửa
    return fetch(`${c.url}/wp-json/wp/v2/${duong}?${q}`, {
      headers: { Authorization: wpAuth(c.user, c.pwd), "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(timeout),
    });
  };
  let r = await goi("edit");
  if (r.status === 401 || r.status === 403) r = await goi("view");
  return r;
}

// Danh mục "hướng dẫn" của site. Trả [{id,name,slug,count}] — chỉ danh mục CÓ bài.
export async function listGuideCategories(c, { maxPages = 6, perPage = 100 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await wpLay(c, "categories", {
      per_page: String(perPage), page: String(page), _fields: "id,name,slug,count",
    });
    if (r.status === 400) break;              // hết trang
    if (!r.ok) throw new Error(`WP categories ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) break;
    out.push(...arr.filter((x) => x.count > 0 && laDanhMucHuongDan(x))
                   .map((x) => ({ id: x.id, name: goEntity(x.name), slug: x.slug, count: x.count })));
    if (arr.length < perPage) break;
  }
  return out.sort((a, b) => b.count - a.count);
}

/* Liệt kê bài trong các danh mục hướng dẫn. WP lọc `categories=1,2,3` theo kiểu HOẶC và
   mỗi bài chỉ trả 1 lần nên không phải tự dedupe.
   Có TRẦN (maxPages) vì phải kéo cả nội dung bài về mới quét được từ cấm — không giới hạn
   thì một web vài trăm bài đủ làm request quá hạn mà không ai hiểu vì sao. */
export async function listGuidePosts(c, { catIds = [], perPage = 20, maxPages = 8 } = {}) {
  if (!catIds.length) return { items: [], het: true, raw_ok: true };
  const items = [];
  let het = true, rawOk = true;
  for (let page = 1; page <= maxPages; page++) {
    const r = await wpLay(c, "posts", {
      categories: catIds.join(","),
      status: "publish",
      per_page: String(perPage),
      page: String(page),
      orderby: "modified",
      _fields: "id,title,link,status,content,categories",
    }, { timeout: 30000 });
    if (r.status === 400) break;              // page vượt tổng số trang
    if (!r.ok) throw new Error(`WP posts ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) break;
    for (const p of arr) {
      const bai = chuanHoaBai(p);
      if (!bai.raw) rawOk = false;
      items.push(bai);
    }
    const tongTrang = Number(r.headers.get("X-WP-TotalPages") || 1);
    if (page >= tongTrang) break;
    if (page === maxPages) het = false;       // còn bài chưa quét tới → phải báo, không giấu
  }
  return { items, het, raw_ok: rawOk };
}

export async function getPost(c, id) {
  const r = await wpLay(c, `posts/${id}`, { _fields: "id,title,link,status,content,categories" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WP post ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return chuanHoaBai(d);
}

// Ghi nội dung mới. CHỈ gửi `content` → không đụng tiêu đề, ảnh đại diện, danh mục, trạng thái.
export async function updatePost(c, id, content) {
  const r = await fetch(`${c.url}/wp-json/wp/v2/posts/${id}`, {
    method: "POST",
    headers: { Authorization: wpAuth(c.user, c.pwd), "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(30000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WP update ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}
