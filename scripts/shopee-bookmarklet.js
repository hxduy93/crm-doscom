/* Bookmarklet "Lấy sang CRM" — bản đọc được, KHÔNG nhúng thẳng vào trang.
 *
 * Trang Đăng sản phẩm (product-publisher.html) giữ một BẢN SAO rút gọn của file
 * này trong hằng BOOKMARKLET_SRC để dựng link kéo-thả. Sửa ở đây thì sửa cả bên
 * kia — file này là bản gốc để đọc và soát.
 *
 * Vì sao phải chạy trong trình duyệt người dùng: Shopee trả trang "Page
 * Unavailable / Login Required" cho MỌI request từ máy chủ (đo 2026-08-10, cả
 * Cloudflare Browser Rendering lẫn fetch thường). Trong tab của bạn thì trang
 * mở bình thường → đọc ở đây là cách duy nhất lấy đủ giá + mô tả + bộ ảnh mà
 * không phải đăng nhập hộ, không phải mua proxy.
 *
 * Việc nó làm:
 *   1. Kiểm đang ở trang sản phẩm Shopee (URL có -i.<shopid>.<itemid>).
 *   2. Cuộn hết trang để Shopee nạp nốt ảnh + mô tả (lazy-load).
 *   3. Bóc tên, mọi số tiền, mọi ảnh CDN, khối MÔ TẢ SẢN PHẨM, ngành hàng.
 *   4. Copy JSON vào clipboard VÀ mở CRM kèm dữ liệu trên fragment (#shopee=...).
 *      Fragment không bao giờ gửi lên máy chủ nên dữ liệu không lọt vào log.
 */
(async function () {
  var CRM = "https://crm-doscom.pages.dev/product-publisher.html";

  var m = location.pathname.match(/-i\.(\d+)\.(\d+)/);
  if (!m) { alert("Mở đúng TRANG SẢN PHẨM Shopee rồi bấm lại nút này."); return; }

  // 1. Cuộn để lazy-load ảnh + mô tả
  var h0 = 0;
  for (var i = 0; i < 12; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(function (r) { setTimeout(r, 350); });
    if (document.body.scrollHeight === h0) break;
    h0 = document.body.scrollHeight;
  }
  window.scrollTo(0, 0);
  await new Promise(function (r) { setTimeout(r, 300); });

  // 2. Tên
  var h1 = document.querySelector("h1");
  var name = (h1 && h1.innerText || document.title || "").trim();

  // 3. Giá — gom mọi số có ký hiệu ₫ ở nửa trên trang (khu mua hàng)
  var text = document.body.innerText || "";
  var prices = [];
  var re = /₫\s?([0-9][0-9.,]{2,})/g, mm;
  while ((mm = re.exec(text))) prices.push(mm[1]);

  // 4. Ảnh — cả thẻ img lẫn background-image
  var imgs = [];
  document.querySelectorAll("img").forEach(function (el) {
    var s = el.currentSrc || el.src || "";
    if (s.indexOf("susercontent.com/file/") > -1) imgs.push(s);
  });
  document.querySelectorAll('[style*="susercontent"]').forEach(function (el) {
    var s = el.getAttribute("style") || "";
    var g = s.match(/susercontent\.com\/file\/[A-Za-z0-9._-]+/);
    if (g) imgs.push("https://" + g[0]);
  });

  // 5. Mô tả — khối bắt đầu bằng "MÔ TẢ SẢN PHẨM"
  var desc = "";
  var nodes = document.querySelectorAll("div,section,article");
  for (var j = 0; j < nodes.length; j++) {
    var t = (nodes[j].innerText || "").trim();
    if (/^MÔ TẢ SẢN PHẨM/i.test(t) && t.length > 60) { desc = t; break; }
  }

  // 6. Ngành hàng — thanh breadcrumb
  var crumbs = [];
  document.querySelectorAll('a[href*="-cat."]').forEach(function (a) {
    var t = (a.innerText || "").trim();
    if (t && crumbs.indexOf(t) < 0) crumbs.push(t);
  });

  var data = {
    v: 1, url: location.href, shop_id: m[1], item_id: m[2],
    name: name, prices: prices, images: imgs, description: desc, breadcrumb: crumbs,
  };

  var json = JSON.stringify(data);
  try { await navigator.clipboard.writeText(json); } catch (e) { /* trình duyệt chặn thì thôi */ }

  // btoa không nuốt được tiếng Việt → encode UTF-8 trước
  var b64 = btoa(String.fromCharCode.apply(null, new TextEncoder().encode(json)));
  var msg = "Lấy được: " + (name ? "tên" : "KHÔNG có tên") +
    " · " + prices.length + " mức giá · " + imgs.length + " ảnh" +
    " · mô tả " + (desc ? desc.length + " ký tự" : "KHÔNG có") +
    "\n\nBấm OK để mở CRM với dữ liệu đã điền sẵn.\n(JSON cũng đã copy vào clipboard.)";
  if (confirm(msg)) window.open(CRM + "#shopee=" + encodeURIComponent(b64), "_blank");
})();
