#!/usr/bin/env python3
"""Sinh file demo UI dashboard 'Doanh số theo Campaign' — nhúng data thật, mở trực tiếp.
Đọc data/campaign-revenue.json, ghi ra <home>/campaign-dashboard-demo.html.
"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
SRC = os.path.normpath(os.path.join(HERE, "..", "data", "campaign-revenue.json"))
OUT = os.path.join(os.path.expanduser("~"), "campaign-dashboard-demo.html")

data = json.load(open(SRC, encoding="utf-8"))
payload = json.dumps(data, ensure_ascii=False)

HTML = r"""<!DOCTYPE html>
<html lang="vi" data-theme="light">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Demo — Doanh số theo Campaign</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
:root{--primary:#3257E6;--primary-700:#2440C4;--violet:#8B5CF6;--accent:#F59E0B;--green:#16A34A;--teal:#14B8A6;
--bg:#F5F7FB;--surface:#fff;--surface-2:#FBFCFE;--text:#111A2E;--text-2:#5A6478;--muted:#EEF2FA;--border:#E6ECF6;
--danger:#E5484D;--warn:#E08600;--radius:18px;--shadow-sm:0 1px 2px rgba(17,26,46,.04);
--shadow:0 6px 18px -8px rgba(50,87,230,.18),0 2px 6px -2px rgba(17,26,46,.06);
--shadow-lg:0 22px 44px -22px rgba(50,87,230,.30);--font:'Nunito',system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased;
background-image:radial-gradient(1100px 460px at 100% -8%,rgba(91,141,239,.10),transparent 60%),radial-gradient(820px 400px at -8% 0%,rgba(139,92,246,.06),transparent 55%)}
.tnum{font-variant-numeric:tabular-nums lining-nums}
.wrap{max-width:1320px;margin:0 auto;padding:28px 28px 70px}
.demo-tag{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn);padding:5px 13px;border-radius:999px;margin-bottom:14px}
.hero h2{font-size:25px;font-weight:900;letter-spacing:-.6px;margin:0 0 4px}
.hero p{margin:0 0 22px;color:var(--text-2);font-size:13.5px}
.hero b{color:var(--text)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:17px;box-shadow:var(--shadow);transition:.2s}
.kpi:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg)}
.kpi .ktop{display:flex;align-items:center;gap:10px;margin-bottom:11px}
.kpi .ktile{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;color:#fff;font-size:18px;font-weight:900}
.kpi .label{font-size:12px;color:var(--text-2);font-weight:700}
.kpi .val{font-size:23px;font-weight:900;letter-spacing:-.4px;margin:0}
.kpi .foot{font-size:11.5px;color:var(--text-2);margin-top:4px;font-weight:600}
.note{background:color-mix(in srgb,var(--primary) 6%,var(--surface));border:1px solid color-mix(in srgb,var(--primary) 22%,var(--border));border-radius:14px;padding:13px 16px;font-size:12.8px;color:var(--text-2);margin-bottom:18px;line-height:1.6}
.note b{color:var(--text)}
.brandrow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}
.bcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.bcard::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px}
.bcard.noma::before{background:var(--violet)}.bcard.doscom::before{background:var(--teal)}.bcard.unknown::before{background:#9AA6BE}
.bcard h4{margin:0 0 9px;font-size:13px;font-weight:900;display:flex;align-items:center;gap:8px}
.bdot{width:10px;height:10px;border-radius:50%}
.bcard .big{font-size:21px;font-weight:900;letter-spacing:-.3px}
.bcard .sub{font-size:11.8px;color:var(--text-2);font-weight:600;margin-top:3px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.phead{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.phead h3{margin:0;font-size:15.5px;font-weight:900}
.spacer{flex:1}
.chips{display:flex;gap:4px;background:var(--muted);padding:3px;border-radius:11px}
.chips button{border:0;background:none;font-family:var(--font);font-weight:800;font-size:12.3px;color:var(--text-2);padding:7px 13px;border-radius:8px;cursor:pointer;transition:.2s}
.chips button.on{background:var(--surface);color:var(--primary);box-shadow:var(--shadow-sm)}
.search{border:1px solid var(--border);background:var(--surface);border-radius:9px;padding:7px 11px;font-family:var(--font);font-size:12.5px;color:var(--text);font-weight:600;min-width:180px}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{position:sticky;top:0;background:var(--surface-2);text-align:right;padding:11px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-2);font-weight:800;border-bottom:1px solid var(--border);cursor:pointer;white-space:nowrap;user-select:none}
.tbl th.l,.tbl td.l{text-align:left}
.tbl th:hover{color:var(--primary)}
.tbl td{padding:11px 14px;text-align:right;border-bottom:1px solid var(--border);font-weight:700}
.tbl tbody tr:hover{background:var(--muted)}
.cname{font-weight:800;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:900;padding:3px 9px;border-radius:999px}
.tag.noma{background:color-mix(in srgb,var(--violet) 15%,transparent);color:#6D28D9}
.tag.doscom{background:color-mix(in srgb,var(--teal) 16%,transparent);color:#0F766E}
.tag.unknown{background:var(--muted);color:var(--text-2)}
.bar{height:6px;border-radius:4px;background:var(--muted);overflow:hidden;margin-top:5px;min-width:60px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--primary),var(--violet))}
.rate{font-weight:900}
.muted2{color:var(--text-2);font-weight:700}
.pend{color:var(--warn);font-weight:800;font-size:11.5px}
.play{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:800;text-decoration:none;padding:5px 10px;border-radius:8px;white-space:nowrap;transition:.15s}
.play.real{background:color-mix(in srgb,var(--green) 14%,transparent);color:#15803D}
.play.real:hover{background:var(--green);color:#fff}
.play.fb{background:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary)}
.play.fb:hover{background:var(--primary);color:#fff}
.foot-src{margin-top:14px;font-size:11.5px;color:var(--text-2)}
@media(max-width:820px){.kpis,.brandrow{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div class="wrap">
  <span class="demo-tag">● BẢN DEMO GIAO DIỆN — số liệu thật, chưa ghép vào dashboard</span>
  <div class="hero">
    <h2>Doanh số theo Campaign</h2>
    <p id="sub"></p>
  </div>
  <div class="kpis" id="kpis"></div>
  <div class="note" id="note"></div>
  <div class="brandrow" id="brandrow"></div>

  <div class="panel">
    <div class="phead">
      <h3>Bảng campaign</h3>
      <div class="spacer"></div>
      <input class="search" id="q" placeholder="Tìm campaign…"/>
      <div class="chips" id="chips">
        <button data-b="ALL" class="on">Tất cả</button>
        <button data-b="NOMA">Noma</button>
        <button data-b="DOSCOM">Doscom</button>
        <button data-b="UNKNOWN">Chưa gắn brand</button>
      </div>
    </div>
    <div style="overflow:auto;max-height:620px">
      <table class="tbl">
        <thead><tr>
          <th class="l" data-k="campaign">Campaign</th>
          <th class="l" data-k="brand">Brand</th>
          <th class="l">Bài QC</th>
          <th data-k="regs">Đăng ký</th>
          <th data-k="orders">Lên đơn</th>
          <th data-k="delivered">Đã giao</th>
          <th data-k="close_rate">Tỉ lệ chốt</th>
          <th data-k="revenue_booked">DS lên đơn</th>
          <th data-k="revenue_delivered">DS đã giao ▾</th>
          <th data-k="spend">Chi phí</th>
          <th data-k="roas">ROAS</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>
  <div class="foot-src" id="src"></div>
</div>
<script>
const D = __PAYLOAD__;
const fmtVnd = n => (n>=1e9? (n/1e9).toFixed(2)+' tỷ' : n>=1e6? (n/1e6).toFixed(1)+' tr' : Math.round(n).toLocaleString('vi-VN'));
const fmtFull = n => Math.round(n).toLocaleString('vi-VN')+' đ';
const fmtInt = n => (n||0).toLocaleString('vi-VN');
const pct = n => n==null? '—' : (n*100).toFixed(1)+'%';
const T = D.totals, BR = D.by_brand||{};

document.getElementById('sub').innerHTML =
  `Nối đơn POS về campaign qua số điện thoại · cửa sổ <b>${D.lookback_days||90} ngày</b> · mô hình <b>${D.model==='last_touch'?'last-touch':D.model}</b>`;

const kpis=[
  ['💰','Doanh số đã giao', fmtVnd(T.cod_matched? sumDeliv() : 0), `tổng đơn match: ${fmtVnd(T.cod_matched)}`],
  ['📦','Đơn đã giao', fmtInt(sumKey('delivered')), `${fmtInt(sumKey('orders'))} đơn lên đơn`],
  ['🔗','Độ phủ (nối được)', pct(T.coverage_orders), `${fmtInt(T.orders_matched)}/${fmtInt(T.orders_total)} đơn`],
  ['📣','Số campaign', fmtInt(T.campaigns), `${Object.keys(BR).length} nhóm brand`],
];
function sumKey(k){return (D.campaigns||[]).reduce((s,c)=>s+(c[k]||0),0)}
function sumDeliv(){return (D.campaigns||[]).reduce((s,c)=>s+(c.revenue_delivered||0),0)}
document.getElementById('kpis').innerHTML = kpis.map((k,i)=>{
  const colors=['var(--green)','var(--primary)','var(--violet)','var(--accent)'];
  return `<div class="kpi"><div class="ktop"><div class="ktile" style="background:${colors[i]}">${k[0]}</div><div class="label">${k[1]}</div></div><p class="val tnum">${k[2]}</p><div class="foot">${k[3]}</div></div>`;
}).join('');

document.getElementById('note').innerHTML =
  `<b>Đọc số sao cho đúng:</b> độ phủ ~${pct(T.coverage_orders)} đơn / ${pct(T.coverage_cod)} doanh số — phần còn lại là đơn từ hotline/zalo/organic hoặc ngoài cửa sổ ${D.lookback_days||90} ngày, không gắn được campaign. `+
  `Cột <b>Chi phí</b> & <b>ROAS</b> đang chờ ghép từ <b>Pipeboard MCP</b> (chưa bịa số). Khi landing chuyển sang Cloudflare, độ phủ sẽ lên ~95%+ vì bắt UTM ngay tại nguồn.`;

const brandMeta={NOMA:['noma','Noma','var(--violet)'],DOSCOM:['doscom','Doscom','var(--teal)'],UNKNOWN:['unknown','Chưa gắn brand','#9AA6BE']};
document.getElementById('brandrow').innerHTML = ['NOMA','DOSCOM','UNKNOWN'].filter(b=>BR[b]).map(b=>{
  const v=BR[b],m=brandMeta[b];
  return `<div class="bcard ${m[0]}"><h4><span class="bdot" style="background:${m[2]}"></span>${m[1]}</h4>
    <div class="big tnum">${fmtVnd(v.revenue_delivered)}</div>
    <div class="sub">${fmtInt(v.delivered)} đơn giao · ${fmtInt(v.regs)} đăng ký · ${fmtInt(v.campaigns)} campaign</div></div>`;
}).join('');

function adlink(c){
  const p=[];
  if(c.ad_link && c.link_is_post) p.push(`<a class="play real" href="${c.ad_link}" target="_blank" rel="noopener" title="Mở bài/video gốc (cần đăng nhập tài khoản FB business)">🎬 Bài gốc</a>`);
  if(c.manager_link) p.push(`<a class="play fb" href="${c.manager_link}" target="_blank" rel="noopener" title="Mở thẳng quảng cáo trong Trình quản lý QC">⚙ Ads Manager</a>`);
  if(p.length) return p.join(' ');
  if(/^\d{6,}$/.test(c.campaign||'')) return `<span class="muted2" style="font-size:11px">cần fetch creative</span>`;
  return `<span class="muted2">—</span>`;
}
let curBrand='ALL', sortK='revenue_delivered', sortDir=-1, q='';
const maxDeliv = Math.max(...D.campaigns.map(c=>c.revenue_delivered||0),1);
function render(){
  let rows = D.campaigns.filter(c=>(curBrand==='ALL'||c.brand===curBrand) && (!q || (c.campaign||'').toLowerCase().includes(q)));
  rows.sort((a,b)=>{const x=a[sortK],y=b[sortK];if(typeof x==='string')return (y||'').localeCompare(x||'')*-sortDir;return ((x||0)-(y||0))*sortDir});
  document.getElementById('rows').innerHTML = rows.map(c=>{
    const m=brandMeta[c.brand]||brandMeta.UNKNOWN;
    const w=Math.round((c.revenue_delivered||0)/maxDeliv*100);
    const numeric=/^\d{6,}$/.test(c.campaign||'');
    const title=c.ad_name || c.campaign || '(không tên)';
    return `<tr>
      <td class="l"><div class="cname" title="${(title).replace(/"/g,'')}">${title}</div>${numeric&&!c.ad_name?`<div class="muted2" style="font-size:10.5px">ad_id, chưa có tên — cần fetch creative</div>`:''}<div class="bar"><i style="width:${w}%"></i></div></td>
      <td class="l"><span class="tag ${m[0]}">${m[1]}</span></td>
      <td class="l">${adlink(c)}</td>
      <td class="tnum">${fmtInt(c.regs)}</td>
      <td class="tnum">${fmtInt(c.orders)}</td>
      <td class="tnum">${fmtInt(c.delivered)}</td>
      <td class="tnum rate" style="color:${c.close_rate>=.5?'var(--green)':c.close_rate>=.3?'var(--warn)':'var(--text-2)'}">${pct(c.close_rate)}</td>
      <td class="tnum muted2">${fmtVnd(c.revenue_booked)}</td>
      <td class="tnum" style="color:var(--green);font-weight:900">${fmtVnd(c.revenue_delivered)}</td>
      <td class="pend">chờ Pipeboard</td>
      <td class="pend">—</td>
    </tr>`;
  }).join('') || `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-2)">Không có campaign khớp.</td></tr>`;
}
document.getElementById('chips').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;curBrand=b.dataset.b;[...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b));render()});
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.toLowerCase().trim();render()});
document.querySelectorAll('th[data-k]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.k;if(sortK===k)sortDir*=-1;else{sortK=k;sortDir=-1}render()}));
document.getElementById('src').textContent='Nguồn: pancake-crm-contacts.json + product-revenue.json · tạo lúc '+(D.generated_at||'?');
render();
</script>
</body>
</html>"""

html = HTML.replace("__PAYLOAD__", payload)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(html)
print(f"[demo] -> {OUT} ({len(html):,} bytes)")
