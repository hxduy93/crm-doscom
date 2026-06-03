// renderLanding.js — renderer template CỐ ĐỊNH cho Landing Builder.
//
// Nguồn sự thật duy nhất: dùng cho cả PREVIEW (POST /api/landings/preview)
// lẫn PUBLISH (Phase 3). Nhận `config` (object JSON đã parse) -> trả 1 chuỗi HTML
// đầy đủ (CSS + JS inline), bố cục giống landing noma911 (1 cột, chuyển đổi cao).
//
// Form submit -> POST /api/order trên CHÍNH project landing (do _worker.js của landing
// xử lý ở Phase 3). Khi preview, /api/order chưa tồn tại nên submit chỉ minh hoạ.
//
// Tất cả text người dùng nhập đều đi qua esc() (HTML) hoặc nhúng qua JSON.stringify (JS).

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Giá trị mặc định an toàn để template không vỡ khi thiếu field.
function withDefaults(c) {
  c = c || {};
  return {
    brand: c.brand || "Thương hiệu",
    title: c.title || c.brand || "Landing page",
    description: c.description || "",
    pixelId: c.pixelId || "",
    theme: { primary: "#e11d48", accent: "#f59e0b", dark: "#0f172a", ...(c.theme || {}) },
    hero: {
      headline: "", sub: "", image: "", imageMobile: "", badges: [],
      ...(c.hero || {}),
    },
    benefits: Array.isArray(c.benefits) ? c.benefits : [],
    gallery: Array.isArray(c.gallery) ? c.gallery : [],
    products: Array.isArray(c.products) && c.products.length ? c.products : [
      { value: "default", label: "Sản phẩm", price: 0, oldPrice: 0, default: true },
    ],
    gifts: Array.isArray(c.gifts) ? c.gifts : [],
    form: { provinceLabel: "Tỉnh / Thành phố", submitText: "ĐẶT HÀNG NGAY", ...(c.form || {}) },
    offer: { priceNote: "", countdownMinutes: 0, ...(c.offer || {}) },
    staff: c.staff || "",
    source: c.source || "",
    contact: { hotline: "", zalo: "", ...(c.contact || {}) },
    footer: { company: "", address: "", ...(c.footer || {}) },
    thankUrl: c.thankUrl || "",
  };
}

function fmtVnd(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("vi-VN") + "₫";
}

function renderBenefits(benefits, theme) {
  if (!benefits.length) return "";
  const items = benefits.map((b) => `
    <div class="benefit">
      <div class="benefit-icon">${esc(b.icon || "✔")}</div>
      <div>
        <div class="benefit-title">${esc(b.title || "")}</div>
        <div class="benefit-desc">${esc(b.desc || "")}</div>
      </div>
    </div>`).join("");
  return `<section class="section"><h2 class="sec-title">Vì sao chọn ${esc("sản phẩm này")}?</h2><div class="benefits">${items}</div></section>`;
}

function renderGallery(gallery) {
  if (!gallery.length) return "";
  const imgs = gallery.map((src) => `<img loading="lazy" src="${esc(src)}" alt="">`).join("");
  return `<section class="section"><div class="gallery">${imgs}</div></section>`;
}

function renderProducts(products) {
  return products.map((p, i) => {
    const checked = p.default || (i === 0 && !products.some((x) => x.default)) ? "checked" : "";
    const old = p.oldPrice ? `<span class="p-old">${fmtVnd(p.oldPrice)}</span>` : "";
    return `
    <label class="product">
      <input type="radio" name="combo" value="${esc(p.value)}" ${checked}>
      <span class="p-body">
        <span class="p-label">${esc(p.label || "")}</span>
        <span class="p-price">${fmtVnd(p.price)} ${old}</span>
      </span>
    </label>`;
  }).join("");
}

function renderGifts(gifts) {
  if (!gifts.length) return "";
  const opts = gifts.map((g, i) =>
    `<option value="${esc(g.value)}" ${i === 0 ? "selected" : ""}>${esc(g.label || "")}</option>`).join("");
  return `<div class="field"><label>Chọn quà tặng kèm</label><select name="gift">${opts}</select></div>`;
}

export function renderLanding(rawConfig) {
  const c = withDefaults(rawConfig);
  const t = c.theme;

  // Pixel: base + PageView. Lead bắn khi submit thành công (trong submit handler).
  const pixel = c.pixelId ? `
  <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', ${JSON.stringify(c.pixelId)});
    fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=${esc(c.pixelId)}&ev=PageView&noscript=1"/></noscript>` : "";

  const heroPicture = c.hero.image ? `
    <picture>
      ${c.hero.imageMobile ? `<source media="(max-width:640px)" srcset="${esc(c.hero.imageMobile)}">` : ""}
      <img class="hero-img" src="${esc(c.hero.image)}" alt="${esc(c.hero.headline)}">
    </picture>` : "";

  const badges = c.hero.badges.length
    ? `<div class="badges">${c.hero.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join("")}</div>`
    : "";

  const hotline = c.contact.hotline
    ? `<a class="hotline" href="tel:${esc(c.contact.hotline)}">📞 ${esc(c.contact.hotline)}</a>` : "";

  // Cấu hình runtime nhúng vào trang (cho submit handler): staff/source/thankUrl.
  const runtime = JSON.stringify({ staff: c.staff, source: c.source, thankUrl: c.thankUrl, hasPixel: !!c.pixelId });

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
${c.description ? `<meta name="description" content="${esc(c.description)}">` : ""}
<meta property="og:title" content="${esc(c.title)}">
${c.hero.image ? `<meta property="og:image" content="${esc(c.hero.image)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
${pixel}
<style>
  :root{--primary:${t.primary};--accent:${t.accent};--dark:${t.dark};}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Manrope',system-ui,sans-serif;color:var(--dark);background:#f8fafc;line-height:1.55}
  h1,h2,h3,.p-price,.btn{font-family:'Oswald',sans-serif;letter-spacing:.3px}
  img{max-width:100%;display:block}
  .wrap{max-width:560px;margin:0 auto;background:#fff;min-height:100vh;box-shadow:0 0 40px rgba(0,0,0,.06)}
  .topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--dark);color:#fff;position:sticky;top:0;z-index:30}
  .topbar .brand{font-family:'Oswald';font-weight:700;font-size:20px}
  .hotline{color:#fff;text-decoration:none;font-weight:600;font-size:14px}
  .hero{padding:18px 16px 8px}
  .hero h1{font-size:30px;line-height:1.15;color:var(--dark)}
  .hero .sub{margin-top:8px;color:#475569;font-size:16px}
  .hero-img{border-radius:16px;margin:14px 0}
  .badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .badge{background:#fff1f2;color:var(--primary);border:1px solid #fecdd3;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600}
  .section{padding:18px 16px}
  .sec-title{font-size:22px;margin-bottom:12px;color:var(--dark)}
  .benefits{display:grid;gap:12px}
  .benefit{display:flex;gap:12px;align-items:flex-start;background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:12px}
  .benefit-icon{font-size:24px;flex:0 0 auto}
  .benefit-title{font-weight:700}
  .benefit-desc{color:#64748b;font-size:14px}
  .gallery{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .gallery img{border-radius:12px;aspect-ratio:1;object-fit:cover}
  .order{padding:20px 16px;background:linear-gradient(180deg,#fff,#fff5f6)}
  .order h2{font-size:24px;color:var(--primary);text-align:center;margin-bottom:14px}
  .product{display:flex;align-items:center;gap:12px;border:2px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin-bottom:10px;cursor:pointer;transition:.15s}
  .product:has(input:checked){border-color:var(--primary);background:#fff;box-shadow:0 4px 14px rgba(225,29,72,.12)}
  .product input{width:20px;height:20px;accent-color:var(--primary)}
  .p-body{display:flex;justify-content:space-between;align-items:center;width:100%;gap:10px}
  .p-label{font-weight:600}
  .p-price{color:var(--primary);font-size:18px;font-weight:700;white-space:nowrap}
  .p-old{color:#94a3b8;text-decoration:line-through;font-size:13px;font-weight:400;margin-left:6px}
  .field{margin-bottom:12px}
  .field label{display:block;font-size:13px;font-weight:600;color:#475569;margin-bottom:5px}
  .field input,.field select{width:100%;border:1.5px solid #e2e8f0;border-radius:12px;padding:13px 14px;font-size:15px;font-family:inherit;outline:none}
  .field input:focus,.field select:focus{border-color:var(--primary)}
  .err{color:var(--primary);font-size:13px;margin-top:4px;display:none}
  .price-note{text-align:center;color:#64748b;font-size:14px;margin:8px 0}
  .countdown{text-align:center;font-weight:700;color:var(--accent);margin:6px 0}
  .btn{display:block;width:100%;border:0;border-radius:14px;background:var(--primary);color:#fff;font-size:20px;font-weight:700;padding:16px;cursor:pointer;box-shadow:0 8px 20px rgba(225,29,72,.3);margin-top:6px}
  .btn:active{transform:translateY(1px)}
  .trust{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;color:#64748b;font-size:13px;margin-top:12px}
  footer{padding:22px 16px;background:var(--dark);color:#cbd5e1;font-size:13px;text-align:center}
  .sticky-cta{position:fixed;bottom:0;left:0;right:0;z-index:40;display:none}
  @media(max-width:560px){.sticky-cta{display:block}.sticky-cta .wrap2{max-width:560px;margin:0 auto;padding:8px 12px;background:#fff;border-top:1px solid #e2e8f0}}
  .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--dark);color:#fff;padding:12px 20px;border-radius:999px;font-size:14px;z-index:50;opacity:0;transition:.3s}
  .toast.show{opacity:1}
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar"><span class="brand">${esc(c.brand)}</span>${hotline}</div>

  <header class="hero">
    <h1>${esc(c.hero.headline)}</h1>
    ${c.hero.sub ? `<p class="sub">${esc(c.hero.sub)}</p>` : ""}
    ${badges}
    ${heroPicture}
  </header>

  ${renderBenefits(c.benefits, t)}
  ${renderGallery(c.gallery)}

  <section class="order" id="order">
    <h2>ĐẶT HÀNG GIAO TẬN NHÀ</h2>
    <form id="orderForm" novalidate>
      <div class="products">${renderProducts(c.products)}</div>
      ${renderGifts(c.gifts)}
      <div class="field">
        <label>Họ và tên *</label>
        <input name="name" type="text" autocomplete="name" placeholder="Nguyễn Văn A" required>
        <div class="err" data-for="name">Vui lòng nhập họ tên</div>
      </div>
      <div class="field">
        <label>Số điện thoại *</label>
        <input name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="09xx xxx xxx" required>
        <div class="err" data-for="phone">Số điện thoại chưa hợp lệ</div>
      </div>
      <div class="field">
        <label>${esc(c.form.provinceLabel)} / Địa chỉ nhận hàng *</label>
        <input name="province" type="text" placeholder="VD: 123 Lê Lợi, Q.1, TP.HCM" required>
        <div class="err" data-for="province">Vui lòng nhập địa chỉ</div>
      </div>
      <div class="field">
        <label>Ghi chú (không bắt buộc)</label>
        <input name="note" type="text" placeholder="Giờ nhận hàng, ghi chú thêm…">
      </div>
      ${c.offer.priceNote ? `<div class="price-note">${esc(c.offer.priceNote)}</div>` : ""}
      ${c.offer.countdownMinutes ? `<div class="countdown" id="countdown"></div>` : ""}
      <button class="btn" type="submit">${esc(c.form.submitText)}</button>
      <div class="trust"><span>🚚 Giao toàn quốc</span><span>💵 Thanh toán khi nhận</span><span>🔄 Đổi trả 7 ngày</span></div>
    </form>
  </section>

  <footer>
    ${c.footer.company ? `<div><strong>${esc(c.footer.company)}</strong></div>` : ""}
    ${c.footer.address ? `<div>${esc(c.footer.address)}</div>` : ""}
    ${c.contact.hotline ? `<div>Hotline: ${esc(c.contact.hotline)}</div>` : ""}
  </footer>
</div>

<div class="sticky-cta"><div class="wrap2"><button class="btn" onclick="document.getElementById('order').scrollIntoView({behavior:'smooth'})">🛒 ${esc(c.form.submitText)}</button></div></div>
<div class="toast" id="toast"></div>

<script>
(function(){
  var RT = ${runtime};
  var form = document.getElementById('orderForm');
  var toast = document.getElementById('toast');
  function showToast(msg){ toast.textContent = msg; toast.classList.add('show'); setTimeout(function(){toast.classList.remove('show')}, 3000); }
  function showErr(name, on){ var e = form.querySelector('.err[data-for="'+name+'"]'); if(e) e.style.display = on ? 'block' : 'none'; }
  function validPhone(v){ return /^0\\d{9,10}$/.test(v.replace(/\\s/g,'')); }

  // Countdown (nếu cấu hình)
  ${c.offer.countdownMinutes ? `
  (function(){
    var el = document.getElementById('countdown');
    var left = ${Number(c.offer.countdownMinutes) * 60};
    function tick(){
      if(left<=0){ el.textContent='Ưu đãi đã kết thúc'; return; }
      var m=Math.floor(left/60), s=left%60;
      el.textContent='⏰ Ưu đãi kết thúc sau '+m+':'+(s<10?'0':'')+s;
      left--; setTimeout(tick,1000);
    }
    tick();
  })();` : ""}

  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var fd = new FormData(form);
    var name = (fd.get('name')||'').trim();
    var phone = (fd.get('phone')||'').trim();
    var province = (fd.get('province')||'').trim();
    var ok = true;
    showErr('name', !name); if(!name) ok=false;
    showErr('phone', !validPhone(phone)); if(!validPhone(phone)) ok=false;
    showErr('province', !province); if(!province) ok=false;
    if(!ok){ return; }

    var payload = {
      staff: RT.staff, source: RT.source,
      combo: fd.get('combo')||'', gift: fd.get('gift')||'',
      name: name, phone: phone, province: province, note: (fd.get('note')||'').trim(),
      url: location.href, referrer: document.referrer, timestamp: new Date().toISOString()
    };

    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true; var old = btn.textContent; btn.textContent = 'Đang gửi…';

    fetch('/api/order', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      .then(function(r){ return r.json().catch(function(){return {ok:r.ok}}); })
      .then(function(res){
        if(res && res.ok){
          if(RT.hasPixel && window.fbq) fbq('track','Lead');
          var q = '?combo='+encodeURIComponent(payload.combo)+'&name='+encodeURIComponent(name);
          if(RT.thankUrl){ location.href = RT.thankUrl + q; }
          else { showToast('✅ Đặt hàng thành công! Shop sẽ gọi lại xác nhận.'); form.reset(); }
        } else {
          showToast('⚠️ Gửi đơn lỗi, vui lòng gọi hotline.');
        }
      })
      .catch(function(){ showToast('⚠️ Không gửi được đơn, vui lòng thử lại.'); })
      .finally(function(){ btn.disabled=false; btn.textContent=old; });
  });
})();
</script>
</body>
</html>`;
}
