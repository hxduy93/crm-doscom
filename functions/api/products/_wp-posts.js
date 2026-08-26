/* ══════════════════════════════════════════════════════════════════════════════
   ĐỌC / GHI BÀI VIẾT WORDPRESS — phần "hướng dẫn sử dụng" trên doscom.vn & noma.vn.

   Sản phẩm bán hàng đi qua WooCommerce REST (_wc.js). Bài hướng dẫn KHÔNG phải sản
   phẩm: nó là POST của WordPress trong mục "Hướng dẫn sử dụng" của menu Kiến thức
   (noma.vn /danh-muc/huong-dan-su-dung/, doscom.vn /category/huong-dan-su-dung) nên phải
   đi đường /wp-json/wp/v2/posts với Application Password (cùng cặp user/app password
   đang dùng để up ảnh).

   ⚠ VÌ SAO BẮT BUỘC context=edit: `content.rendered` là bản WordPress đã DỰNG LẠI —
   shortcode đã chạy, khối Gutenberg `<!-- wp:… -->` đã biến mất. Ghi bản đó ngược lại
   là xoá sạch cấu trúc block của bài. Chỉ `content.raw` mới là nội dung gốc trong DB,
   nên: quét thì tạm chấp nhận bản rendered, còn GHI thì tuyệt đối chỉ ghi khi có raw.
   ══════════════════════════════════════════════════════════════════════════════ */
import { boDau } from "./_gap.js";

const wpAuth = (u, p) => "Basic " + btoa(`${u}:${p}`);

/* Danh mục nào thuộc phần HƯỚNG DẪN SỬ DỤNG của menu "Kiến thức".
   Bám ĐÚNG mục menu trên web: noma.vn "Kiến thức – hướng dẫn" → /danh-muc/huong-dan-su-dung/,
   doscom.vn "Hướng dẫn sử dụng" → /category/huong-dan-su-dung. Cùng biến thể cùng gốc
   (huong-dan-su-dung-noma, -san-pham, -doscom).

   HẸP LẠI 25/08/2026, đừng nới ra: bản đầu nhận mọi danh mục có chữ "hướng dẫn/guide"
   nên kéo về cả "Hướng dẫn chăm sóc xe", "Hướng dẫn DIY" — vốn là bài SEO/so sánh chỉ
   nhắc tên sản phẩm. Đo thật trên noma.vn: 89 bài quét được thì 71 bài là SEO, gánh
   204/250 mục "còn thiếu" — toàn báo thiếu vô lý (đòi bài "NOMA 250 vs Liqui Moly"
   phải chép đủ hướng dẫn sử dụng, hạn dùng, sơ cứu). Chủ dự án chốt: chỉ soát đúng
   phần hướng dẫn sử dụng trong menu, bỏ bài SEO. */
const DANH_MUC_HD = /^huong dan su dung\b/;

export function laDanhMucHuongDan(cat) {
  const ten = boDau(cat && cat.name);
  const slug = boDau(String((cat && cat.slug) || "").replace(/-/g, " "));
  return DANH_MUC_HD.test(ten) || DANH_MUC_HD.test(slug);
}

/* Bài hướng dẫn sử dụng = bài có CỤM ĐÓ TRONG TIÊU ĐỀ. Đây là phạm vi quét chính thức
   (chốt 25/08/2026): "quét ra tất cả bài viết có tiêu đề hướng dẫn sử dụng, đừng kèm
   bài viết khác". Bám tiêu đề chứ không bám danh mục vì danh mục trên hai web do agent
   GEO tự đẻ ra hàng trăm cái, không tin được. */
export function laBaiHuongDanTheoTieuDe(name) {
  return /\bhuong dan su dung\b/.test(boDau(name));
}

/* Bài HDSD của một SẢN PHẨM NOMA có mã — chỉ bài này mới đối chiếu được hồ sơ và mới
   dựng được tiêu đề chuẩn. Bài hướng dẫn thiết bị Doscom cũng nằm trong phạm vi quét
   nhưng không có hồ sơ nên không đổi tên được. */
export function laBaiHdsdChinhThuc(name) {
  const t = boDau(name);
  return /\bhuong dan su dung\b/.test(t) && /\bnoma\s?\d{2,4}\b/.test(t);
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
  /* Tiêu đề RỖNG là chuyện có thật, không phải lỗi đọc: 25/08/2026 đo được 46/111 bài
     trên noma.vn có post_title = "" (trang thật hiện <title>- Noma</title>, <h1></h1>).
     Phải phân biệt "bài chưa có tiêu đề" với "không đọc được tiêu đề" — nên giữ cờ riêng
     thay vì chỉ thấy cái tên giả "#123". */
  const tieuDe = goEntity((p.title && (p.title.raw || p.title.rendered)) || "").trim();
  return {
    id: p.id,
    name: tieuDe || `#${p.id}`,
    tieu_de: tieuDe,
    tieu_de_rong: !tieuDe,
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

/* Lấy NHIỀU bài theo danh sách id trong MỘT lời gọi (WP hỗ trợ `include=`).
   Vì sao không gọi getPost từng bài: doscom.vn có 67 bài hướng dẫn — 67 lời gọi phụ là
   chạm trần subrequest của Cloudflare Functions, mà phần lớn thời gian chỉ để chờ mạng. */
export async function listPostsByIds(c, ids, { perPage = 50 } = {}) {
  const items = [];
  let rawOk = true;
  for (let i = 0; i < ids.length; i += perPage) {
    const lo = ids.slice(i, i + perPage);
    const r = await wpLay(c, "posts", {
      include: lo.join(","),
      per_page: String(lo.length),
      orderby: "include",
      _fields: "id,title,link,status,content,categories",
    }, { timeout: 30000 });
    if (!r.ok) throw new Error(`WP posts ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const arr = await r.json();
    for (const p of Array.isArray(arr) ? arr : []) {
      const bai = chuanHoaBai(p);
      if (!bai.raw) rawOk = false;
      items.push(bai);
    }
  }
  return { items, raw_ok: rawOk };
}

export async function getPost(c, id) {
  const r = await wpLay(c, `posts/${id}`, { _fields: "id,title,link,status,content,categories" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WP post ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return chuanHoaBai(d);
}

/* Ghi bài. CHỈ gửi đúng trường được giao ({content} hoặc {title}) → không đụng ảnh đại
   diện, danh mục, trạng thái đăng, và không vô tình ghi đè trường mình không định sửa.
   Vá tiêu đề thì chỉ gửi title; sửa brandcore thì chỉ gửi content. */
export async function updatePost(c, id, truong) {
  const payload = {};
  if (typeof truong?.content === "string") payload.content = truong.content;
  if (typeof truong?.title === "string") payload.title = truong.title;
  if (!Object.keys(payload).length) throw new Error("updatePost: không có trường nào để ghi");
  const r = await fetch(`${c.url}/wp-json/wp/v2/posts/${id}`, {
    method: "POST",
    headers: { Authorization: wpAuth(c.user, c.pwd), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WP update ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

/* Liệt kê TIÊU ĐỀ toàn bộ bài viết của site (không kéo nội dung → nhẹ, chạy được cả
   web vài trăm bài trong một lượt).
   Vì sao KHÔNG giới hạn trong danh mục hướng dẫn như phần soát nội dung: tiêu đề rỗng
   hay tiêu đề sai brand core là lỗi ở MỌI bài, và 46 bài mất tiêu đề của noma.vn nằm
   rải khắp các danh mục SEO — bó vào danh mục hướng dẫn là không thấy chúng. */
export async function listAllPosts(c, { perPage = 100, maxPages = 10 } = {}) {
  const items = [];
  let het = true;
  for (let page = 1; page <= maxPages; page++) {
    const r = await wpLay(c, "posts", {
      status: "publish",
      per_page: String(perPage),
      page: String(page),
      orderby: "date",
      _fields: "id,title,link,status,categories",
    }, { timeout: 30000 });
    if (r.status === 400) break;
    if (!r.ok) throw new Error(`WP posts ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) break;
    for (const p of arr) items.push(chuanHoaBai(p));
    const tongTrang = Number(r.headers.get("X-WP-TotalPages") || 1);
    if (page >= tongTrang) break;
    if (page === maxPages) het = false;
  }
  return { items, het };
}
