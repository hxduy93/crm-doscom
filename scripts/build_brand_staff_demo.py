#!/usr/bin/env python3
"""Demo UI: Chi phí QC & Doanh thu theo Brand × Nhân sự + CIR. Nhúng data thật, mở trực tiếp.
Đọc data/brand-staff-matrix.json → <home>/brand-staff-demo.html
"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
SRC = os.path.normpath(os.path.join(HERE, "..", "data", "brand-staff-matrix.json"))
OUT = os.path.join(os.path.expanduser("~"), "brand-staff-demo.html")
payload = json.dumps(json.load(open(SRC, encoding="utf-8")), ensure_ascii=False)

HTML = r"""<!DOCTYPE html>
<html lang="vi" data-theme="light">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Demo — Chi phí &amp; Doanh thu theo Brand × Nhân sự</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
:root{--primary:#3257E6;--violet:#8B5CF6;--teal:#14B8A6;--green:#16A34A;--accent:#F59E0B;
--bg:#F5F7FB;--surface:#fff;--surface-2:#FBFCFE;--text:#111A2E;--text-2:#5A6478;--muted:#EEF2FA;--border:#E6ECF6;
--danger:#E5484D;--warn:#E08600;--radius:18px;--shadow-sm:0 1px 2px rgba(17,26,46,.04);
--shadow:0 6px 18px -8px rgba(50,87,230,.18),0 2px 6px -2px rgba(17,26,46,.06);--shadow-lg:0 22px 44px -22px rgba(50,87,230,.30);--font:'Nunito',system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased;
background-image:radial-gradient(1100px 460px at 100% -8%,rgba(91,141,239,.10),transparent 60%),radial-gradient(820px 400px at -8% 0%,rgba(139,92,246,.06),transparent 55%)}
.tnum{font-variant-numeric:tabular-nums lining-nums}
.wrap{max-width:1180px;margin:0 auto;padding:28px 28px 70px}
.demo-tag{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn);padding:5px 13px;border-radius:999px;margin-bottom:14px}
.hero h2{font-size:25px;font-weight:900;letter-spacing:-.6px;margin:0 0 4px}
.hero p{margin:0 0 22px;color:var(--text-2);font-size:13.5px}
.brandrow{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
.bcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.bcard::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px}
.bcard.noma::before{background:var(--violet)}.bcard.doscom::before{background:var(--teal)}
.bcard h3{margin:0 0 14px;font-size:16px;font-weight:900;display:flex;align-items:center;gap:9px}
.bdot{width:12px;height:12px;border-radius:50%}
.bgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.stat .k{font-size:11px;color:var(--text-2);font-weight:700}
.stat .v{font-size:19px;font-weight:900;letter-spacing:-.3px}
.cirbig{font-size:21px;font-weight:900}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;margin-bottom:16px}
.phead{padding:16px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.phead h3{margin:0;font-size:15.5px;font-weight:900}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.tbl th,.tbl td{padding:11px 14px;text-align:right;border-bottom:1px solid var(--border)}
.tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-2);font-weight:800;background:var(--surface-2)}
.tbl th.l,.tbl td.l{text-align:left}
.tbl td.l{font-weight:800}
.grp-noma{background:color-mix(in srgb,var(--violet) 6%,transparent)}
.grp-doscom{background:color-mix(in srgb,var(--teal) 6%,transparent)}
.tbl th.sep,.tbl td.sep{border-left:2px solid var(--border)}
.tbl tbody tr:hover{background:var(--muted)}
.tbl tfoot td{font-weight:900;background:var(--surface-2);border-top:2px solid var(--border)}
.cost{color:var(--danger);font-weight:800}
.rev{color:var(--green);font-weight:800}
.cir{font-weight:900}
.dash{color:var(--text-2)}
.note{background:color-mix(in srgb,var(--primary) 6%,var(--surface));border:1px solid color-mix(in srgb,var(--primary) 22%,var(--border));border-radius:14px;padding:13px 16px;font-size:12.6px;color:var(--text-2);line-height:1.6}
.note b{color:var(--text)}
/* Cơ chế tính */
.mech{display:grid;grid-template-columns:1fr 1fr;gap:0}
.mcol{padding:16px 18px}
.mcol+.mcol{border-left:1px solid var(--border)}
.mcol h4{margin:0 0 10px;font-size:13.5px;font-weight:900;display:flex;align-items:center;gap:8px}
.mcol h4 .pill{font-size:10px;font-weight:900;padding:3px 8px;border-radius:999px}
.pill.c{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}
.pill.r{background:color-mix(in srgb,var(--green) 14%,transparent);color:#15803D}
.step{display:flex;gap:10px;margin-bottom:11px}
.step .n{width:22px;height:22px;border-radius:7px;background:var(--muted);color:var(--text-2);font-weight:900;font-size:12px;display:grid;place-items:center;flex:none}
.step .tx{font-size:12.5px;color:var(--text-2);line-height:1.5}
.step .tx b{color:var(--text)}
.step code{background:var(--muted);padding:1px 6px;border-radius:5px;font-size:11.5px;font-family:ui-monospace,monospace;color:var(--primary)}
.foot-src{margin-top:12px;font-size:11.5px;color:var(--text-2)}
@media(max-width:820px){.mech{grid-template-columns:1fr}.mcol+.mcol{border-left:0;border-top:1px solid var(--border)}}
</style>
</head>
<body>
<div class="wrap">
  <span class="demo-tag">● BẢN DEMO — số liệu thật, chưa ghép vào dashboard</span>
  <div class="hero"><h2>Chi phí &amp; Doanh thu — Brand × Nhân sự</h2>
    <p>Tách <b>chi phí quảng cáo</b>, <b>doanh thu</b> và <b>CIR</b> theo Noma / Doscom và từng nhân sự · Doanh thu = <b>theo đơn đặt</b> · <b>CIR = Chi phí ÷ Doanh thu</b> (càng thấp càng tốt)</p></div>
  <div class="brandrow" id="brandrow"></div>
  <div class="panel">
    <div class="phead"><h3>Ma trận theo nhân sự</h3></div>
    <div style="overflow:auto">
    <table class="tbl">
      <thead>
        <tr><th class="l" rowspan="2">Nhân sự</th><th colspan="3" class="sep grp-noma">NOMA</th><th colspan="3" class="sep grp-doscom">DOSCOM</th></tr>
        <tr><th class="sep grp-noma">Chi phí QC</th><th class="grp-noma">Doanh thu</th><th class="grp-noma">CIR</th>
            <th class="sep grp-doscom">Chi phí QC</th><th class="grp-doscom">Doanh thu</th><th class="grp-doscom">CIR</th></tr>
      </thead>
      <tbody id="rows"></tbody>
      <tfoot id="foot"></tfoot>
    </table>
    </div>
  </div>

  <div class="panel">
    <div class="phead"><h3>⚙ Cơ chế tính — số này lấy từ đâu?</h3></div>
    <div class="mech">
      <div class="mcol">
        <h4><span class="pill c">CHI PHÍ</span> theo nhân sự</h4>
        <div class="step"><div class="n">1</div><div class="tx">Mỗi <b>tài khoản QC Facebook</b> đã khai sẵn chủ &amp; brand trong <code>fb-config.json</code>: <code>staff</code> (Duy / Phương Nam / AI) + <code>groups</code> (có "NOMA" → Noma, còn lại → Doscom).</div></div>
        <div class="step"><div class="n">2</div><div class="tx">Lấy spend <b>theo từng ngày</b> của mỗi campaign từ <code>fb-ads-data.json</code> (<code>campaigns[].by_date[].spend</code>) → cộng vào ô <b>(nhân sự × brand)</b> của tài khoản đó.</div></div>
        <div class="step"><div class="n">3</div><div class="tx">Tài khoản <b>906 (D1)</b> cho AI mượn từ <b>29/05</b>: spend trước mốc tính cho Phương Nam, từ mốc trở đi tính cho AI — tách theo ngày nên không lẫn.</div></div>
        <div class="step"><div class="n">4</div><div class="tx"><b>Google Ads</b> (<code>google-ads-spend.json</code>, <code>by_category</code>) → brand theo nhóm sản phẩm, gán vào nhân sự <b>"Website"</b>.</div></div>
      </div>
      <div class="mcol">
        <h4><span class="pill r">DOANH THU</span> theo nhân sự</h4>
        <div class="step"><div class="n">1</div><div class="tx">Pancake POS đã gom doanh thu theo <b>nguồn chốt đơn</b> trong <code>product-revenue.json</code> → <code>source_groups[nhân_sự]</code> (Duy, Phương Nam, Website, Zalo, Hotline, Page FB).</div></div>
        <div class="step"><div class="n">2</div><div class="tx">Trong mỗi nhân sự có sẵn <b>doanh thu theo từng sản phẩm</b> (<code>products</code> / <code>products_by_status.delivered</code>).</div></div>
        <div class="step"><div class="n">3</div><div class="tx">Phân mỗi sản phẩm về brand bằng <code>classify_sku()</code>: tên chứa Noma/chăm sóc xe → <b>Noma</b>, còn lại (D1, DA, DR, định vị…) → <b>Doscom</b>.</div></div>
        <div class="step"><div class="n">4</div><div class="tx">Cộng doanh thu <b>theo đơn ĐẶT</b> (booked, tính theo ngày đặt) vào ô (nhân sự × brand). Phủ ~100% đơn POS — không phụ thuộc nối campaign qua điện thoại.</div></div>
      </div>
    </div>
  </div>

  <div class="note" id="note"></div>
  <div class="foot-src" id="src"></div>
</div>
<script>
const D=__PAYLOAD__;
const M=D.matrix, TB=D.totals_by_brand;
const REV=c=>c.rev_booked;                          // "Doanh thu" = theo đơn ĐẶT (booked, mọi trạng thái)
const vnd=n=>!n?'<span class="dash">—</span>':(n>=1e9?(n/1e9).toFixed(2)+' tỷ':n>=1e6?(n/1e6).toFixed(1)+' tr':Math.round(n).toLocaleString('vi-VN'));
const cirVal=c=>REV(c)>0?c.cost/REV(c):(c.cost>0?Infinity:null);
const cirTxt=v=>v==null?'<span class="dash">—</span>':(v===Infinity?'∞':(v*100).toFixed(0)+'%');
const cirColor=v=>v==null?'':(v===Infinity||v>1?'var(--danger)':v<=.5?'var(--green)':'var(--warn)');

const bmeta={NOMA:['noma','Noma','var(--violet)'],DOSCOM:['doscom','Doscom','var(--teal)']};
document.getElementById('brandrow').innerHTML=['NOMA','DOSCOM'].map(b=>{
  const t=TB[b],m=bmeta[b],v=cirVal(t);
  return `<div class="bcard ${m[0]}"><h3><span class="bdot" style="background:${m[2]}"></span>${m[1]}</h3>
    <div class="bgrid">
      <div class="stat"><div class="k">Chi phí QC</div><div class="v cost tnum">${vnd(t.cost)}</div></div>
      <div class="stat"><div class="k">Doanh thu</div><div class="v rev tnum">${vnd(REV(t))}</div></div>
      <div class="stat"><div class="k">CIR</div><div class="v cirbig tnum" style="color:${cirColor(v)}">${cirTxt(v)}</div></div>
    </div></div>`;
}).join('');

const cells=c=>`<td class="sep cost tnum">${vnd(c.cost)}</td><td class="rev tnum">${vnd(REV(c))}</td><td class="cir tnum" style="color:${cirColor(cirVal(c))}">${cirTxt(cirVal(c))}</td>`;
document.getElementById('rows').innerHTML=D.staff_rows.map(s=>
  `<tr><td class="l">${s}</td>${cells(M[s].NOMA)}${cells(M[s].DOSCOM)}</tr>`).join('');
document.getElementById('foot').innerHTML=`<tr><td class="l">TỔNG</td>${cells(TB.NOMA)}${cells(TB.DOSCOM)}</tr>`;

document.getElementById('note').innerHTML=`<b>Đọc đúng CIR:</b> CIR = Chi phí QC ÷ Doanh thu — <b>càng thấp càng hiệu quả</b> (vd 60% = tiêu 60đ QC ra 100đ doanh thu). `+
  `Hàng <b>Zalo / Hotline / Page FB</b> có doanh thu nhưng không có chi phí QC riêng → CIR để trống (không phải thiếu số). `+
  `Đơn vị nhân sự hai vế khác nhau: chi phí = chủ tài khoản QC, doanh thu = nguồn chốt đơn.`;
document.getElementById('src').textContent='Nguồn: fb-ads-data.json + google-ads-spend.json + product-revenue.json + fb-config.json · tạo lúc '+(D.generated_at||'?');
</script>
</body>
</html>"""
html = HTML.replace("__PAYLOAD__", payload)
open(OUT, "w", encoding="utf-8").write(html)
print(f"[demo] -> {OUT} ({len(html):,} bytes)")
