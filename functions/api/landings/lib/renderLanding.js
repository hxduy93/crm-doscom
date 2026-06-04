// renderLanding.js — renderer template CỐ ĐỊNH cho Landing Builder.
//
// Nguồn sự thật duy nhất: dùng cho cả PREVIEW (POST /api/landings/preview)
// lẫn PUBLISH (Phase 3). Nhận `config` (object JSON đã parse) -> trả 1 chuỗi HTML
// đầy đủ (CSS + JS inline). Bố cục = bản noma911 (nm911d.html), parameterized hoàn
// toàn: mọi chữ/ảnh lấy từ config. Section nào thiếu dữ liệu thì bỏ qua.
//
// Form submit -> POST /api/order trên CHÍNH project landing (Phase 3). Khi preview,
// /api/order chưa tồn tại nên submit chỉ minh hoạ.
//
// Tất cả text người dùng nhập đều đi qua esc() (HTML) hoặc nhúng qua JSON.stringify (JS).

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// esc + xuống dòng -> <br> (cho heading nhiều dòng)
function mlEsc(s) {
  return esc(s).replace(/\n/g, "<br>");
}
function fmtVnd(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("vi-VN") + "₫";
}
function arr(a) { return Array.isArray(a) ? a : []; }

// Giá trị mặc định an toàn để template không vỡ khi thiếu field.
function withDefaults(c) {
  c = c || {};
  const t = c.theme || {};
  return {
    brand: c.brand || "",
    title: c.title || c.brand || "Landing page",
    description: c.description || "",
    pixelId: c.pixelId || "",
    theme: {
      primary: t.primary || "#FF6B1A",       // --orange
      orangeDeep: t.orangeDeep || "#E55100",  // --orange-deep
      gold: t.gold || "#D4A017",              // --gold
      dark: t.dark || "#0a0a0a",              // --black
    },
    announce: c.announce || "",
    hero: {
      badges: arr(c.hero && c.hero.badges),
      titleLines: arr(c.hero && c.hero.titleLines),
      sub: (c.hero && c.hero.sub) || "",
      stats: arr(c.hero && c.hero.stats),
      ctaText: (c.hero && c.hero.ctaText) || "Nhận tư vấn miễn phí →",
      trust: arr(c.hero && c.hero.trust),
    },
    trust: arr(c.trust),
    pullQuote: c.pullQuote || "",
    problem: {
      title: (c.problem && c.problem.title) || "",
      sub: (c.problem && c.problem.sub) || "",
      eyebrow: (c.problem && c.problem.eyebrow) || "Vấn đề thường gặp",
      causes: arr(c.problem && c.problem.causes),
    },
    solution: {
      eyebrow: (c.solution && c.solution.eyebrow) || "Giải pháp",
      h2: (c.solution && c.solution.h2) || "",
      lead: (c.solution && c.solution.lead) || "",
      intro: (c.solution && c.solution.intro) || "",
      features: arr(c.solution && c.solution.features),
    },
    design: {
      eyebrow: (c.design && c.design.eyebrow) || "Thiết kế thông minh",
      h2: (c.design && c.design.h2) || "",
      features: arr(c.design && c.design.features),
    },
    applications: {
      eyebrow: (c.applications && c.applications.eyebrow) || "Tính ứng dụng",
      h2: (c.applications && c.applications.h2) || "",
      p: (c.applications && c.applications.p) || "",
      surfaces: arr(c.applications && c.applications.surfaces),
      handlesTitle: (c.applications && c.applications.handlesTitle) || "",
      handles: arr(c.applications && c.applications.handles),
    },
    proof: {
      eyebrow: (c.proof && c.proof.eyebrow) || "Chất lượng kiểm chứng",
      h2: (c.proof && c.proof.h2) || "",
      p: (c.proof && c.proof.p) || "",
      stats: arr(c.proof && c.proof.stats),
      certs: arr(c.proof && c.proof.certs),
    },
    compare: {
      eyebrow: (c.compare && c.compare.eyebrow) || "",
      h2: (c.compare && c.compare.h2) || "",
      p: (c.compare && c.compare.p) || "",
      colNormal: (c.compare && c.compare.colNormal) || "",
      colNormalNote: (c.compare && c.compare.colNormalNote) || "",
      colNoma: (c.compare && c.compare.colNoma) || "",
      colNomaNote: (c.compare && c.compare.colNomaNote) || "",
      rows: arr(c.compare && c.compare.rows),
      savings: (c.compare && c.compare.savings) || "",
      ctaText: (c.compare && c.compare.ctaText) || "",
    },
    steps: {
      eyebrow: (c.steps && c.steps.eyebrow) || "Hướng dẫn sử dụng",
      h2: (c.steps && c.steps.h2) || "",
      items: arr(c.steps && c.steps.items),
    },
    combo: {
      eyebrow: (c.combo && c.combo.eyebrow) || "",
      h2: (c.combo && c.combo.h2) || "",
      p: (c.combo && c.combo.p) || "",
      cards: arr(c.combo && c.combo.cards),
      giftHead: (c.combo && c.combo.giftHead) || "",
      gifts: arr(c.combo && c.combo.gifts),
    },
    form: {
      eyebrow: (c.form && c.form.eyebrow) || "🔥 ƯU ĐÃI HÔM NAY",
      h2: (c.form && c.form.h2) || "Đăng ký nhận tư vấn\n+ ưu đãi hôm nay",
      sub: (c.form && c.form.sub) || "Để lại thông tin — shop gọi tư vấn miễn phí.",
      trustMini: arr(c.form && c.form.trustMini),
      submitText: (c.form && c.form.submitText) || "Đặt hàng ngay → Nhận ưu đãi",
      provinceLabel: (c.form && c.form.provinceLabel) || "Địa chỉ nhận hàng",
      giftLabel: (c.form && c.form.giftLabel) || "Quà tặng kèm combo",
      successTitle: (c.form && c.form.successTitle) || "Cảm ơn bạn!",
      successDesc: (c.form && c.form.successDesc) || "Shop đã nhận thông tin và sẽ gọi xác nhận trong ít phút.",
    },
    products: arr(c.products).length ? arr(c.products) : [
      { value: "default", label: "Sản phẩm", desc: "", price: 0, noGift: true },
    ],
    gifts: arr(c.gifts),  // [{value,label,desc,slot,oldPrice}]
    specs: {
      eyebrow: (c.specs && c.specs.eyebrow) || "Thông số sản phẩm",
      h2: (c.specs && c.specs.h2) || "",
      rows: arr(c.specs && c.specs.rows),
    },
    showroom: {
      eyebrow: (c.showroom && c.showroom.eyebrow) || "Hệ thống showroom",
      h2: (c.showroom && c.showroom.h2) || "",
      p: (c.showroom && c.showroom.p) || "",
      items: arr(c.showroom && c.showroom.items),
    },
    faq: {
      eyebrow: (c.faq && c.faq.eyebrow) || "Câu hỏi thường gặp",
      h2: (c.faq && c.faq.h2) || "",
      items: arr(c.faq && c.faq.items),
    },
    footer: {
      desc: (c.footer && c.footer.desc) || "",
      company: (c.footer && c.footer.company) || "",
      cols: arr(c.footer && c.footer.cols),
      bottom: (c.footer && c.footer.bottom) || "",
    },
    sticky: {
      title: (c.sticky && c.sticky.title) || "",
      sub: (c.sticky && c.sticky.sub) || "",
      ctaText: (c.sticky && c.sticky.ctaText) || "Đặt ngay →",
    },
    contact: { hotline: (c.contact && c.contact.hotline) || "", messenger: (c.contact && c.contact.messenger) || "" },
    images: c.images || {},
    assetBase: c.assetBase || "",
    imagePrompts: c.imagePrompts || {},
    staff: c.staff || "",
    source: c.source || "",
    thankUrl: c.thankUrl || "",
    slug: c.slug || "",
  };
}

// img(slot) -> URL đầy đủ (assetBase + url) hoặc "" nếu thiếu.
function makeImg(images, assetBase) {
  return (slot) => {
    const u = images[slot];
    if (!u) return "";
    if (/^https?:|^data:/.test(u)) return u;
    return (assetBase || "") + u;
  };
}

/* ---------- SECTION HELPERS ---------- */

function renderTopbar(c, img) {
  const logo = img("logo");
  const inner = logo
    ? `<img src="${esc(logo)}" alt="${esc(c.brand)}" class="brand-img">`
    : `<span class="brand-name">${esc(c.brand || "BRAND")}</span>`;
  return `<header class="topbar"><div class="container topbar-inner"><a href="#top" class="brand-mark">${inner}</a></div></header>`;
}

function renderAnnounce(c) {
  if (!c.announce) return "";
  return `<div class="announce"><span class="announce-bolt">⚡</span> ${mlEsc(c.announce)}</div>`;
}

function renderHero(c, img) {
  const hero = c.hero;
  const bg = img("hero");
  const bgMobile = img("heroMobile") || bg;
  const heroBg = bg ? `
    <div class="hero-bg">
      <picture>
        ${bgMobile ? `<source media="(max-width:900px)" srcset="${esc(bgMobile)}">` : ""}
        <img src="${esc(bg)}" alt="" loading="eager" fetchpriority="high">
      </picture>
    </div>` : "";

  const badges = hero.badges.length
    ? `<div class="hero-badges">${hero.badges.map((b, i) => {
        const cls = i === 0 ? "badge-pill us" : (i === hero.badges.length - 1 ? "badge-pill gold" : "badge-pill");
        return `<span class="${cls}">${esc(b)}</span>`;
      }).join("")}</div>` : "";

  const titleLines = hero.titleLines.length
    ? hero.titleLines.map((l) => {
        const text = typeof l === "string" ? l : (l && l.text) || "";
        const accent = typeof l === "object" && l && l.accent;
        return `<span class="block${accent ? " accent" : ""}">${esc(text)}</span>`;
      }).join("")
    : `<span class="block">${esc(c.title)}</span>`;

  const stats = hero.stats.length
    ? `<div class="hero-stats">${hero.stats.slice(0, 3).map((s) =>
        `<div class="stat-item"><div class="stat-num">${esc(s.num)}</div><div class="stat-label">${esc(s.label)}</div></div>`).join("")}</div>` : "";

  const trust = hero.trust.length
    ? `<div class="hero-trust-row">${hero.trust.map((x) =>
        `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${esc(x)}</span>`).join("")}</div>` : "";

  return `<section class="hero" id="top">
  ${heroBg}
  <div class="container">
    <div class="hero-inner">
      ${badges}
      <h1 class="hero-title">${titleLines}</h1>
      ${hero.sub ? `<p class="hero-sub">${mlEsc(hero.sub)}</p>` : ""}
      ${stats}
      <div class="hero-cta-row"><a href="#dat-hang" class="btn btn-primary btn-pulse">${esc(hero.ctaText)}</a></div>
      ${trust}
    </div>
  </div>
</section>`;
}

function renderTrustbar(c) {
  if (!c.trust.length) return "";
  const pills = c.trust.map((x) =>
    `<span class="trust-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg> ${esc(x)}</span>`).join("");
  return `<section class="trustbar" style="padding:0"><div class="trustbar-inner">${pills}</div></section>`;
}

function renderPullQuote(c) {
  if (!c.pullQuote) return "";
  return `<section class="pull-quote-section pull-quote-light" style="padding:36px 0">
    <div class="pull-quote"><div class="pull-quote-mark">"</div>
    <p class="pull-quote-text">${mlEsc(c.pullQuote)}</p></div>
  </section>`;
}

function renderProblem(c, img) {
  const p = c.problem;
  if (!p.causes.length) return "";
  const cards = p.causes.slice(0, 4).map((cause, i) => {
    const src = img("cause" + (i + 1));
    const media = src
      ? `<img src="${esc(src)}" alt="${esc(cause.title)}" loading="lazy">`
      : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#e9e3da,#d8d0c5)"></div>`;
    return `<article class="problem-card reveal">
      <div class="problem-img"><span class="problem-badge">${esc(cause.badge || ("Nguyên nhân #" + (i + 1)))}</span>${media}</div>
      <div class="problem-body"><h3>${esc(cause.title)}</h3><p>${esc(cause.desc)}</p></div>
    </article>`;
  }).join("");
  return `<section class="section-cream"><div class="container">
    <div class="section-head"><span class="eyebrow">${esc(p.eyebrow)}</span>
      ${p.title ? `<h2>${mlEsc(p.title)}</h2>` : ""}
      ${p.sub ? `<p>${esc(p.sub)}</p>` : ""}</div>
    <div class="problem-grid">${cards}</div>
  </div></section>`;
}

function renderSolution(c, img) {
  const s = c.solution;
  if (!s.h2 && !s.features.length) return "";
  const src = img("solution");
  const features = s.features.length
    ? `<ul class="solution-features">${s.features.map((f) =>
        `<li><span class="sf-icon">${esc(f.icon || "✨")}</span><div><strong>${esc(f.strong || "")}</strong> ${esc(f.text || "")}</div></li>`).join("")}</ul>` : "";
  return `<section class="section-dark" id="san-pham"><div class="container">
    <div class="solution-split">
      ${src ? `<div class="solution-media reveal"><img src="${esc(src)}" alt="${esc(s.h2)}" loading="lazy"></div>` : ""}
      <div class="solution-content reveal">
        <span class="eyebrow">${esc(s.eyebrow)}</span>
        ${s.h2 ? `<h2>${mlEsc(s.h2)}</h2>` : ""}
        ${s.lead ? `<p class="solution-lead">${esc(s.lead)}</p>` : ""}
        ${s.intro ? `<div class="solution-intro">${esc(s.intro)}</div>` : ""}
        ${features}
      </div>
    </div>
  </div></section>`;
}

function renderDesign(c, img) {
  const d = c.design;
  if (!d.features.length && !d.h2) return "";
  const src = img("design");
  const feats = d.features.map((f, i) =>
    `<div class="dfeature reveal"><div class="dfeature-num">${esc(f.num || (i + 1))}</div>
      <div><h4>${esc(f.h4 || "")}</h4><p>${esc(f.p || "")}</p></div></div>`).join("");
  return `<section class="section-gray"><div class="container">
    <div class="section-head"><span class="eyebrow">${esc(d.eyebrow)}</span>${d.h2 ? `<h2>${mlEsc(d.h2)}</h2>` : ""}</div>
    <div class="design-wrap">
      ${src ? `<div class="design-image reveal"><img src="${esc(src)}" alt="${esc(d.h2)}" loading="lazy"></div>` : ""}
      <div class="design-features">${feats}</div>
    </div>
  </div></section>`;
}

function renderApplications(c, img) {
  const a = c.applications;
  if (!a.surfaces.length && !a.handles.length && !a.h2) return "";
  const src = img("apply");
  const surfaces = a.surfaces.length
    ? `<div class="surface-grid">${a.surfaces.map((s) =>
        `<div class="surface-card reveal"><div class="surface-icon">${esc(s.icon || "✨")}</div><h4>${esc(s.h4 || "")}</h4><p>${esc(s.p || "")}</p></div>`).join("")}</div>` : "";
  const top = src
    ? `<div class="apply-top"><div class="apply-media reveal"><img src="${esc(src)}" alt="${esc(a.h2)}" loading="lazy"></div>${surfaces}</div>`
    : surfaces;
  const handles = a.handles.length
    ? `${a.handlesTitle ? `<div class="apply-subhead">${esc(a.handlesTitle)}</div>` : ""}
       <div class="handles-grid">${a.handles.map((h) =>
        `<div class="handle-item"><div class="handle-check">✓</div>${esc(h)}</div>`).join("")}</div>` : "";
  return `<section class="section-cream"><div class="container">
    <div class="section-head"><span class="eyebrow">${esc(a.eyebrow)}</span>
      ${a.h2 ? `<h2>${mlEsc(a.h2)}</h2>` : ""}${a.p ? `<p>${esc(a.p)}</p>` : ""}</div>
    ${top}
    ${handles}
  </div></section>`;
}

function renderProof(c, img) {
  const pr = c.proof;
  if (!pr.stats.length && !pr.h2) return "";
  const src = img("proof");
  const stats = pr.stats.length
    ? `<div class="proof-band">${pr.stats.map((s) =>
        `<div class="proof-stat reveal"><div class="pnum">${esc(s.num)}</div><div class="plabel">${esc(s.label)}</div></div>`).join("")}</div>` : "";
  const certs = pr.certs.length
    ? `<div class="proof-cert">${pr.certs.map((x) =>
        `<span class="cert-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>${esc(x)}</span>`).join("")}</div>` : "";
  const info = `<div class="proof-info">${stats}${certs}</div>`;
  const split = src
    ? `<div class="proof-split"><div class="proof-media reveal"><img src="${esc(src)}" alt="${esc(pr.h2)}" loading="lazy"></div>${info}</div>`
    : info;
  return `<section class="section-dark"><div class="container">
    <div class="section-head"><span class="eyebrow eyebrow-gold">${esc(pr.eyebrow)}</span>
      ${pr.h2 ? `<h2>${mlEsc(pr.h2)}</h2>` : ""}${pr.p ? `<p>${esc(pr.p)}</p>` : ""}</div>
    ${split}
  </div></section>`;
}

function renderCompare(c) {
  const cm = c.compare;
  if (!cm.rows.length) return "";
  const head = `<div class="compare-row head">
      <div>Tiêu chí</div>
      <div>${esc(cm.colNormal || "Cách thường")}${cm.colNormalNote ? `<span class="price-line">${esc(cm.colNormalNote)}</span>` : ""}</div>
      <div class="col-noma">${esc(cm.colNoma || c.brand || "Sản phẩm")}${cm.colNomaNote ? `<span class="price-line">${esc(cm.colNomaNote)}</span>` : ""}</div>
    </div>`;
  const rows = cm.rows.map((r) =>
    `<div class="compare-row"><div class="label">${esc(r.label)}</div>
      <div class="col-normal"><span class="x">✕</span>${esc(r.normal)}</div>
      <div class="col-noma"><span class="check">✓</span>${esc(r.noma)}</div></div>`).join("");
  const savings = cm.savings
    ? `<div class="compare-row highlight"><div class="label">Tiết kiệm</div><div class="col-normal">—</div><div class="col-noma"><span class="save-amount">${esc(cm.savings)}</span></div></div>`
    : "";
  const cta = cm.ctaText
    ? `<div class="center" style="margin-top:28px"><a href="#dat-hang" class="btn btn-primary btn-pulse" style="max-width:360px;margin:0 auto">${esc(cm.ctaText)}</a></div>`
    : "";
  return `<section class="section-warm"><div class="container">
    <div class="section-head"><span class="eyebrow eyebrow-gold" style="font-size:15px">${esc(cm.eyebrow || "So sánh")}</span>
      ${cm.h2 ? `<h2>${mlEsc(cm.h2)}</h2>` : ""}${cm.p ? `<p>${esc(cm.p)}</p>` : ""}</div>
    <div class="compare-table combo reveal">${head}${rows}${savings}</div>
    ${cta}
  </div></section>`;
}

function renderSteps(c) {
  const st = c.steps;
  if (!st.items.length) return "";
  const items = st.items.slice(0, 3).map((s, i) =>
    `<div class="step-card reveal"><div class="step-num">${i + 1}</div><h3>${esc(s.h3 || "")}</h3><p>${esc(s.p || "")}</p></div>`).join("");
  return `<section class="section-gray"><div class="container-narrow">
    <div class="section-head"><span class="eyebrow">${esc(st.eyebrow)}</span>${st.h2 ? `<h2>${mlEsc(st.h2)}</h2>` : ""}</div>
    <div class="steps-grid">${items}</div>
  </div></section>`;
}

function renderCombo(c, img) {
  const cb = c.combo;
  if (!cb.cards.length) return "";
  const cards = cb.cards.map((card) => {
    const imgs = arr(card.imgSlots).map((slot) => {
      const src = img(slot);
      return src ? `<img src="${esc(src)}" alt="${esc(card.h3 || "")}">` : "";
    }).join("");
    const tag = card.tag
      ? `<span class="combo-tag"${card.featured ? "" : ` style="background:var(--orange);color:#fff"`}>${esc(card.tag)}</span>` : "";
    const old = card.oldPrice ? `<div class="combo-price-old">${fmtVnd(card.oldPrice)}</div>` : "";
    const gift = card.gift ? `<div class="combo-gift">🎁 ${esc(card.gift)}</div>` : "";
    return `<div class="combo-card${card.featured ? " featured" : ""} reveal">
      ${tag}
      <div class="combo-img-wrap">${imgs}</div>
      <h3>${esc(card.h3 || "")}</h3>
      <p class="combo-desc">${esc(card.desc || "")}</p>
      <div class="combo-price">${esc(card.price || "")}</div>
      ${old}${gift}
      <button class="combo-btn" onclick="selectCombo('${esc(card.value || "")}')">Chọn combo này</button>
    </div>`;
  }).join("");

  const giftItems = cb.gifts.map((g) => {
    const src = img(g.slot) || "";
    return `<div class="gift-card" onclick="selectGift('${esc(g.value || "")}')">
      <div class="gift-thumb">${src ? `<img src="${esc(src)}" alt="${esc(g.label || "")}">` : ""}</div>
      <div class="gift-info"><h4>${esc(g.label || "")}</h4><p>${esc(g.desc || "")}</p>
      <span class="gift-pick">Chọn quà này &amp; đặt hàng →</span></div>
    </div>`;
  }).join("");
  const giftBlock = cb.gifts.length
    ? `<div class="gift-block reveal">${cb.giftHead ? `<div class="gift-head">${esc(cb.giftHead)}</div>` : ""}<div class="gift-grid">${giftItems}</div></div>`
    : "";

  return `<section class="section-combo" id="combo"><div class="container">
    <div class="section-head">${cb.eyebrow ? `<span class="eyebrow eyebrow-gold" style="font-size:20px;letter-spacing:0.12em">${esc(cb.eyebrow)}</span>` : ""}
      ${cb.h2 ? `<h2>${mlEsc(cb.h2)}</h2>` : ""}${cb.p ? `<p style="color:rgba(255,255,255,0.72)">${esc(cb.p)}</p>` : ""}</div>
    <div class="combo-grid">${cards}</div>
    ${giftBlock}
  </div></section>`;
}

function renderProductRadios(products) {
  return products.map((p, i) => {
    const checked = p.default || (i === 0 && !products.some((x) => x.default)) ? "checked" : "";
    const noGift = p.noGift ? ' data-nogift="1"' : "";
    const tag = p.tag ? ` <span style="color:var(--orange);font-size:11px">${esc(p.tag)}</span>` : "";
    const price = p.price ? `<div class="radio-price">${esc(p.price)}</div>` : "";
    return `<label class="form-radio">
      <input type="radio" name="combo" value="${esc(p.value)}"${noGift} ${checked} onchange="toggleGift()">
      <div class="radio-content"><div class="radio-title">${esc(p.label || "")}${tag}</div>
      ${p.desc ? `<div class="radio-desc">${esc(p.desc)}</div>` : ""}</div>
      ${price}
    </label>`;
  }).join("");
}

function renderGiftRadios(gifts, img) {
  return gifts.map((g, i) => {
    const src = img(g.slot) || "";
    return `<label class="form-radio">
      <input type="radio" name="gift" value="${esc(g.value)}" ${i === 0 ? "checked" : ""}>
      <div class="gift-radio-thumb">${src ? `<img src="${esc(src)}" alt="${esc(g.label || "")}">` : ""}</div>
      <div class="radio-content"><div class="radio-title">${esc(g.label || "")}</div>
      ${g.desc ? `<div class="radio-desc">${esc(g.desc)}</div>` : ""}</div>
      <div class="gift-radio-value">${g.oldPrice ? `<span class="gift-radio-old">${fmtVnd(g.oldPrice)}</span>` : ""}<span class="gift-radio-tag">TẶNG</span></div>
    </label>`;
  }).join("");
}

function renderForm(c, img) {
  const f = c.form;
  const trustMini = f.trustMini.length
    ? `<div class="form-trust-mini">${f.trustMini.map((x) =>
        `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${esc(x)}</span>`).join("")}</div>` : "";
  const giftGroup = c.gifts.length
    ? `<div class="form-group" id="giftGroup">
        <label class="form-label">${esc(f.giftLabel)} <span class="req">*</span></label>
        <div class="form-radio-group">${renderGiftRadios(c.gifts, img)}</div>
      </div>` : "";
  return `<section class="section-form" id="dat-hang"><div class="container-narrow">
    <div class="form-card">
      <div class="form-header">
        <span class="eyebrow eyebrow-crimson">${esc(f.eyebrow)}</span>
        <h2>${mlEsc(f.h2)}</h2>
        ${f.sub ? `<p>${esc(f.sub)}</p>` : ""}
        ${trustMini}
      </div>
      <form id="leadForm" novalidate>
        <div class="form-group">
          <label class="form-label">Chọn gói <span class="req">*</span></label>
          <div class="form-radio-group">${renderProductRadios(c.products)}</div>
        </div>
        ${giftGroup}
        <div class="form-row cols-2">
          <div class="form-group"><label class="form-label" for="name">Họ tên <span class="req">*</span></label>
            <input type="text" id="name" name="name" class="form-input" required autocomplete="name" placeholder="VD: Nguyễn Văn A">
            <div class="form-error" data-for="name">Vui lòng nhập họ tên</div></div>
          <div class="form-group"><label class="form-label" for="phone">Số điện thoại <span class="req">*</span></label>
            <input type="tel" id="phone" name="phone" class="form-input" required inputmode="numeric" autocomplete="tel" placeholder="VD: 0912345678">
            <div class="form-error" data-for="phone">SĐT phải có 10 chữ số, bắt đầu bằng 0</div></div>
        </div>
        <div class="form-group"><label class="form-label" for="province">${esc(f.provinceLabel)} <span class="req">*</span></label>
          <input type="text" id="province" name="province" class="form-input" required autocomplete="street-address" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành">
          <div class="form-error" data-for="province">Vui lòng nhập địa chỉ nhận hàng</div></div>
        <div class="form-group"><label class="form-label" for="note">Ghi chú thêm (không bắt buộc)</label>
          <textarea id="note" name="note" class="form-textarea" placeholder="VD: Cho gọi sau 18h..."></textarea></div>
        <button type="submit" class="btn btn-primary btn-pulse">${esc(f.submitText)}</button>
        <div class="form-trust">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Thông tin bảo mật — không spam, không bán cho bên thứ ba
        </div>
      </form>
      <div class="form-success" id="formSuccess">
        <div class="fs-icon">✓</div><h3>${esc(f.successTitle)}</h3><p>${mlEsc(f.successDesc)}</p>
      </div>
    </div>
  </div></section>`;
}

function renderSpecs(c) {
  const sp = c.specs;
  if (!sp.rows.length) return "";
  const rows = sp.rows.map((r) =>
    `<div class="spec-row"><div class="spec-label">${esc(r.label)}</div><div class="spec-value">${esc(r.value)}</div></div>`).join("");
  return `<section><div class="container">
    <div class="section-head"><span class="eyebrow">${esc(sp.eyebrow)}</span>${sp.h2 ? `<h2>${mlEsc(sp.h2)}</h2>` : ""}</div>
    <div class="specs-table reveal">${rows}</div>
  </div></section>`;
}

function renderShowroom(c) {
  const sr = c.showroom;
  if (!sr.items.length) return "";
  const cards = sr.items.map((s) => {
    const lines = arr(s.lines).map((ln) =>
      `<div class="showroom-info-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><div>${esc(ln)}</div></div>`).join("");
    const phone = s.phone
      ? `<div class="showroom-info-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg><div><strong>${esc(s.phone)}</strong></div></div>` : "";
    const mapQ = encodeURIComponent(s.mapQuery || s.city || "");
    return `<div class="showroom-card reveal">
      <div class="showroom-map">${s.mapQuery ? `<iframe src="https://maps.google.com/maps?q=${mapQ}&t=&z=12&ie=UTF8&iwloc=&output=embed" loading="lazy" title="Bản đồ ${esc(s.city)}"></iframe>` : `<div class="showroom-map-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(s.city)}</div>`}</div>
      <div class="showroom-body">
        ${s.label ? `<div class="showroom-label">${esc(s.label)}</div>` : ""}
        ${s.city ? `<div class="showroom-city">${esc(s.city)}</div>` : ""}
        <div class="showroom-info">${lines}${phone}</div>
        <div class="showroom-actions">
          <a href="https://www.google.com/maps/search/${mapQ}" target="_blank" rel="noopener" class="showroom-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Chỉ đường</a>
          ${s.phone ? `<a href="tel:${esc(String(s.phone).replace(/\s/g, ""))}" class="showroom-btn ghost">Gọi ngay</a>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");
  return `<section class="section-warm"><div class="container">
    <div class="section-head"><span class="eyebrow eyebrow-teal">${esc(sr.eyebrow)}</span>
      ${sr.h2 ? `<h2>${mlEsc(sr.h2)}</h2>` : ""}${sr.p ? `<p>${esc(sr.p)}</p>` : ""}</div>
    <div class="showrooms-grid">${cards}</div>
  </div></section>`;
}

function renderFaq(c) {
  const fq = c.faq;
  if (!fq.items.length) return "";
  const items = fq.items.map((it) =>
    `<details class="faq-item"><summary class="faq-q">${esc(it.q)}<span class="faq-toggle">+</span></summary><div class="faq-a">${mlEsc(it.a)}</div></details>`).join("");
  return `<section class="section-cream"><div class="container-narrow">
    <div class="section-head"><span class="eyebrow">${esc(fq.eyebrow)}</span>${fq.h2 ? `<h2>${mlEsc(fq.h2)}</h2>` : ""}</div>
    <div class="faq-list">${items}</div>
  </div></section>`;
}

function renderFooter(c, img) {
  const ft = c.footer;
  const logo = img("logo");
  const brand = logo
    ? `<div class="brand-mark" style="margin-bottom:14px"><img src="${esc(logo)}" alt="${esc(c.brand)}" class="brand-img" style="height:40px"></div>`
    : (c.brand ? `<div class="brand-name" style="color:#fff;margin-bottom:14px">${esc(c.brand)}</div>` : "");
  const cols = ft.cols.map((col) =>
    `<div><h5>${esc(col.title || "")}</h5>${arr(col.links).map((l) =>
      `<a href="${esc(l.href || "#")}">${esc(l.text || "")}</a>`).join("")}</div>`).join("");
  return `<footer class="footer"><div class="container">
    <div class="footer-grid">
      <div>${brand}${ft.desc ? `<p style="line-height:1.6;font-size:13px;margin-bottom:14px">${esc(ft.desc)}</p>` : ""}</div>
      ${cols}
    </div>
    ${ft.bottom ? `<div class="footer-bottom">${esc(ft.bottom)}</div>` : ""}
  </div></footer>`;
}

function renderSticky(c) {
  const st = c.sticky;
  if (!st.title && !st.sub) return "";
  return `<div class="sticky-cta" id="stickyCta"><div class="sticky-cta-inner">
    <div class="sticky-info">${st.title ? `<div class="sticky-info-title">${esc(st.title)}</div>` : ""}${st.sub ? `<div class="sticky-info-sub">${esc(st.sub)}</div>` : ""}</div>
    <a href="#dat-hang" class="btn btn-primary">${esc(st.ctaText)}</a>
  </div></div>`;
}

function renderFloat(c) {
  const messenger = c.contact.messenger;
  const phone = c.contact.hotline;
  if (!messenger && !phone) return "";
  const mess = messenger
    ? `<a href="${esc(messenger)}" target="_blank" rel="noopener" class="fbtn fbtn-mess" aria-label="Chat Messenger"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.34.27.55l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.16-.07.34-.08.51-.04.91.25 1.88.38 2.83.38 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6.02 7.46l-2.93 4.65c-.47.74-1.47.93-2.18.41l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.39c-.42.32-.97-.18-.69-.63l2.93-4.65c.47-.74 1.47-.93 2.18-.41l2.33 1.75c.21.16.5.16.72 0l3.15-2.39c.42-.32.97.18.69.63z"/></svg></a>` : "";
  const call = phone
    ? `<a href="tel:${esc(String(phone).replace(/\s/g, ""))}" class="fbtn fbtn-call" aria-label="Gọi ${esc(phone)}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg></a>` : "";
  return `<div class="floatbtns">${mess}${call}</div>`;
}

/* ---------- CSS (palette + layout noma911) ---------- */
function css(t) {
  return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
img,picture,video{display:block;max-width:100%;height:auto}
:root{
  --black:${t.dark}; --black-2:#161616; --black-3:#1f1f1f;
  --orange:${t.primary}; --orange-bright:#FF8534; --orange-deep:${t.orangeDeep};
  --gold:${t.gold}; --gold-light:#F5C842;
  --teal:#0EA5E9; --teal-soft:#7DD3FC; --purple:#7C3AED; --crimson:#DC2626; --emerald:#10B981;
  --white:#fff; --cream:#FFF8F0; --warm-50:#FAF7F2;
  --gray-50:#F9F7F4; --gray-100:#F0EDE8; --gray-200:#E5E0D8;
  --gray-300:#C7C2BC; --gray-500:#6B6660; --gray-700:#3B3935;
  --success:#16A34A; --warning:#D97706; --error:#DC2626; --info:#0EA5E9;
  --font-display:'Oswald',sans-serif; --font-impact:'Oswald',sans-serif; --font-body:'Manrope',system-ui,sans-serif;
  --space-xs:8px; --space-sm:12px; --space-md:16px; --space-lg:24px; --space-xl:40px; --space-2xl:64px; --space-3xl:96px;
  --r-sm:6px; --r-md:12px; --r-lg:20px; --r-xl:28px; --r-2xl:36px;
  --shadow-sm:0 2px 8px rgba(0,0,0,0.05); --shadow-md:0 8px 24px rgba(0,0,0,0.12); --shadow-lg:0 20px 60px rgba(0,0,0,0.25);
  --shadow-orange:0 12px 40px rgba(255,107,26,0.35); --shadow-gold:0 8px 28px rgba(212,160,23,0.3);
}
body{font-family:var(--font-body);font-size:16px;line-height:1.6;color:var(--gray-700);background:var(--white);overflow-x:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.container{max-width:1140px;margin:0 auto;padding:0 20px}
.container-narrow{max-width:720px;margin:0 auto;padding:0 20px}
.container-mid{max-width:900px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-family:var(--font-display);font-weight:700;text-transform:uppercase;letter-spacing:0.01em;line-height:1.14;color:var(--black)}
.brand-logo,.brand-name,.stat-num,.pull-quote-mark,.save-amount,.dfeature-num,.pnum,.step-num,.cd-num,.combo-price,.rs-score,.radio-price,.sticky-info-title,.hotline-big{font-weight:700}
.eyebrow{font-family:var(--font-body);font-weight:700;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:var(--orange)}
.eyebrow-teal{color:var(--teal)} .eyebrow-gold{color:var(--gold)} .eyebrow-crimson{color:var(--crimson)}
.topbar{position:sticky;top:0;z-index:50;background:rgba(10,10,10,0.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.08);padding:10px 0}
.topbar-inner{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand-mark{display:flex;align-items:center;gap:10px;color:white;text-decoration:none}
.brand-name{font-family:var(--font-impact);font-size:22px;letter-spacing:0.08em;line-height:1;color:white}
.brand-img{height:34px;width:auto;display:block}
.announce{background:linear-gradient(90deg,var(--crimson) 0%,#B91C1C 50%,var(--crimson) 100%);color:white;text-align:center;padding:9px 16px;font-size:13px;font-weight:600;letter-spacing:0.02em;position:relative;overflow:hidden}
.announce-bolt{display:inline-block;animation:bolt 1.5s ease-in-out infinite}
@keyframes bolt{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
.hero{background:var(--black);color:white;position:relative;overflow:hidden;padding:36px 0 56px}
.hero-bg{position:absolute;inset:0;z-index:0;overflow:hidden}
.hero-bg img{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100%;height:100%;object-fit:cover;object-position:right bottom;filter:brightness(1.18) contrast(1.05) saturate(1.08)}
.hero-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0.94) 0%,rgba(0,0,0,0.78) 35%,rgba(0,0,0,0.4) 65%,rgba(0,0,0,0.1) 100%);pointer-events:none}
@media(min-width:900px){.hero{min-height:86vh;display:flex;align-items:center;padding:48px 0}.hero>.container{width:100%}}
@media(max-width:900px){.hero-bg img{object-position:center}.hero-bg::after{background:linear-gradient(180deg,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0.22) 48%,rgba(0,0,0,0.5) 100%)}.hero-stats{padding:9px 6px;margin-top:16px;gap:0}.hero-stats .stat-num{font-size:19px}.hero-stats .stat-label{font-size:8.5px;letter-spacing:0.06em}.hero-sub{margin-bottom:18px}}
.hero::before{content:'';position:absolute;top:-15%;right:-25%;width:75%;height:120%;background:radial-gradient(circle,rgba(255,107,26,0.14) 0%,transparent 60%);pointer-events:none;z-index:1}
.hero-inner{position:relative;z-index:2;max-width:580px}
@media(max-width:720px){.hero-inner{max-width:100%}}
.hero-badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}
.badge-pill{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);padding:6px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:white;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.badge-pill.us{background:linear-gradient(135deg,#1E3A8A,#1c2e6b);border:1px solid rgba(255,255,255,0.2)}
.badge-pill.gold{background:linear-gradient(135deg,var(--gold),#b8860b);color:var(--black);border:1px solid var(--gold-light)}
.hero-title{font-family:'Oswald',var(--font-display);font-weight:700;text-transform:uppercase;color:white;font-size:clamp(33px,7.6vw,64px);line-height:1.12;letter-spacing:0.01em;margin-bottom:18px;text-shadow:0 2px 14px rgba(0,0,0,0.6)}
.hero-title .orange{color:var(--orange)} .hero-title .block{display:block}
.hero-title .accent{font-family:'Oswald',var(--font-impact);font-weight:700;font-size:1.1em;line-height:1.18;display:inline-block;padding-bottom:0.1em;background:linear-gradient(180deg,#fff 0%,var(--orange-bright) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.hero-sub{font-size:16px;line-height:1.55;color:rgba(255,255,255,0.88);margin-bottom:26px;max-width:520px;text-shadow:0 1px 8px rgba(0,0,0,0.55)}
.hero-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:24px;border:1px solid rgba(255,255,255,0.12);padding:16px 12px;border-radius:10px;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.stat-item{text-align:center;padding:0 6px;border-right:1px solid rgba(255,255,255,0.1)} .stat-item:last-child{border-right:none}
.stat-num{font-family:var(--font-impact);font-size:26px;color:var(--orange-bright);line-height:1;margin-bottom:4px;letter-spacing:0.02em}
.stat-label{font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.65);font-weight:700}
.hero-cta-row{margin-top:28px;display:flex;flex-direction:column;gap:10px}
.hero-trust-row{margin-top:14px;display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:rgba(255,255,255,0.6);font-weight:600}
.hero-trust-row span{display:inline-flex;align-items:center;gap:5px} .hero-trust-row svg{width:12px;height:12px;color:var(--emerald)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:18px 28px;font-family:var(--font-body);font-size:15px;font-weight:800;letter-spacing:0.04em;text-decoration:none;text-transform:uppercase;border:none;cursor:pointer;border-radius:12px;transition:transform 0.2s,box-shadow 0.2s;width:100%;text-align:center;line-height:1.2}
.btn-primary{background:linear-gradient(135deg,var(--orange) 0%,var(--orange-deep) 100%);color:white;box-shadow:var(--shadow-orange),0 8px 24px rgba(255,107,26,0.4)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 0 60px rgba(255,107,26,0.5),0 12px 30px rgba(255,107,26,0.5)}
.btn-primary:active{transform:translateY(0)}
@keyframes pulse{0%,100%{box-shadow:var(--shadow-orange),0 8px 24px rgba(255,107,26,0.4)}50%{box-shadow:0 0 60px rgba(255,107,26,0.7),0 8px 30px rgba(255,107,26,0.6)}}
.btn-pulse{animation:pulse 2.5s infinite}
section{padding:72px 0;position:relative}
@media(max-width:720px){section{padding:56px 0}}
.section-dark{background:var(--black);color:white} .section-dark h2,.section-dark h3{color:white}
.section-cream{background:var(--cream)} .section-warm{background:var(--warm-50)} .section-gray{background:var(--gray-50)}
.section-head{text-align:center;margin-bottom:44px}
.section-head .eyebrow{display:block;margin-bottom:10px}
.section-head h2{font-size:clamp(32px,7vw,54px);line-height:1.14;margin-bottom:14px}
.section-head p{color:var(--gray-500);font-size:16px;max-width:620px;margin:0 auto;line-height:1.6}
.section-dark .section-head p{color:rgba(255,255,255,0.72)}
.pull-quote-section{padding:48px 0;background:linear-gradient(180deg,var(--black) 0%,#1a0e07 50%,var(--black) 100%);color:white;position:relative;overflow:hidden}
.pull-quote-section::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:120%;height:120%;background:radial-gradient(circle,rgba(255,107,26,0.15) 0%,transparent 50%);pointer-events:none}
.pull-quote{max-width:780px;margin:0 auto;text-align:center;padding:0 24px;position:relative;z-index:2}
.pull-quote-mark{font-family:var(--font-impact);font-size:80px;color:var(--orange);line-height:0.5;margin-bottom:8px;opacity:0.7}
.pull-quote-text{font-family:var(--font-body);font-size:clamp(22px,3.5vw,30px);line-height:1.4;font-weight:600;color:white;font-style:italic;letter-spacing:-0.005em}
.pull-quote-light{background:linear-gradient(180deg,var(--cream) 0%,#FCEEDD 50%,var(--cream) 100%);color:var(--black)}
.pull-quote-light::before{background:radial-gradient(circle,rgba(255,107,26,0.08) 0%,transparent 50%)}
.pull-quote-light .pull-quote-text{color:var(--black)}
.problem-grid{display:grid;gap:16px;grid-template-columns:repeat(2,1fr)}
@media(min-width:980px){.problem-grid{grid-template-columns:repeat(4,1fr)}}
.problem-card{background:var(--white);border:1px solid var(--gray-100);border-radius:var(--r-lg);text-align:left;transition:all 0.3s;overflow:hidden;display:flex;flex-direction:column;position:relative}
.problem-card:hover{transform:translateY(-6px);box-shadow:var(--shadow-md);border-color:var(--orange)}
.problem-img{width:100%;aspect-ratio:1/1;overflow:hidden;position:relative}
.problem-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s ease}
.problem-card:hover .problem-img img{transform:scale(1.07)}
.problem-img::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(0,0,0,0.6) 100%);pointer-events:none}
.problem-badge{position:absolute;top:14px;left:14px;background:rgba(0,0,0,0.7);color:white;padding:5px 11px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:2;border:1px solid rgba(255,255,255,0.18)}
.problem-body{padding:20px 20px 24px;display:flex;flex-direction:column;flex:1}
.problem-card h3{font-family:var(--font-body);font-weight:800;font-size:16px;color:var(--black);margin-bottom:8px;letter-spacing:0;line-height:1.3}
.problem-card p{font-size:13px;color:var(--gray-500);line-height:1.5}
.solution-split{display:grid;gap:28px;align-items:center}
@media(min-width:900px){.solution-split{grid-template-columns:1.05fr 1fr;gap:48px}}
.solution-media img{width:100%;display:block;border-radius:var(--r-lg);box-shadow:var(--shadow-lg)}
.solution-content .eyebrow{display:block;margin-bottom:10px}
.solution-content h2{font-size:clamp(28px,4.6vw,44px);line-height:1.1;margin-bottom:14px}
.solution-lead{color:rgba(255,255,255,0.72);font-size:15px;line-height:1.6}
.solution-intro{background:var(--black-2);border:1px solid rgba(255,255,255,0.1);border-left:4px solid var(--orange);padding:18px 22px;border-radius:var(--r-md);margin-top:22px;font-size:14.5px;line-height:1.6;color:rgba(255,255,255,0.85)}
.solution-intro strong{color:var(--orange-bright);font-weight:700}
.solution-features{list-style:none;display:flex;flex-direction:column;gap:14px;margin-top:22px}
.solution-features li{display:flex;gap:13px;align-items:flex-start;font-size:14px;color:rgba(255,255,255,0.78);line-height:1.5}
.solution-features strong{color:white;font-weight:800}
.sf-icon{width:40px;height:40px;flex-shrink:0;background:linear-gradient(135deg,var(--orange),var(--orange-deep));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;box-shadow:0 6px 18px rgba(255,107,26,0.3)}
.compare-table.combo{max-width:840px}
.compare-table.combo .compare-row{grid-template-columns:0.85fr 1fr 1.1fr}
.compare-table.combo .compare-row>div{align-items:flex-start}
.compare-table.combo .head>div{align-items:center}
.compare-table.combo .col-normal,.compare-table.combo .col-noma{text-align:left;justify-content:flex-start}
.compare-table.combo .check,.compare-table.combo .x{flex-shrink:0}
.compare-row .price-line{display:block;font-size:12px;font-weight:700;margin-top:5px;text-transform:none;letter-spacing:0;opacity:0.9}
.compare-row.head .col-noma .price-line{color:#fff}
.compare-row.highlight .label{color:var(--orange-deep);background:rgba(212,160,23,0.1)}
.compare-row.highlight .col-noma{background:rgba(212,160,23,0.14)}
.save-amount{font-family:var(--font-impact);font-size:22px;color:var(--orange-deep);letter-spacing:0.03em}
@media(max-width:560px){.compare-table.combo .compare-row{font-size:12px}.compare-table.combo .compare-row>div{padding:12px 8px}}
.design-wrap{display:grid;gap:32px;align-items:center}
@media(min-width:900px){.design-wrap{grid-template-columns:1fr 1fr}}
.design-image img{width:100%;border-radius:var(--r-lg)}
.design-features{display:flex;flex-direction:column;gap:14px}
.dfeature{display:flex;gap:14px;align-items:flex-start;padding:18px 20px;background:var(--white);border:1px solid var(--gray-100);border-radius:var(--r-md);box-shadow:0 2px 8px rgba(0,0,0,0.04);transition:all 0.3s}
.dfeature:hover{transform:translateX(4px);border-color:var(--orange);box-shadow:0 6px 18px rgba(255,107,26,0.12)}
.dfeature-num{width:38px;height:38px;background:linear-gradient(135deg,var(--orange),var(--orange-deep));color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:var(--font-impact);font-size:17px}
.dfeature h4{font-family:var(--font-body);font-weight:800;font-size:15px;color:var(--black);margin-bottom:3px}
.dfeature p{font-size:13px;color:var(--gray-500);line-height:1.5}
.compare-table{background:var(--white);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-lg);max-width:780px;margin:0 auto;border:1px solid var(--gray-100)}
.compare-row{display:grid;grid-template-columns:1.2fr 1fr 1.1fr;font-size:13px}
.compare-row.head{background:var(--black);color:white}
.compare-row.head>div{padding:15px 12px;font-family:var(--font-body);font-weight:800;letter-spacing:0.05em;text-transform:uppercase;font-size:11px;text-align:center}
.compare-row.head .col-noma{background:linear-gradient(135deg,var(--orange),var(--orange-deep));position:relative}
.compare-row.head .col-noma::after{content:'';position:absolute;top:0;left:0;width:100%;height:3px;background:var(--gold)}
.compare-row>div{padding:15px 12px;border-bottom:1px solid var(--gray-100);display:flex;align-items:center;line-height:1.45}
.compare-row:last-child>div{border-bottom:none}
.compare-row .label{font-weight:700;color:var(--black);background:var(--gray-50);border-right:1px solid var(--gray-100)}
.compare-row .col-normal{color:var(--gray-500);text-align:center;justify-content:center;border-right:1px solid var(--gray-100)}
.compare-row .col-noma{color:var(--black);font-weight:700;text-align:center;justify-content:center;background:rgba(255,107,26,0.06)}
.compare-row .col-noma .check{color:var(--success);font-weight:800;margin-right:5px}
.compare-row .col-normal .x{color:var(--error);margin-right:5px}
.handles-grid{display:grid;gap:12px;max-width:780px;margin:0 auto}
@media(min-width:600px){.handles-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:900px){.handles-grid{grid-template-columns:repeat(3,1fr)}}
.handle-item{display:flex;align-items:center;gap:12px;background:var(--white);padding:14px 18px;border-radius:var(--r-md);border:1px solid var(--gray-100);font-size:14px;color:var(--black);font-weight:600;transition:all 0.25s}
.handle-item:hover{border-color:var(--orange);transform:translateY(-2px);box-shadow:0 6px 16px rgba(255,107,26,0.1)}
.handle-check{width:24px;height:24px;background:var(--success);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800;font-size:14px}
.trustbar{background:var(--black-2);border-bottom:1px solid rgba(255,255,255,0.08)}
.trustbar-inner{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:10px 26px;padding:15px 20px;max-width:1100px;margin:0 auto}
.trust-pill{display:inline-flex;align-items:center;gap:8px;color:rgba(255,255,255,0.92);font-size:13px;font-weight:700;letter-spacing:0.01em}
.trust-pill svg{width:18px;height:18px;color:var(--orange-bright);flex-shrink:0}
@media(max-width:560px){.trustbar-inner{gap:9px 16px;padding:13px 14px}.trust-pill{font-size:12px}}
.surface-grid{display:grid;gap:14px;max-width:940px;margin:0 auto;grid-template-columns:repeat(2,1fr)}
@media(min-width:760px){.surface-grid{grid-template-columns:repeat(4,1fr)}}
.surface-card{background:var(--white);border:1px solid var(--gray-100);border-radius:var(--r-lg);padding:24px 16px;text-align:center;transition:all 0.3s}
.surface-card:hover{transform:translateY(-4px);border-color:var(--orange);box-shadow:0 8px 22px rgba(255,107,26,0.12)}
.surface-icon{width:58px;height:58px;margin:0 auto 12px;background:linear-gradient(135deg,var(--orange),var(--orange-deep));border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:27px;box-shadow:0 8px 20px rgba(255,107,26,0.28)}
.surface-card h4{font-family:var(--font-body);font-weight:800;font-size:14.5px;color:var(--black);margin-bottom:5px}
.surface-card p{font-size:12px;color:var(--gray-500);line-height:1.45}
.apply-subhead{text-align:center;font-family:var(--font-body);font-weight:800;color:var(--black);font-size:14px;letter-spacing:0.1em;margin:40px 0 18px;text-transform:uppercase}
.proof-band{display:grid;gap:14px;max-width:980px;margin:0 auto;grid-template-columns:repeat(2,1fr)}
@media(min-width:760px){.proof-band{grid-template-columns:repeat(4,1fr)}}
.proof-stat{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:var(--r-lg);padding:26px 16px;text-align:center}
.proof-stat .pnum{font-family:var(--font-impact);font-size:40px;line-height:1;color:var(--orange-bright);letter-spacing:0.02em;margin-bottom:8px}
.proof-stat .plabel{font-size:12px;color:rgba(255,255,255,0.72);line-height:1.45;font-weight:600}
.proof-cert{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:26px}
.cert-chip{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:9px 16px;font-size:12.5px;font-weight:700;color:#fff}
.cert-chip svg{width:15px;height:15px;color:var(--emerald);flex-shrink:0}
.apply-top{display:grid;gap:30px;align-items:center;margin-bottom:8px}
@media(min-width:900px){.apply-top{grid-template-columns:1fr 1fr}}
.apply-media img{width:100%;border-radius:var(--r-lg);box-shadow:var(--shadow-lg);display:block}
.apply-top .surface-grid{grid-template-columns:repeat(2,1fr);max-width:none;margin:0}
.proof-split{display:grid;gap:32px;align-items:center}
@media(min-width:900px){.proof-split{grid-template-columns:1fr 1fr}}
.proof-media img{width:100%;border-radius:var(--r-lg);box-shadow:var(--shadow-lg);display:block}
.proof-info .proof-band{grid-template-columns:repeat(2,1fr);max-width:none;margin:0}
.proof-info .proof-cert{justify-content:flex-start;margin-top:18px}
.specs-table{background:var(--white);border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--gray-100);box-shadow:var(--shadow-md);max-width:640px;margin:0 auto}
.spec-row{display:flex;border-bottom:1px solid var(--gray-100);padding:14px 20px;font-size:14px}
.spec-row:last-child{border-bottom:none} .spec-row:nth-child(even){background:var(--gray-50)}
.spec-label{font-weight:700;color:var(--black);flex:0 0 45%;letter-spacing:0.02em}
.spec-value{color:var(--gray-700);flex:1}
.steps-grid{display:grid;gap:24px;margin-top:24px}
@media(min-width:720px){.steps-grid{grid-template-columns:repeat(3,1fr)}}
.step-card{background:var(--white);border-radius:var(--r-lg);padding:36px 24px 26px;position:relative;border:1px solid var(--gray-100);text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.04)}
.step-num{position:absolute;top:-22px;left:50%;transform:translateX(-50%);width:50px;height:50px;background:linear-gradient(135deg,var(--orange),var(--orange-deep));color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-impact);font-size:24px;box-shadow:0 6px 20px rgba(255,107,26,0.4)}
.step-card h3{font-family:var(--font-body);font-weight:800;font-size:16px;color:var(--black);margin:10px 0 8px;letter-spacing:0.04em;text-transform:uppercase}
.step-card p{font-size:13.5px;color:var(--gray-500);line-height:1.55}
.section-combo{background:linear-gradient(180deg,var(--black) 0%,#1a1410 100%);color:white;position:relative}
.section-combo::before{content:'';position:absolute;inset:0;background-image:radial-gradient(circle at 20% 30%,rgba(212,160,23,0.16),transparent 50%),radial-gradient(circle at 80% 70%,rgba(255,107,26,0.13),transparent 50%);pointer-events:none}
.section-combo .section-head h2{color:white}
.combo-grid{display:grid;gap:26px;position:relative;z-index:2;margin-top:24px}
@media(min-width:900px){.combo-grid{grid-template-columns:repeat(3,1fr);align-items:stretch}}
.combo-card{background:linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.1);border-radius:var(--r-xl);padding:34px 24px;text-align:center;position:relative;transition:transform 0.3s,border-color 0.3s;display:flex;flex-direction:column}
.combo-card:hover{transform:translateY(-6px);border-color:var(--gold)}
.combo-card.featured{background:linear-gradient(180deg,rgba(212,160,23,0.16),rgba(255,107,26,0.08));border:2px solid var(--gold);box-shadow:var(--shadow-gold),0 20px 60px rgba(212,160,23,0.2)}
.combo-tag{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:var(--gold);color:var(--black);font-family:var(--font-body);font-weight:800;font-size:11px;padding:6px 16px;border-radius:999px;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap}
.combo-img-wrap{height:250px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;gap:8px}
.combo-img-wrap img{max-height:100%;width:auto;filter:drop-shadow(0 10px 24px rgba(0,0,0,0.4))}
.combo-card h3{font-family:var(--font-display);font-size:28px;color:white;margin-bottom:6px;letter-spacing:0.02em}
.combo-desc{font-size:13px;color:rgba(255,255,255,0.65);margin-bottom:16px;min-height:38px}
.combo-price{font-family:var(--font-impact);font-size:38px;color:var(--orange-bright);line-height:1;margin-bottom:4px;letter-spacing:0.02em}
.combo-price-old{font-size:13px;color:rgba(255,255,255,0.5);text-decoration:line-through;margin-bottom:14px}
.combo-gift{background:rgba(212,160,23,0.16);border:1px dashed var(--gold);border-radius:var(--r-md);padding:11px 14px;margin-bottom:20px;font-size:12.5px;color:var(--gold-light);font-weight:600;line-height:1.45}
.combo-btn{width:100%;padding:14px;background:white;color:var(--black);border:none;border-radius:var(--r-md);font-family:var(--font-body);font-weight:800;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;margin-top:auto}
.combo-card.featured .combo-btn{background:linear-gradient(135deg,var(--orange),var(--orange-deep));color:white;box-shadow:0 6px 20px rgba(255,107,26,0.3)}
.combo-btn:hover{transform:scale(1.02)}
.gift-block{margin-top:42px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:var(--r-xl);padding:26px 22px;position:relative;z-index:2}
.gift-head{text-align:center;font-family:var(--font-body);font-weight:800;font-size:14px;color:var(--gold-light);letter-spacing:0.08em;margin-bottom:20px;text-transform:uppercase}
.gift-grid{display:grid;gap:16px}
@media(min-width:680px){.gift-grid{grid-template-columns:repeat(2,1fr)}}
.gift-card{display:flex;gap:16px;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:var(--r-lg);padding:16px;cursor:pointer;transition:all 0.25s}
.gift-card:hover{border-color:var(--gold);background:rgba(212,160,23,0.1);transform:translateY(-3px)}
.gift-pick{display:inline-block;margin-top:8px;font-size:12px;font-weight:800;color:var(--gold-light);letter-spacing:0.02em}
.gift-thumb{width:84px;height:84px;flex-shrink:0;background:#fff;border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;padding:6px}
.gift-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.gift-info h4{font-family:var(--font-body);font-weight:800;font-size:14px;color:#fff;margin-bottom:5px}
.gift-info p{font-size:12.5px;color:rgba(255,255,255,0.72);line-height:1.5}
.faq-list{max-width:740px;margin:0 auto}
.faq-item{border-bottom:1px solid var(--gray-200);padding:16px 0}
.faq-q{display:flex;justify-content:space-between;align-items:center;gap:16px;cursor:pointer;font-weight:700;color:var(--black);font-size:15.5px;list-style:none;user-select:none;padding:4px 0;line-height:1.4}
.faq-q::-webkit-details-marker{display:none}
.faq-toggle{width:30px;height:30px;background:var(--cream);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--orange);font-weight:800;font-size:20px;flex-shrink:0;transition:transform 0.25s,background 0.25s;line-height:1}
details[open] .faq-toggle{transform:rotate(45deg);background:var(--orange);color:white}
.faq-a{padding:14px 0 6px;font-size:14px;color:var(--gray-700);line-height:1.7}
.faq-a strong{color:var(--black)}
.section-form{background:linear-gradient(180deg,var(--cream) 0%,var(--white) 100%);position:relative}
.form-card{background:var(--white);border-radius:var(--r-xl);padding:40px 28px;box-shadow:var(--shadow-lg);max-width:600px;margin:0 auto;border:1px solid var(--gray-100)}
.form-header{text-align:center;margin-bottom:28px}
.form-header h2{font-size:clamp(30px,7vw,44px);margin-bottom:8px;line-height:1.14}
.form-header p{color:var(--gray-500);font-size:14px}
.form-trust-mini{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:12px;flex-wrap:wrap}
.form-trust-mini span{font-size:11px;color:var(--gray-500);font-weight:600;display:inline-flex;align-items:center;gap:4px}
.form-trust-mini svg{width:12px;height:12px;color:var(--emerald)}
.form-group{margin-bottom:16px}
.form-row{display:grid;gap:12px}
@media(min-width:520px){.form-row.cols-2{grid-template-columns:1fr 1fr}}
.form-label{display:block;font-weight:700;font-size:13px;color:var(--black);margin-bottom:6px;letter-spacing:0.02em}
.form-label .req{color:var(--orange)}
.form-input,.form-textarea,.form-select{width:100%;padding:14px 16px;border:2px solid var(--gray-100);border-radius:var(--r-md);font-family:var(--font-body);font-size:15px;background:var(--white);transition:border-color 0.2s;-webkit-appearance:none;appearance:none}
.form-input:focus,.form-textarea:focus,.form-select:focus{outline:none;border-color:var(--orange)}
.form-textarea{resize:vertical;min-height:60px;font-family:var(--font-body)}
.form-radio-group{display:flex;flex-direction:column;gap:9px}
.form-radio{display:flex;align-items:center;gap:12px;padding:14px 16px;border:2px solid var(--gray-100);border-radius:var(--r-md);cursor:pointer;transition:all 0.2s}
.form-radio:hover{border-color:var(--orange)}
.form-radio input{accent-color:var(--orange);width:18px;height:18px;flex-shrink:0;margin:0}
.form-radio:has(input:checked){border-color:var(--orange);background:var(--cream)}
.radio-content{flex:1}
.radio-title{font-weight:700;color:var(--black);font-size:14px;margin-bottom:2px}
.radio-desc{font-size:12px;color:var(--gray-500)}
.radio-price{font-family:var(--font-impact);font-size:18px;color:var(--orange);letter-spacing:0.02em}
.gift-radio-thumb{width:54px;height:54px;flex-shrink:0;background:#fff;border:1px solid var(--gray-100);border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;padding:4px}
.gift-radio-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.gift-radio-value{flex-shrink:0;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:1px}
.gift-radio-old{font-size:11px;color:var(--gray-500);text-decoration:line-through}
.gift-radio-tag{font-family:var(--font-impact);font-size:13px;color:var(--emerald);letter-spacing:0.04em}
.form-error{color:var(--error);font-size:12px;margin-top:4px;display:none;font-weight:600}
.form-input.error,.form-textarea.error{border-color:var(--error)}
.form-error.show{display:block}
.form-trust{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;font-size:11px;color:var(--gray-500)}
.form-trust svg{width:14px;height:14px;color:var(--success)}
.form-success{display:none;text-align:center;padding:32px 16px}
.form-success.show{display:block}
.fs-icon{width:80px;height:80px;margin:0 auto 16px;background:var(--success);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:44px}
.form-success h3{font-family:var(--font-display);font-size:32px;color:var(--black);margin-bottom:8px;letter-spacing:0.02em}
.form-success p{color:var(--gray-500);font-size:14px;line-height:1.6}
@media(max-width:600px){
  .problem-grid{gap:10px}.problem-body{padding:12px 12px 14px}.problem-card h3{font-size:13.5px;margin-bottom:4px;line-height:1.25}.problem-card p{font-size:11.5px;line-height:1.45}
  .problem-badge{font-size:8.5px;padding:4px 8px;top:8px;left:8px;letter-spacing:0.08em}
  .form-card{padding:22px 15px}.form-header{margin-bottom:16px}.form-header h2{font-size:clamp(22px,6vw,30px);margin-bottom:6px;line-height:1.12}.form-header p{font-size:12.5px}
  .form-group{margin-bottom:11px}.form-radio-group{gap:7px}.form-radio{padding:9px 11px;gap:9px}.radio-title{font-size:12.5px}.radio-desc{font-size:11px}.radio-price{font-size:15px}
  .form-label{font-size:12px;margin-bottom:4px}.form-input,.form-textarea,.form-select{padding:11px 13px;font-size:14px}
  .gift-radio-thumb{width:42px;height:42px}
  .section-head{margin-bottom:30px}.section-head h2{font-size:clamp(20px,5.4vw,32px);line-height:1.2;margin-bottom:10px}
  .combo-grid{grid-template-columns:repeat(3,1fr);gap:7px;margin-top:18px;align-items:stretch}
  .combo-card{padding:20px 6px 11px;border-radius:13px}.combo-tag{font-size:7.5px;padding:3px 6px;top:-8px;letter-spacing:0.04em}
  .combo-img-wrap{height:60px;margin-bottom:8px;gap:3px}.combo-img-wrap img{height:auto !important;max-height:100%;max-width:47%;filter:drop-shadow(0 3px 7px rgba(0,0,0,0.45))}.combo-img-wrap img:only-child{max-width:74%}
  .combo-card h3{font-size:11.5px;margin-bottom:3px;line-height:1.12;letter-spacing:0}.combo-desc{font-size:8.5px;margin-bottom:6px;min-height:0;line-height:1.28}
  .combo-price{font-size:19px;margin-bottom:3px}.combo-gift{font-size:8px;padding:5px 5px;margin-bottom:8px;line-height:1.22}.combo-btn{padding:8px 4px;font-size:9px;letter-spacing:0.02em}
}
.sticky-cta{position:fixed;bottom:0;left:0;right:0;background:rgba(10,10,10,0.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,0.1);padding:11px 14px;z-index:40;display:none;transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);box-shadow:0 -8px 24px rgba(0,0,0,0.3)}
.sticky-cta.show{display:block;transform:translateY(0)}
.sticky-cta-inner{display:flex;align-items:center;gap:10px;max-width:640px;margin:0 auto}
.sticky-info{flex:1;color:white;min-width:0}
.sticky-info-title{font-family:var(--font-impact);font-size:17px;letter-spacing:0.04em;color:var(--orange-bright);line-height:1}
.sticky-info-sub{font-size:10.5px;color:rgba(255,255,255,0.72);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-top:3px}
.sticky-cta .btn{padding:12px 18px;font-size:13px;width:auto;flex-shrink:0}
@media(min-width:900px){.sticky-cta{display:none !important}}
.footer{background:#050505;color:rgba(255,255,255,0.7);padding:48px 0 110px;font-size:13px}
@media(min-width:900px){.footer{padding:48px 0}}
.footer-grid{display:grid;gap:28px}
@media(min-width:720px){.footer-grid{grid-template-columns:1.5fr 1fr 1fr}}
.footer h5{font-family:var(--font-body);font-weight:800;font-size:13px;color:white;margin-bottom:14px;letter-spacing:0.08em;text-transform:uppercase}
.footer a{color:rgba(255,255,255,0.6);text-decoration:none;display:block;padding:4px 0;transition:color 0.2s}
.footer a:hover{color:var(--orange-bright)}
.footer-bottom{margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;text-align:center;color:rgba(255,255,255,0.42)}
.showrooms-grid{display:grid;gap:20px;margin-top:24px}
@media(min-width:720px){.showrooms-grid{grid-template-columns:repeat(2,1fr)}}
.showroom-card{background:var(--white);border:1px solid var(--gray-100);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);transition:all 0.3s}
.showroom-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-md)}
.showroom-map{position:relative;aspect-ratio:16/9;background:var(--gray-100);overflow:hidden}
.showroom-map iframe{width:100%;height:100%;border:none;display:block}
.showroom-map-placeholder{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--gray-500);text-align:center;padding:20px;gap:8px}
.showroom-map-placeholder svg{width:48px;height:48px;color:var(--orange)}
.showroom-body{padding:24px}
.showroom-city{font-family:var(--font-display);font-weight:700;text-transform:uppercase;font-size:30px;color:var(--black);line-height:1.14;margin-bottom:4px}
.showroom-label{font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--orange);font-weight:800;margin-bottom:12px}
.showroom-info{display:flex;flex-direction:column;gap:10px;margin-bottom:18px}
.showroom-info-item{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;color:var(--gray-700);line-height:1.5}
.showroom-info-item svg{width:18px;height:18px;color:var(--orange);flex-shrink:0;margin-top:2px}
.showroom-info-item strong{color:var(--black);font-weight:700}
.showroom-actions{display:flex;gap:8px}
.showroom-btn{flex:1;padding:11px 14px;border-radius:var(--r-md);text-decoration:none;font-family:var(--font-body);font-weight:700;font-size:13px;text-align:center;border:none;cursor:pointer;letter-spacing:0.02em;transition:all 0.2s;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.showroom-btn.primary{background:var(--orange);color:white} .showroom-btn.primary:hover{background:var(--orange-deep)}
.showroom-btn.ghost{background:transparent;color:var(--orange);border:1.5px solid var(--orange)} .showroom-btn.ghost:hover{background:var(--cream)}
.showroom-btn svg{width:14px;height:14px}
.reveal{opacity:0;transform:translateY(20px);transition:opacity 0.7s,transform 0.7s}
.reveal.in{opacity:1;transform:translateY(0)}
.center{text-align:center}
.floatbtns{position:fixed;right:16px;bottom:18px;z-index:60;display:flex;flex-direction:column;gap:12px}
@media(max-width:900px){.floatbtns{bottom:84px;right:12px}}
.fbtn{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,0.3);transition:transform 0.2s}
.fbtn:hover{transform:scale(1.08)} .fbtn svg{width:28px;height:28px}
.fbtn-call{background:linear-gradient(135deg,var(--orange),var(--orange-deep));color:#fff;animation:fpulse 2s infinite}
.fbtn-mess{background:linear-gradient(135deg,#00B2FF,#006AFF);color:#fff}
@keyframes fpulse{0%,100%{box-shadow:0 6px 18px rgba(255,107,26,0.5)}50%{box-shadow:0 0 0 12px rgba(255,107,26,0)}}`;
}

/* ---------- PAGE SCRIPT (string-concat để tránh đụng template literal ngoài) ---------- */
function pageScript(runtimeJson) {
  return [
    "(function(){",
    "  var RT = " + runtimeJson + ";",
    "  var ro = new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');ro.unobserve(e.target);}});},{threshold:0.12,rootMargin:'0px 0px -40px 0px'});",
    "  document.querySelectorAll('.reveal').forEach(function(el){ro.observe(el);});",
    "  var sticky = document.getElementById('stickyCta');",
    "  if(sticky){ var shown=false; window.addEventListener('scroll', function(){ var h=(document.querySelector('.hero')||{}).offsetHeight||400; if(window.scrollY>h && !shown){sticky.classList.add('show');shown=true;} else if(window.scrollY<=h && shown){sticky.classList.remove('show');shown=false;} }); }",
    "  window.toggleGift = function(){ var r=document.querySelector('input[name=\"combo\"]:checked'); var gg=document.getElementById('giftGroup'); if(gg) gg.style.display=(r && r.getAttribute('data-nogift'))?'none':''; };",
    "  window.selectCombo = function(v){ var r=document.querySelector('input[name=\"combo\"][value=\"'+v+'\"]'); if(r) r.checked=true; toggleGift(); var f=document.getElementById('dat-hang'); if(f) f.scrollIntoView({behavior:'smooth'}); if(window.fbq) fbq('track','AddToCart',{content_name:v}); };",
    "  window.selectGift = function(g){ var r=document.querySelector('input[name=\"gift\"][value=\"'+g+'\"]'); if(r) r.checked=true; var c=document.querySelector('input[name=\"combo\"]:checked'); if(!c || c.getAttribute('data-nogift')){ var d=document.querySelector('input[name=\"combo\"]:not([data-nogift])'); if(d) d.checked=true; } toggleGift(); var f=document.getElementById('dat-hang'); if(f) f.scrollIntoView({behavior:'smooth'}); if(window.fbq) fbq('track','AddToCart',{content_name:'gift-'+g}); };",
    "  toggleGift();",
    "  var form = document.getElementById('leadForm');",
    "  var successBox = document.getElementById('formSuccess');",
    "  function showErr(field,on){ var i=form.querySelector('[name=\"'+field+'\"]'); var e=form.querySelector('.form-error[data-for=\"'+field+'\"]'); if(i) i.classList.toggle('error',on); if(e) e.classList.toggle('show',on); }",
    "  if(form){",
    "    form.querySelectorAll('input,select,textarea').forEach(function(el){ el.addEventListener('input',function(){showErr(el.name,false);}); el.addEventListener('change',function(){showErr(el.name,false);}); });",
    "    var ph=document.getElementById('phone'); if(ph) ph.addEventListener('input',function(e){e.target.value=e.target.value.replace(/\\D/g,'').slice(0,10);});",
    "    form.addEventListener('submit', function(e){",
    "      e.preventDefault();",
    "      var name=(form.name.value||'').trim(); var phone=(form.phone.value||'').trim(); var province=(form.province.value||'').trim();",
    "      var combo=(form.querySelector('input[name=\"combo\"]:checked')||{}).value||'';",
    "      var giftEl=form.querySelector('input[name=\"gift\"]:checked'); var comboEl=form.querySelector('input[name=\"combo\"]:checked');",
    "      var gift=(comboEl && comboEl.getAttribute('data-nogift'))?'':((giftEl||{}).value||'');",
    "      var note=(form.note.value||'').trim();",
    "      var ok=true;",
    "      if(!name||name.length<2){showErr('name',true);ok=false;}",
    "      if(!/^0\\d{9}$/.test(phone)){showErr('phone',true);ok=false;}",
    "      if(!province){showErr('province',true);ok=false;}",
    "      if(!ok){ var fe=form.querySelector('.error'); if(fe) fe.scrollIntoView({behavior:'smooth',block:'center'}); return; }",
    "      var btn=form.querySelector('button[type=submit]'); var old=btn.textContent; btn.disabled=true; btn.textContent='Đang gửi…';",
    "      var payload={ slug:RT.slug, name:name, phone:phone, province:province, combo:combo, gift:gift, note:note, staff:RT.staff, source:RT.source, url:location.href, referrer:document.referrer, timestamp:new Date().toISOString() };",
    "      fetch('/api/landing/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})",
    "        .then(function(r){return r.json().catch(function(){return {ok:r.ok};});})",
    "        .then(function(res){",
    "          if(window.fbq) fbq('track','Lead');",
    "          if(RT.thankUrl){ location.href=RT.thankUrl+'?combo='+encodeURIComponent(combo)+'&name='+encodeURIComponent(name); return; }",
    "          form.style.display='none'; if(successBox) successBox.classList.add('show');",
    "        })",
    "        .catch(function(){ form.style.display='none'; if(successBox) successBox.classList.add('show'); })",
    "        .finally(function(){ btn.disabled=false; btn.textContent=old; });",
    "    });",
    "  }",
    "})();",
  ].join("\n");
}

export function renderLanding(rawConfig) {
  const c = withDefaults(rawConfig);
  const t = c.theme;
  const img = makeImg(c.images, c.assetBase);

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

  const ogImage = img("hero") || img("product");
  const runtime = JSON.stringify({ staff: c.staff, source: c.source, thankUrl: c.thankUrl, slug: c.slug });

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="${esc(t.dark)}">
<title>${esc(c.title)}</title>
${c.description ? `<meta name="description" content="${esc(c.description)}">` : ""}
<meta name="format-detection" content="telephone=no">
<meta property="og:title" content="${esc(c.title)}">
${c.description ? `<meta property="og:description" content="${esc(c.description)}">` : ""}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${pixel}
<style>${css(t)}</style>
</head>
<body>
${renderTopbar(c, img)}
${renderAnnounce(c)}
${renderHero(c, img)}
${renderTrustbar(c)}
${renderPullQuote(c)}
${renderProblem(c, img)}
${renderSolution(c, img)}
${renderDesign(c, img)}
${renderApplications(c, img)}
${renderProof(c, img)}
${renderCompare(c)}
${renderSteps(c)}
${renderCombo(c, img)}
${renderForm(c, img)}
${renderSpecs(c)}
${renderShowroom(c)}
${renderFaq(c)}
${renderFooter(c, img)}
${renderSticky(c)}
${renderFloat(c)}
<script>${pageScript(runtime)}</script>
</body>
</html>`;
}
