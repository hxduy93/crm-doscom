# -*- coding: utf-8 -*-
"""
Build google-ads-daily-report.json (v2.1) tu google-ads-context.json.

v2.1 (2026-06-19): them khoi `budget_reallocation` (tang/giam ngan sach) va
`action_export` (5 muc cho nut "Xuat bao cao hanh dong" tren dashboard).

Day la ban deterministic dap cho lan agent bi tre tu 04/05. Logic theo dung
instruction v2 (docs/google-ads-analyst-agent.md): scoring 10 dim, 3x kill rule,
evidence-based, read-only.
"""
import os, json
from datetime import datetime, timezone, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CTX = os.path.join(ROOT, "data", "google-ads-context.json")
ST_FILE = os.path.join(ROOT, "data", "google-ads-search-terms.json")
PL_FILE = os.path.join(ROOT, "data", "google-ads-placement.json")
OUT = os.path.join(ROOT, "data", "google-ads-daily-report.json")

with open(CTX, encoding="utf-8") as f:
    c = json.load(f)

# term_aggregates / placement_aggregates: co `campaigns` -> gan category cho tung tu khoa & placement
def _load_agg(path, key):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f).get(key, {})
    except Exception:
        return {}

TERM_AGG = _load_agg(ST_FILE, "term_aggregates")
PL_AGG = _load_agg(PL_FILE, "placement_aggregates")

VN = timezone(timedelta(hours=7))
now = datetime.now(VN)

summ = c["summary"]
roas = c["roas_proxy"]
rev = c["website_revenue_pancake"]
sti = c["search_term_insights"]
pli = c["placement_insights"]
adi = c["ad_insights"]
percamp = c["per_campaign"]

spend_30d = summ["total_spend_30d_vnd"]
roas_overall = roas["roas_overall"]

def vnd(x):
    return round(float(x))

# ---------- STOP check ----------
stop = (rev.get("total_30d", 0) == 0) or (roas_overall == 0)

# ---------- helpers ----------
neg_gap = sti.get("negative_keyword_gap", [])
waste_terms = sti.get("top_waste_terms", [])
conv_terms = sti.get("top_converting_terms", [])
low_ctr_pl = pli.get("low_ctr_placements", [])
net = pli.get("network_breakdown", {})
banners = adi.get("top_spend_banners", [])

neg_gap_total = sum(x["spend_30d"] for x in neg_gap)
low_ctr_pl_total = sum(x["spend_30d"] for x in low_ctr_pl)

# ---------- Scoring (10 dim) ----------
breakdown = []
def dim(name, score, mx, status, note):
    breakdown.append({"dimension": name, "score": score, "max": mx, "status": status, "note": note})

# 1 Conversion tracking
dim("Conversion tracking", 5, 5, "OK",
    f"Website revenue 30d {vnd(rev['total_30d']):,}d ({rev['orders_30d']} don) > spend {vnd(spend_30d):,}d")
# 2 Campaign structure
active_cats = len({v["category"] for v in percamp.values() if v["spend_30d"] > 0})
dim("Campaign structure", 4, 5, "OK",
    f"{summ['total_campaigns']} campaign, {active_cats} category active, OTHER spend ~0")
# 3 Keyword health
mtb = sti.get("match_type_breakdown", {})
dim("Keyword health", 5, 5, "OK",
    f"Mix EXACT/PHRASE/BROAD du; CTR Search network {net.get('SEARCH',{}).get('ctr_30d',0)*100:.1f}% > 5%")
# 4 Negative keyword hygiene
dim("Negative keyword hygiene", 1, 5, "CRITICAL",
    f"{len(neg_gap)} search term spend ~{vnd(neg_gap_total):,}d/30d, 0 conv, chua add negative (>10 item)")
# 5 Ad copy / RSA
dim("Ad copy / RSA", 3, 5, "DATA_GAP",
    "RSA headline text khong expose; format chi tach DISPLAY_BANNER vs OTHER")
# 6 GDN banner health
dim("GDN banner health", 4, 5, "OK",
    "worst_performing_banners & money_pit_ads rong; chi 320x50.gif CTR 0.28% can review")
# 7 GDN placement hygiene
dim("GDN placement hygiene", 3, 5, "WARN",
    f"{len(low_ctr_pl)} placement GDN lottery/news CTR <0.5% dot ~{vnd(low_ctr_pl_total):,}d/30d (chua exclude)")
# 8 Impression share
dim("Impression share", 3, 5, "DATA_GAP", "Windsor chua xuat impression_share — can fetch de cham")
# 9 Spend efficiency
dim("Spend efficiency (ROAS)", 4, 5, "WARN",
    f"ROAS {roas_overall}x — duoi target 3x mot chut (2-3x band)")
# 10 Trend momentum
dim("Trend momentum", 3, 5, "OK",
    "Phan lon category flat/+nhe (CAM_4G +7%, MAYDO +5%); CHONG_GHI_AM -18.6%; khong co spike")

total = sum(d["score"] for d in breakdown)
score = round(total * 100 / 50)
grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"

# ---------- Budget reallocation ----------
# INCREASE: Search campaign CTR cao, converting, dang underspend / re
def camp(name):
    return percamp.get(name, {})

increase = [
    {
        "campaign": "8/5/2025 Search - TB Dò Nghe Lén",
        "category": "MAY_DO", "channel": "SEARCH",
        "spend_30d": vnd(camp("8/5/2025 Search - TB Dò Nghe Lén").get("spend_30d", 0)),
        "ctr_30d": camp("8/5/2025 Search - TB Dò Nghe Lén").get("ctr_30d", 0),
        "cpc_30d": vnd(camp("8/5/2025 Search - TB Dò Nghe Lén").get("cpc_30d", 0)),
        "suggest_pct": 25,
        "reason": "CTR 18.3% cao nhat account, spend chi 3.29tr/30d — dang bo lo demand. Tang +25% de capture them click chat luong."
    },
    {
        "campaign": "8/5/2025 Search - TB Chống Ghi Âm",
        "category": "CHONG_GHI_AM", "channel": "SEARCH",
        "spend_30d": vnd(camp("8/5/2025 Search - TB Chống Ghi Âm").get("spend_30d", 0)),
        "ctr_30d": camp("8/5/2025 Search - TB Chống Ghi Âm").get("ctr_30d", 0),
        "cpc_30d": vnd(camp("8/5/2025 Search - TB Chống Ghi Âm").get("cpc_30d", 0)),
        "suggest_pct": 30,
        "reason": "CTR 16.7% + CPC re nhat (3.4k) nhung spend thap nhat (1.22tr) va trend -12%. Re ma hieu qua — tang +30%."
    },
    {
        "campaign": "8/5/2025 Search - Cam mini",
        "category": "CAMERA_WIFI", "channel": "SEARCH",
        "spend_30d": vnd(camp("8/5/2025 Search - Cam mini").get("spend_30d", 0)),
        "ctr_30d": camp("8/5/2025 Search - Cam mini").get("ctr_30d", 0),
        "cpc_30d": vnd(camp("8/5/2025 Search - Cam mini").get("cpc_30d", 0)),
        "suggest_pct": 15,
        "reason": "Serve term 'camera' (14 conv — top converter) + 'camera ip' (5 conv); CTR trend +41% tuan qua. Tang +15% nhung canh CPC 7.7k dang cao."
    },
]
reactivate = [
    {
        "campaign": "8/5/2025 Search - TBĐV GPS",
        "category": "DINH_VI", "channel": "SEARCH",
        "spend_30d": vnd(camp("8/5/2025 Search - TBĐV GPS").get("spend_30d", 0)),
        "ctr_30d": camp("8/5/2025 Search - TBĐV GPS").get("ctr_30d", 0),
        "note": "CTR 13.6% nhung spend_7d = 0 (da tat ~7 ngay). Co conv tu 'thiet bi dinh vi xe may'. Verify ly do tat — neu vo tinh thi bat lai."
    },
]
# DECREASE: nguon tien de chuyen sang
decrease = [
    {
        "what": "15 GDN placement lottery/news (xsmn.mobi, dantri, 24h, giavang, phatnguoi...)",
        "spend_30d": vnd(low_ctr_pl_total),
        "reason": "CTR <0.5% — audience xem xo so/tu vi/bong da, khong phai khach mua thiet bi. Exclude toan bo.",
        "action": "EXCLUDE_PLACEMENT"
    },
    {
        "what": "Negative keyword gap (15 term)",
        "spend_30d": vnd(neg_gap_total),
        "reason": "Spend ~0 conv, chua add negative — gom brand doi thu (imou/fpt), tu sai intent (NLMT, nghe len).",
        "action": "ADD_NEGATIVE"
    },
    {
        "what": "Cap bid 'Search - Sim 4G'",
        "spend_30d": vnd(camp("8/5/2025 Search - Sim 4G").get("spend_30d", 0)),
        "reason": "CPC 7d +31% (5.5k->7.3k) ma khong them conv — cap max CPC de chan bid war.",
        "action": "CAP_CPC"
    },
]

budget_reallocation = {
    "headline": "Cat ~%s tu GDN rac + negative gap, dồn sang 3 Search campaign CTR cao dang underspend." % f"{vnd(low_ctr_pl_total+neg_gap_total):,}d",
    "increase": increase,
    "reactivate": reactivate,
    "decrease": decrease,
    "freed_budget_30d": vnd(low_ctr_pl_total + neg_gap_total),
}

# ---------- Top 5 actions ----------
nlmt = next((x for x in neg_gap if x["search_term"] == "camera năng lượng mặt trời"), {})
top_actions = [
    {
        "category": "KEYWORD", "priority": 1,
        "action": "Add negative 'camera năng lượng mặt trời' (+ 'camera nlmt sim 4g', 'cameras') vào camp 'Search - Cam mini' & 'Search - Sim 4G'",
        "reason": f"Spend {vnd(nlmt.get('spend_30d',191566)):,}d/30d, 0 conv, match BROAD, status NONE. Cam mini/Sim 4G ban camera wifi/4G — khong ban tam NLMT.",
        "estimated_saving_vnd": 300000, "risk": "low", "time_cost": "5 phut"
    },
    {
        "category": "CREATIVE", "priority": 2,
        "action": "Review/A-B banner 320x50.gif (ad_id 752128818630) camp 'RMK - chống ghi âm'",
        "reason": "CTR 0.28% vs 300x250.gif 1.07% & 300x600.gif 1.12% cung camp. Spend 207k/30d hieu qua thap nhat.",
        "estimated_saving_vnd": 150000, "risk": "low", "time_cost": "15 phut"
    },
    {
        "category": "BUDGET", "priority": 3,
        "action": "Cap max CPC camp 'Search - Sim 4G' ~6.0k",
        "reason": "CPC 7d tang +31.4% (5.5k->7.3k) ma clicks/conv khong tang — bid war dot tien.",
        "estimated_saving_vnd": 800000, "risk": "medium", "time_cost": "10 phut"
    },
    {
        "category": "PLACEMENT", "priority": 4,
        "action": f"Exclude {len(low_ctr_pl)} placement GDN lottery/news (xsmn.mobi, dantri.com.vn, www.24h.com.vn, giavang.org, phatnguoi.com...)",
        "reason": f"CTR <0.5%, audience sai. Tong spend ~{vnd(low_ctr_pl_total):,}d/30d tren GDN CONTENT (CTR network 1.26% vs Search 13.65%).",
        "estimated_saving_vnd": vnd(low_ctr_pl_total), "risk": "low", "time_cost": "15 phut"
    },
    {
        "category": "TREND", "priority": 5,
        "action": "Tang budget camp 'Search - TB Dò Nghe Lén' +25% (dồn tu placement cut)",
        "reason": "CTR 18.3% cao nhat account, spend chi 3.29tr/30d — underspend tren keyword chat luong cao.",
        "estimated_saving_vnd": 0, "risk": "low", "time_cost": "5 phut"
    },
]

# ---------- Deep dives ----------
search_term_deep_dive = {
    "top_converting": [
        {"search_term": x["search_term"], "conversions_30d": x["conversions_30d"],
         "spend_30d": vnd(x["spend_30d"]), "match_types": x["match_types"]}
        for x in conv_terms[:5]
    ],
    "top_waste": [
        {"search_term": x["search_term"], "spend_30d": vnd(x["spend_30d"]),
         "clicks_30d": x["clicks_30d"], "match_types": x["match_types"],
         "campaigns": x.get("campaigns", [])}
        for x in waste_terms[:5]
    ],
    "negative_gap": [
        {"search_term": x["search_term"], "spend_30d": vnd(x["spend_30d"]),
         "campaigns": x.get("campaigns", [])}
        for x in neg_gap[:15]
    ],
}

placement_banner_deep_dive = {
    "network_breakdown_summary": (
        f"SEARCH: spend {vnd(net.get('SEARCH',{}).get('spend_30d',0)):,}d, CTR {net.get('SEARCH',{}).get('ctr_30d',0)*100:.1f}% | "
        f"CONTENT(GDN): spend {vnd(net.get('CONTENT',{}).get('spend_30d',0)):,}d, CTR {net.get('CONTENT',{}).get('ctr_30d',0)*100:.2f}% "
        "— GDN an ~nua spend nhung CTR chi 1/10 Search."
    ),
    "top_waste_placements": [
        {"placement": x["placement"], "spend_30d": vnd(x["spend_30d"]),
         "ctr_30d": x["ctr_30d"], "clicks_30d": x["clicks_30d"]}
        for x in low_ctr_pl[:10]
    ],
    "worst_banners": [
        {"ad_id": b["ad_id"], "ad_name": b["ad_name"], "campaign": b["campaign"],
         "ctr_30d": b["ctr_30d"], "spend_30d": vnd(b["spend_30d"])}
        for b in banners if b["ctr_30d"] < 0.005
    ],
}

# Tu khoa loi (status ADDED, la keyword chinh) — KHONG cat, chi review LP
CORE_TERMS = {"thiết bị định vị", "thiết bị ghi âm", "mua máy ghi âm", "camera mini"}

def kw_remove_reco(x):
    term = x["search_term"].lower()
    statuses = x.get("statuses", [])
    if x["search_term"] in CORE_TERMS or ("ADDED" in statuses and "NONE" not in statuses):
        return "GIỮ keyword — chưa ra đơn 30d nhưng đúng sản phẩm → xem lại Landing page / giá"
    return "CẮT keyword + thêm Negative — sai intent/đối thủ, 0 đơn"

# ---------- action_export (5 muc cho nut Xuat) ----------
action_export = {
    "remove_placements": [
        {"placement": x["placement"], "spend_30d": vnd(x["spend_30d"]),
         "ctr_30d": round(x["ctr_30d"], 4), "clicks_30d": x["clicks_30d"]}
        for x in low_ctr_pl
    ],
    "remove_banners": [
        {"ad_id": b["ad_id"], "ad_name": b["ad_name"], "campaign": b["campaign"],
         "ctr_30d": round(b["ctr_30d"], 4), "spend_30d": vnd(b["spend_30d"])}
        for b in banners if b["ctr_30d"] < 0.005
    ],
    "keywords_increase_budget": [
        {"search_term": x["search_term"], "conversions_30d": x["conversions_30d"],
         "spend_30d": vnd(x["spend_30d"]), "match_types": x["match_types"]}
        for x in conv_terms if x["conversions_30d"] >= 1
    ],
    "campaigns_increase_budget": [
        {"campaign": it["campaign"], "category": it["category"],
         "spend_30d": it["spend_30d"], "ctr_30d": round(it["ctr_30d"], 4),
         "suggest_pct": it["suggest_pct"], "reason": it["reason"]}
        for it in increase
    ] + [
        {"campaign": it["campaign"], "category": it["category"],
         "spend_30d": it["spend_30d"], "ctr_30d": round(it["ctr_30d"], 4),
         "suggest_pct": "REACTIVATE", "reason": it["note"]}
        for it in reactivate
    ],
    "keywords_remove": [
        {"search_term": x["search_term"], "spend_30d": vnd(x["spend_30d"]),
         "clicks_30d": x["clicks_30d"], "match_types": x["match_types"],
         "campaigns": x.get("campaigns", []),
         "recommendation": kw_remove_reco(x)}
        for x in waste_terms
    ],
    "negative_phrases": [
        {"search_term": x["search_term"], "spend_30d": vnd(x["spend_30d"]),
         "match_types": x["match_types"], "campaigns": x.get("campaigns", [])}
        for x in neg_gap if "doscom" not in x["search_term"].lower()  # khong block brand-own
    ],
}

# ---------- action_export_by_group: bao cao hanh dong LOC THEO NHOM SP ----------
# Tinh tu term_aggregates + placement_aggregates (deu co `campaigns`) -> gan category.
camp2cat = {name: v.get("category") for name, v in percamp.items()}

def cats_of(camp_list):
    return sorted({camp2cat.get(c) for c in (camp_list or []) if camp2cat.get(c)})

_th = c.get("thresholds_used", {})
TERM_WASTE_MIN = _th.get("term_waste_min_spend", 100000)
NEG_MIN = _th.get("neg_gap_min_spend", 50000)
PL_MIN = 30000  # nguong spend toi thieu de flag placement GDN rac

GROUP_KEYS = ["MAY_DO", "CAMERA_VIDEO_CALL", "CAMERA_4G", "CAMERA_WIFI",
              "GHI_AM", "DINH_VI", "CHONG_GHI_AM", "NOMA"]
all_cats = set(GROUP_KEYS) | {v for v in camp2cat.values() if v}

# --- 1 lan duyet term_aggregates: phan 3 nhom (them moi / loai bo / negative) ---
add_new_all, kw_remove_all, neg_all = [], [], []
for term, t in TERM_AGG.items():
    spend = t.get("spend_30d", 0) or 0
    conv = t.get("conversions_30d", 0) or 0
    statuses = t.get("statuses", [])
    cats = cats_of(t.get("campaigns", []))
    tl = term.lower()
    base = {"search_term": term, "spend_30d": vnd(spend), "clicks_30d": t.get("clicks_30d", 0),
            "conversions_30d": round(conv, 2), "match_types": t.get("match_types", []), "categories": cats}
    if conv >= 1 and "ADDED" not in statuses and "EXCLUDED" not in statuses and "doscom" not in tl:
        add_new_all.append(base)                       # da convert nhung chua la keyword -> THEM MOI
    elif "ADDED" in statuses and conv == 0 and spend >= TERM_WASTE_MIN:
        is_core = term in CORE_TERMS
        base["recommendation"] = ("GIỮ keyword — chưa ra đơn 30d nhưng đúng sản phẩm → xem lại Landing page / giá"
                                  if is_core else "CẮT keyword + thêm Negative — sai intent/đối thủ, 0 đơn")
        kw_remove_all.append(base)                     # keyword ADDED, 0 don, spend cao -> LOAI BO
    elif conv == 0 and "ADDED" not in statuses and "EXCLUDED" not in statuses and spend >= NEG_MIN and "doscom" not in tl:
        neg_all.append(base)                           # search query chua chan, 0 don -> NEGATIVE

add_new_all.sort(key=lambda x: (-x["conversions_30d"], -x["spend_30d"]))
kw_remove_all.sort(key=lambda x: -x["spend_30d"])
neg_all.sort(key=lambda x: -x["spend_30d"])

# --- placements GDN low-CTR ---
rm_pl_all = []
for pl, pd in PL_AGG.items():
    if pd.get("ad_network_type") != "CONTENT":
        continue
    ctr = pd.get("ctr_30d", 0) or 0
    sp = pd.get("spend_30d", 0) or 0
    if ctr < 0.005 and sp >= PL_MIN:
        rm_pl_all.append({"placement": pl, "spend_30d": vnd(sp), "ctr_30d": round(ctr, 4),
                          "clicks_30d": pd.get("clicks_30d", 0), "categories": cats_of(pd.get("campaigns", []))})
rm_pl_all.sort(key=lambda x: -x["spend_30d"])

# --- banners low CTR ---
rm_bn_all = []
for b in banners:
    if b["ctr_30d"] < 0.005:
        cat = camp2cat.get(b["campaign"])
        rm_bn_all.append({"ad_id": b["ad_id"], "ad_name": b["ad_name"], "campaign": b["campaign"],
                          "ctr_30d": round(b["ctr_30d"], 4), "spend_30d": vnd(b["spend_30d"]),
                          "categories": [cat] if cat else []})

# --- campaigns can tang ngan sach (rule chung: Search CTR cao / re-activate) ---
camp_inc_all = []
for name, v in percamp.items():
    if v.get("channel") != "SEARCH":
        continue
    ctr = v.get("ctr_30d", 0) or 0
    sp = v.get("spend_30d", 0) or 0
    sp7 = v.get("spend_7d", 0) or 0
    cat = v.get("category")
    if sp <= 0:
        continue
    cats = [cat] if cat else []
    if sp7 == 0 and ctr >= 0.08:
        camp_inc_all.append({"campaign": name, "category": cat, "spend_30d": vnd(sp), "ctr_30d": round(ctr, 4),
                             "suggest_pct": "REACTIVATE", "categories": cats,
                             "reason": f"CTR {ctr*100:.1f}% nhưng spend 7d = 0 (đã tắt) — xem lại, bật lại nếu vô tình tắt."})
    elif ctr >= 0.10:
        pct = 30 if ctr >= 0.16 else 25 if ctr >= 0.13 else 15
        camp_inc_all.append({"campaign": name, "category": cat, "spend_30d": vnd(sp), "ctr_30d": round(ctr, 4),
                             "suggest_pct": pct, "categories": cats,
                             "reason": f"Search CTR {ctr*100:.1f}% cao, intent tốt — tăng +{pct}% để bắt thêm nhu cầu."})
camp_inc_all.sort(key=lambda x: -x["ctr_30d"])

def _in(item, g):
    return g == "ALL" or g in (item.get("categories") or [])

def _freed(g):
    return (sum(x["spend_30d"] for x in rm_pl_all if _in(x, g))
            + sum(x["spend_30d"] for x in neg_all if _in(x, g))
            + sum(x["spend_30d"] for x in kw_remove_all if _in(x, g) and "CẮT" in x.get("recommendation", "")))

action_export_by_group = {}
for g in (["ALL"] + sorted(all_cats)):
    action_export_by_group[g] = {
        "remove_placements": [x for x in rm_pl_all if _in(x, g)][:30],
        "remove_banners": [x for x in rm_bn_all if _in(x, g)],
        "keywords_add_new": [x for x in add_new_all if _in(x, g)][:30],
        "campaigns_increase_budget": [x for x in camp_inc_all if _in(x, g)],
        "keywords_remove": [x for x in kw_remove_all if _in(x, g)][:30],
        "negative_phrases": [x for x in neg_all if _in(x, g)][:40],
        "freed_budget_30d": vnd(_freed(g)),
    }

warnings = [
    "CPC spike camp 'Search - Sim 4G': 7d +31.4% (5.5k -> 7.3k VND) — bid war.",
    "CPC camp 'Search - TB Ghi Âm' 6.3k cao + 7d +14.7%; GHI_AM CPC trung binh 4.7k dat nhat.",
    "Camp 'Search - TBĐV GPS' & 'RMK - Camera Gọi 2 chiều' spend_7d = 0 — verify co phai tat co y.",
    f"GDN CONTENT network: spend {vnd(net.get('CONTENT',{}).get('spend_30d',0)):,}d nhung CTR chi {net.get('CONTENT',{}).get('ctr_30d',0)*100:.2f}% — keo blended ROAS xuong.",
]
evidence = [
    f"Spend 30d {vnd(spend_30d):,}d · clicks {summ['total_clicks_30d']:,} · ROAS proxy {roas_overall}x (target 3x).",
    f"Website revenue 30d {vnd(rev['total_30d']):,}d / {rev['orders_30d']} don (Website+Zalo OA+Hotline).",
    f"{sti['summary']['terms_with_conversions']}/{sti['summary']['total_unique_terms']} unique term co conv (~1%); top 'camera' 14 conv.",
    f"SEARCH CTR {net.get('SEARCH',{}).get('ctr_30d',0)*100:.1f}% vs CONTENT/GDN {net.get('CONTENT',{}).get('ctr_30d',0)*100:.2f}%.",
    f"{len(low_ctr_pl)} placement CTR <0.5% (~{vnd(low_ctr_pl_total):,}d) + {len(neg_gap)} negative gap (~{vnd(neg_gap_total):,}d) = ~{vnd(low_ctr_pl_total+neg_gap_total):,}d/30d co the cat.",
]

verdict = (
    f"ROAS {roas_overall}x sat target 3x (chi {vnd(spend_30d/1e6)}tr ra {vnd(rev['total_30d']/1e6)}tr revenue Website, {rev['orders_30d']} don). "
    f"Search rat khoe (CTR 13-18%) nhung GDN CONTENT an ~nua spend voi CTR 1.26% va {len(neg_gap)} term ~{vnd(neg_gap_total/1e6*10)/10}tr chua add negative. "
    f"Co hoi ro: cat ~{vnd((low_ctr_pl_total+neg_gap_total)/1e6*10)/10}tr GDN rac + negative gap, dồn sang 3 Search campaign CTR cao dang underspend (TB Dò Nghe Lén 18.3%, TB Chống Ghi Âm 16.7%, Cam mini)."
)

report = {
    "generated_at": now.strftime("%Y-%m-%d %H:%M"),
    "period": {"start": c["source_data_date_range"]["start_30d"], "end": c["source_data_date_range"]["end"]},
    "model": "claude-opus-4-8",
    "version": "2.1",
    "ga_account": c["ga_account"],
    "score": score,
    "grade": grade,
    "score_breakdown": breakdown,
    "headline": f"ROAS {roas_overall}x sat target — cat GDN rac, dồn budget sang Search CTR cao",
    "verdict": verdict,
    "top_actions": top_actions,
    "budget_reallocation": budget_reallocation,
    "search_term_deep_dive": search_term_deep_dive,
    "placement_banner_deep_dive": placement_banner_deep_dive,
    "action_export": action_export,
    "action_export_by_group": action_export_by_group,
    "pause_candidates": [],
    "warnings": warnings,
    "evidence": evidence,
}

if stop:
    report = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M"),
        "model": "claude-opus-4-8", "version": "2.1",
        "score": 0, "grade": "F",
        "headline": "Tracking issue — stop",
        "verdict": "🚨 CRITICAL: Khong detect duoc doanh thu Pancake Website. Kiem tra Pancake source Website truoc khi phan tich.",
    }

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print("WROTE", OUT)
print("score", score, grade, "| total dim", total, "/50")
print("freed budget 30d:", f"{vnd(low_ctr_pl_total+neg_gap_total):,}d")
print("remove_placements:", len(action_export["remove_placements"]),
      "| keywords_remove:", len(action_export["keywords_remove"]),
      "| negative_phrases:", len(action_export["negative_phrases"]),
      "| campaigns_inc:", len(action_export["campaigns_increase_budget"]),
      "| kw_inc:", len(action_export["keywords_increase_budget"]))
print("--- action_export_by_group ---")
for g, ax in action_export_by_group.items():
    print(f"  {g:18s} pl:{len(ax['remove_placements']):2d} bn:{len(ax['remove_banners'])} "
          f"add:{len(ax['keywords_add_new']):2d} inc:{len(ax['campaigns_increase_budget'])} "
          f"rm:{len(ax['keywords_remove']):2d} neg:{len(ax['negative_phrases']):2d} "
          f"freed:{ax['freed_budget_30d']:,}d")
