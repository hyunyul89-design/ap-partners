#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AP PARTNERS · 에이피파트너 — 정적 SEO 페이지 자동 생성기

`site/data/listings.json` 만 읽어서 아래 파일을 만듭니다.
  · site/brands/{slug}.html   브랜드별 랜딩 페이지 (브랜드가 늘면 자동으로 함께 생성)
  · site/brands/index.html    브랜드별 보기 색인
  · site/stores/{id}.html     점포별 상세 페이지 (ap-001.html ~)
  · site/stores/index.html    전체 점포 색인
  · site/sitemap.xml          메인 + 브랜드 + 점포 전체 URL
  · site/index.html 의 푸터 브랜드 링크 블록 (SEO:BRAND-LINKS 마커 사이)

원칙
  · 공개 데이터(listings.json)에 없는 값은 절대 만들지 않습니다.
  · 지점명·상세 주소·역명은 이 파일에도, 생성 결과에도 넣지 않습니다.
  · 지출(인건비·재료비·고정비·수수료 등)은 비공개 대상이므로 점포 페이지에 쓰지 않습니다.

사용:
    python3 site/scripts/build_seo_pages.py
    python3 site/scripts/build_seo_pages.py --check   # 생성 결과 검사만
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

BASE_URL = "https://apchangup.com"
PHONE = "010-2885-5553"
PHONE_TEL = "tel:010-2885-5553"
KAKAO = "hyunyul89"
MANAGER = "김현율 팀장"
REGISTER_NO = "M-019448"

SITE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = SITE_DIR / "data" / "listings.json"
BRANDS_DIR = SITE_DIR / "brands"
STORES_DIR = SITE_DIR / "stores"
SITEMAP_FILE = SITE_DIR / "sitemap.xml"
INDEX_FILE = SITE_DIR / "index.html"

# 브랜드 → 슬러그. 새 브랜드는 아래에 한 줄만 추가하면 됩니다.
BRAND_SLUGS = {
    "메가커피": "mega-coffee",
    "컴포즈커피": "compose-coffee",
    "우지커피": "wooji-coffee",
    "백억커피": "baekuk-coffee",
    "맘스터치&피자": "momstouch",
    "교촌치킨": "kyochon",
    "투썸플레이스": "twosome-place",
    "이디야커피": "ediya-coffee",
    "빽다방": "paikdabang",
    "할리스커피": "hollys",
    "커피빈": "coffeebean",
    "파스쿠찌": "pascucci",
    "공차": "gongcha",
    "배스킨라빈스": "baskin-robbins",
    "던킨도너츠": "dunkin",
    "뚜레쥬르": "tous-les-jours",
    "샐러디": "salady",
    "한솥도시락": "hansot",
    "본죽": "bonjuk",
    "명랑핫도그": "myeongrang",
}

# 지출(비공개) 성격이 드러나는 표현 — 점포 페이지 '특징'에서 제외
EXPENSE_TOKENS = [
    "인건비", "지출", "수수료", "재료비", "고정비", "잡비", "로열티", "관리비",
    "제세", "매출의", "시급", "보수", "세전", "비용으로", "배달비용",
]

CATEGORY_LABEL = {
    "카페": "카페",
    "디저트": "디저트",
    "음식점": "음식점",
    "패스트푸드": "패스트푸드",
    "치킨": "치킨",
}

FAVICON = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
    "%3Crect width='64' height='64' fill='%230F1E36'/%3E%3Ctext x='32' y='43' "
    "font-family='Helvetica,Arial' font-size='30' font-weight='700' fill='%23fff' "
    "text-anchor='middle'%3EAP%3C/text%3E%3Cpath d='M10 40 L54 26' stroke='%23C8A45D' "
    "stroke-width='4'/%3E%3C/svg%3E"
)


# ---------------------------------------------------------------- helpers
def esc(text) -> str:
    return html.escape(str(text if text is not None else ""), quote=True)


def fmt_manwon(value) -> str:
    """23000 → '2억 3,000만 원', 30000 → '3억 원', 9000 → '9,000만 원'"""
    v = int(value or 0)
    eok, man = divmod(v, 10000)
    if eok and man:
        return f"{eok}억 {man:,}만 원"
    if eok:
        return f"{eok}억 원"
    return f"{man:,}만 원"


def range_label(low, high) -> str:
    """최솟값과 최댓값이 같으면 하나만 표시합니다."""
    if int(low) == int(high):
        return fmt_manwon(low)
    return f"{fmt_manwon(low)} ~ {fmt_manwon(high)}"


def slug_for(brand: str) -> str:
    if brand in BRAND_SLUGS:
        return BRAND_SLUGS[brand]
    ascii_part = re.sub(r"[^a-z0-9]+", "-", brand.lower()).strip("-")
    if ascii_part:
        return ascii_part
    # 매핑이 없는 새 브랜드는 안정적인 대체 슬러그로 생성 (매핑 추가를 권장)
    import hashlib

    return "brand-" + hashlib.sha1(brand.encode("utf-8")).hexdigest()[:6]


def safe_points(listing: dict) -> list:
    out = []
    for point in listing.get("points") or []:
        if any(token in point for token in EXPENSE_TOKENS):
            continue
        if "상세 지출 내역과 실제 위치는" in point:
            continue
        out.append(point)
    return out


def area_short(area: str) -> str:
    return re.sub(r"^(서울|경기|인천|대전|충남|대구|부산|광주|울산|세종|강원|충북|전북|전남|경북|경남|제주)\s*", "", area or "")


def area_note_brief(note: str) -> str:
    parts = [p.strip() for p in str(note or "").split("·") if p.strip()]
    return " · ".join(parts[:2])


def unique(seq):
    seen, out = set(), []
    for item in seq:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def load_listings() -> list:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    items = [
        L for L in data.get("listings", [])
        if L.get("visible", True) and (L.get("status") in (None, "live", "sample", "real"))
    ]
    items.sort(key=lambda L: L.get("code", ""))
    return items


def group_by_brand(listings: list) -> dict:
    groups = {}
    for L in listings:
        groups.setdefault(L["brand"], []).append(L)
    return dict(sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])))


# ---------------------------------------------------------------- layout
def page_head(title: str, description: str, keywords: str, canonical: str,
              extra_ld: dict | None = None) -> str:
    ld = ""
    if extra_ld:
        ld = (
            '<script type="application/ld+json">\n'
            + json.dumps(extra_ld, ensure_ascii=False, indent=2)
            + "\n</script>\n"
        )
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}" />
<meta name="keywords" content="{esc(keywords)}" />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="{esc(canonical)}" />
<meta name="theme-color" content="#0F1F38" />
<meta name="application-name" content="AP파트너" />
<meta property="og:site_name" content="에이피파트너 AP PARTNERS" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:type" content="website" />
<meta property="og:title" content="{esc(title)}" />
<meta property="og:description" content="{esc(description)}" />
<meta property="og:url" content="{esc(canonical)}" />
<meta property="og:image" content="{BASE_URL}/assets/og-cover.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{esc(title)}" />
<meta name="twitter:description" content="{esc(description)}" />
<meta name="twitter:image" content="{BASE_URL}/assets/og-cover.png" />
<link rel="icon" href="{FAVICON}" />
<link rel="stylesheet" href="../styles.css" />
<link rel="stylesheet" href="../seo.css" />
{ld}</head>
<body>
<a class="skip-link" href="#main">본문으로 바로가기</a>

<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="../index.html" aria-label="에이피파트너 홈">
      <span class="logo-mark" aria-hidden="true">AP</span>
      <span class="brand-text">
        <strong>AP PARTNERS</strong>
        <em>에이피파트너</em>
      </span>
    </a>
    <nav class="main-nav" aria-label="주요 메뉴">
      <a href="../index.html#listings">점포 둘러보기</a>
      <a href="../brands/index.html">브랜드별 보기</a>
      <a href="../stores/index.html">전체 점포 색인</a>
      <a href="../index.html#process">진행 절차</a>
    </nav>
    <div class="header-actions">
      <a class="btn btn-navy" href="{PHONE_TEL}">{PHONE}</a>
    </div>
  </div>
</header>
"""


def page_foot(brand_links: list) -> str:
    chips = "".join(
        f'<a href="../brands/{esc(slug)}.html">{esc(brand)}</a>' for brand, slug in brand_links
    )
    return f"""
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <span class="logo-mark light" aria-hidden="true">AP</span>
      <div>
        <strong>AP PARTNERS · 에이피파트너</strong>
        <p>Your Successful Business Partner</p>
      </div>
    </div>
    <div class="footer-links">
      <a href="../index.html">홈</a>
      <a href="../brands/index.html">브랜드별 보기</a>
      <a href="../stores/index.html">전체 점포 색인</a>
      <a href="{PHONE_TEL}">{PHONE}</a>
    </div>
  </div>
  <div class="wrap footer-fine">
    <div class="sx-foot-brands">
      <span>브랜드별</span>{chips}
    </div>
    <p>에이피파트너 · {MANAGER} · {PHONE} · 카카오톡 {KAKAO} · 등록 {REGISTER_NO}</p>
    <p>등록된 점포 정보는 {MANAGER}이 현장 실사를 마친 뒤 점주 제시 자료를 기준으로 정리한 값이며, 인력 운영과 배달 비중에 따라 실제 수익은 달라질 수 있습니다. 지점명과 상세 위치, 항목별 지출은 점주 보호를 위해 공개하지 않고 상담 시 안내합니다.</p>
    <p>© 2026 AP PARTNERS. All rights reserved.</p>
  </div>
</footer>
</body>
</html>
"""


def crumbs(items: list) -> str:
    """items: [(label, href|None)] 마지막은 현재 페이지"""
    parts = []
    for i, (label, href) in enumerate(items):
        if href:
            parts.append(f'<a href="{esc(href)}">{esc(label)}</a>')
        else:
            parts.append(f'<span aria-current="page">{esc(label)}</span>')
        if i != len(items) - 1:
            parts.append('<span aria-hidden="true">›</span>')
    return '<nav class="sx-crumbs wrap" aria-label="현재 위치">' + "".join(parts) + "</nav>"


def contact_card(title: str, code: str | None) -> str:
    detail_link = (
        f'<a class="btn btn-gold" href="../?id={esc(code)}">사이트에서 상세 지출 보기</a>'
        if code else
        f'<a class="btn btn-gold" href="../index.html#listings">점포 둘러보기</a>'
    )
    return f"""
      <div class="sx-card">
        <p class="sx-card-eyebrow">CONSULTATION</p>
        <h2 class="sx-card-title">{esc(title)}</h2>
        <p class="sx-card-text">조건과 예산을 알려 주시면 맞는 매장부터 추려 드립니다. 항목별 지출 원자료와 정확한 위치는 상담에서 안내합니다.</p>
        <div class="sx-card-actions">
          {detail_link}
          <a class="btn btn-outline-navy" href="{PHONE_TEL}">전화 상담 {PHONE}</a>
        </div>
        <dl class="sx-card-facts">
          <div><dt>담당</dt><dd>{MANAGER}</dd></div>
          <div><dt>카카오톡</dt><dd>{KAKAO}</dd></div>
          <div><dt>등록</dt><dd>{REGISTER_NO}</dd></div>
        </dl>
      </div>
"""


# ---------------------------------------------------------------- store page
def build_store_page(L: dict, brand_links: list, siblings: list) -> str:
    code = L["code"]
    brand = L["brand"]
    area = L["area"]
    cost = L["initial_cost"]
    sales = L["monthly_sales"]
    profit = L["profit"]

    title = f"{brand} 양도양수·창업 · {area} {L['category']} (No. {code}) | 에이피파트너"
    description = (
        f"{area} {brand} {L['category']} 실사 매장. 초기 인수 비용 {cost['label']}, "
        f"{sales['label']}, 예상 순수익 {profit['label']}. "
        f"{L.get('store_spec', '')} 규모. 상세 지출과 정확한 위치는 상담에서 안내합니다."
    )
    keywords = ",".join(unique([
        f"{brand} 양도양수", f"{brand} 창업", f"{brand} {L['category']} 창업",
        f"{L['region']} {L['category']} 창업", f"{L['district']} {L['category']} 양도양수",
        f"{brand} 인수", code,
    ]))

    canonical = f"{BASE_URL}/stores/{code.lower()}.html"

    ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "에이피파트너", "item": BASE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": "브랜드별 보기", "item": f"{BASE_URL}/brands/index.html"},
            {"@type": "ListItem", "position": 3, "name": f"{brand} 양도양수", "item": f"{BASE_URL}/brands/{slug_for(brand)}.html"},
            {"@type": "ListItem", "position": 4, "name": f"No. {code} {area}", "item": canonical},
        ],
    }

    cost_rows = "".join(
        f"<div><dt>{esc(item['label'])}</dt><dd>{esc(item['value'])}</dd></div>"
        for item in cost.get("items", [])
    )

    points = safe_points(L)
    points_html = "".join(f"<li>{esc(p)}</li>" for p in points)
    if not points_html:
        points_html = f"<li>{esc(area_note_brief(L.get('area_note', '')))}</li>"

    kw_chips = "".join(f'<span class="sx-chip">{esc(k)}</span>' for k in L.get("keywords", []))

    same_brand = [S for S in siblings if S["id"] != L["id"]][:3]
    if same_brand:
        same_section = (
            f'<h2>같은 브랜드 다른 매장</h2>'
            f'<div class="sx-card-grid">{"".join(store_card(S) for S in same_brand)}</div>'
            f'<p class="sx-more"><a href="../brands/{esc(slug_for(brand))}.html">{esc(brand)} 매장 전체 보기 →</a></p>'
        )
    else:
        same_section = (
            '<h2>다른 브랜드 매장 둘러보기</h2>'
            f'<p class="sx-para">이 {esc(brand)} 매장은 현재 1곳만 등록되어 있습니다. 브랜드별 보기에서 다른 브랜드 매장과 비용·상권을 비교해 보세요.</p>'
            '<p class="sx-more"><a href="../brands/index.html">브랜드별 보기 →</a> · '
            '<a href="../stores/index.html">전체 점포 색인 →</a></p>'
        )

    html_out = page_head(title, description, keywords, canonical, ld)
    html_out += crumbs([
        ("홈", "../index.html"),
        ("브랜드별 보기", "../brands/index.html"),
        (f"{brand} 양도양수", f"../brands/{slug_for(brand)}.html"),
        (f"No. {code}", None),
    ])
    html_out += f"""
<main id="main">
  <section class="sx-hero">
    <div class="wrap">
      <p class="eyebrow light"><span class="eyebrow-line"></span>STORE DETAIL · NO. {esc(code)}</p>
      <h1>{esc(brand)} 양도양수 · {esc(L['category'])}<br /><em>{esc(area)}</em></h1>
      <p class="sx-lead">{esc(brand)}{(' · ' + esc(L['brand_note'])) if L.get('brand_note') else ''} 매장을 현장 실사한 뒤, 공개 가능한 수치만 정리했습니다. 인수 전에 확인할 항목과 상담 연결까지 한 페이지에 담았습니다.</p>
      <div class="sx-tags">
        <span>현장 실사 완료</span>
        <span>{esc(L['region'])} · {esc(L['category'])}</span>
        <span>{esc(L.get('store_spec', ''))}</span>
        <span>상세 위치 비공개</span>
      </div>
      <div class="sx-facts">
        <div class="sx-fact"><span>초기 인수 비용</span><b class="gold">{esc(cost['label'])}</b></div>
        <div class="sx-fact"><span>월 평균 매출</span><b>{esc(sales['label'].replace('월 평균 ', ''))}</b></div>
        <div class="sx-fact"><span>예상 순수익</span><b>{esc(profit['label'])}</b></div>
        <div class="sx-fact"><span>상권</span><b>{esc(area_short(area))}</b></div>
        <div class="sx-fact"><span>매장 규모</span><b>{esc(L.get('store_spec', '-'))}</b></div>
        <div class="sx-fact"><span>고유번호</span><b>No. {esc(code)}</b></div>
      </div>
    </div>
  </section>

  <div class="wrap sx-body">
    <div class="sx-main">
      <h2>초기 인수 비용 구성</h2>
      <dl class="sx-cost">
        {cost_rows}
        <div class="sx-cost-total"><dt>합계</dt><dd>{esc(cost['label'])}</dd></div>
      </dl>
      <p class="sx-note">표시 금액은 점주 제시 자료를 기준으로 정리한 값입니다. 협의 과정에서 달라질 수 있고, 프랜차이즈 본사 비용(교육비·가맹비 등)은 매장에 따라 별도일 수 있습니다.</p>

      <h2>매장 특징</h2>
      <ul class="sx-list">{points_html}</ul>
      <div class="sx-kw">{kw_chips}</div>

      <h2>상권과 규모</h2>
      <p class="sx-para">{esc(area)} · {esc(L.get('area_note', ''))}</p>

      <div class="sx-lock">
        <p class="sx-lock-badge">2단계 잠금</p>
        <h3>항목별 지출은 4항목 입력 후 열립니다</h3>
        <p>재료비·인건비·매장 고정비·기타잡비의 항목별 금액과 비율, 인력 운영 포인트는 메인 사이트에서 희망 업종·지역·예산·연락처를 한 번만 남기면 바로 확인하실 수 있습니다.</p>
        <div class="sx-lock-actions">
          <a class="btn btn-gold btn-lg" href="../?id={esc(code)}">상세 지출 보기 · No. {esc(code)}</a>
          <a class="btn btn-outline-navy btn-lg" href="{PHONE_TEL}">전화 상담</a>
        </div>
        <p class="sx-note">정확한 위치와 원자료는 점주 보호를 위해 상담에서 안내합니다.</p>
      </div>

      {same_section}
    </div>

    <aside class="sx-side">
      {contact_card(f'No. {code} 상담하기', code)}
    </aside>
  </div>
</main>
"""
    html_out += page_foot(brand_links)
    return html_out


# ---------------------------------------------------------------- cards
def store_card(L: dict) -> str:
    return f"""
        <a class="sx-store-card" href="../stores/{esc(L['id'].lower())}.html">
          <span class="sx-store-code">No. {esc(L['code'])}</span>
          <h3>{esc(L['brand'])} · {esc(area_short(L['area']))}</h3>
          <dl>
            <div><dt>초기 인수 비용</dt><dd>{esc(L['initial_cost']['label'])}</dd></div>
            <div><dt>월 평균 매출</dt><dd>{esc(L['monthly_sales']['label'].replace('월 평균 ', ''))}</dd></div>
            <div><dt>예상 순수익</dt><dd>{esc(L['profit']['label'])}</dd></div>
            <div><dt>규모</dt><dd>{esc((' · '.join(x for x in [L.get('store_floor', ''), (str(L.get('store_pyeong', '')) + '평') if L.get('store_pyeong') else ''] if x)) or L.get('store_spec', '-'))}</dd></div>
          </dl>
          <span class="sx-store-more">상세 보기 →</span>
        </a>"""


def brand_card(brand: str, items: list) -> str:
    costs = [L["initial_cost"]["total_manwon"] for L in items]
    areas = unique([L.get("district", "") for L in items])
    return f"""
        <a class="sx-brand-card" href="../brands/{esc(slug_for(brand))}.html">
          <span class="sx-store-code">{esc(items[0]['category'])} · {len(items)}곳</span>
          <h3>{esc(brand)} 양도양수</h3>
          <p>{esc(', '.join(areas[:4]))} 실사 매장</p>
          <dl>
            <div><dt>초기 인수 비용</dt><dd>{esc(range_label(min(costs), max(costs)))}</dd></div>
          </dl>
          <span class="sx-store-more">매장 보기 →</span>
        </a>"""


# ---------------------------------------------------------------- brand page
def build_brand_page(brand: str, items: list, brand_links: list) -> str:
    slug = slug_for(brand)
    n = len(items)
    costs = [L["initial_cost"]["total_manwon"] for L in items]
    sales = [L["monthly_sales"]["avg_manwon"] for L in items]
    profits = [L["profit"]["avg_manwon"] for L in items]
    regions = unique([L["region"] for L in items])
    districts = unique([L["district"] for L in items])
    categories = unique([L["category"] for L in items])
    note = items[0].get("brand_note", "")
    kw_all = unique([k for L in items for k in L.get("keywords", [])])

    title = f"{brand} 양도양수 창업 · 실사 매장 {n}곳 비용·매출 비교 | 에이피파트너"
    description = (
        f"{brand}{('(' + note + ')') if note else ''} 양도양수·창업 매장 {n}곳을 실사 수치로 비교합니다. "
        f"{', '.join(regions)} · 초기 인수 비용 {fmt_manwon(min(costs))}~{fmt_manwon(max(costs))}, "
        f"월 매출·예상 순수익 공개. 상세 지출은 상담에서 안내합니다."
    )
    keywords = ",".join(unique(
        [f"{brand} 양도양수", f"{brand} 창업", f"{brand} 창업비용", f"{brand} 인수",
         f"{brand} 매장", f"{brand} 프랜차이즈"]
        + [f"{d} {brand} 창업" for d in districts]
        + [f"{c} 창업" for c in categories]
    ))

    canonical = f"{BASE_URL}/brands/{slug}.html"

    ld = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": f"{brand} 양도양수 창업 실사 매장",
        "url": canonical,
        "numberOfItems": n,
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1,
             "name": f"No. {L['code']} {L['area']} {brand}",
             "url": f"{BASE_URL}/stores/{L['id'].lower()}.html"}
            for i, L in enumerate(items)
        ],
    }

    cards = "".join(store_card(L) for L in items)
    kw_chips = "".join(f'<span class="sx-chip">{esc(k)}</span>' for k in kw_all)

    vat = f'<p class="sx-lead">{esc(brand)}는 {esc(note)}입니다. ' if note else '<p class="sx-lead">'
    vat += (
        f"{esc(', '.join(regions))}에서 현장 실사를 마친 {esc(brand)} 매장 {n}곳의 초기 인수 비용·월 매출·예상 순수익을 "
        f"같은 기준으로 정리했습니다. 지점명과 상세 위치는 점주 보호를 위해 공개하지 않으며, 매장별 상세 지출은 상담에서 안내합니다.</p>"
    )

    other_brands = [(b, s) for b, s in brand_links if b != brand][:6]
    other_html = "".join(
        f'<a class="sx-chip" href="../brands/{esc(s)}.html">{esc(b)}</a>' for b, s in other_brands
    )

    html_out = page_head(title, description, keywords, canonical, ld)
    html_out += crumbs([("홈", "../index.html"), ("브랜드별 보기", "index.html"), (f"{brand} 양도양수", None)])
    html_out += f"""
<main id="main">
  <section class="sx-hero">
    <div class="wrap">
      <p class="eyebrow light"><span class="eyebrow-line"></span>BRAND · {esc(brand)}</p>
      <h1>{esc(brand)} 양도양수 창업<br /><em>실사 마친 매장 {n}곳</em></h1>
      {vat}
      <div class="sx-tags">
        <span>{esc(', '.join(categories))}</span>
        <span>{esc(', '.join(regions))}</span>
        <span>{n}곳 등록</span>
        <span>현장 실사 완료</span>
      </div>
      <div class="sx-facts">
        <div class="sx-fact"><span>등록 매장</span><b class="gold">{n}곳</b></div>
        <div class="sx-fact"><span>초기 인수 비용</span><b>{esc(range_label(min(costs), max(costs)))}</b></div>
        <div class="sx-fact"><span>월 평균 매출</span><b>{esc(range_label(min(sales), max(sales)))}</b></div>
      </div>
    </div>
  </section>

  <div class="wrap sx-body">
    <div class="sx-main">
      <h2>{esc(brand)} 매장 {n}곳 한눈에</h2>
      <div class="sx-card-grid">{cards}</div>

      <h2>{esc(brand)} 양도양수 창업, 무엇을 확인할까</h2>
      <ul class="sx-list">
        <li>초기 인수 비용이 <b>점포 예치금</b>과 <b>시설·영업권</b>으로 어떻게 나뉘는지 먼저 확인합니다. 같은 총액이라도 계약 기간과 시설 상태에 따라 부담이 달라집니다.</li>
        <li>월 매출은 최근 12개월 포스·카드 정산 자료로 대조합니다. 표시된 금액은 점주 제시 자료 기준입니다.</li>
        <li>예상 순수익은 {esc(range_label(min(profits), max(profits)))}으로, 인력 운영 방식과 배달 비중에 따라 달라지므로 실제 근무표와 함께 봐야 합니다.</li>
        <li>본사 가맹 승계 조건(재계약 시점, 교육·예치금, 위약 조건)을 서면으로 확인합니다.</li>
      </ul>

      <h2>{esc(brand)} 매장 검색 키워드</h2>
      <div class="sx-kw">{kw_chips}</div>

      <h2>다른 브랜드 매장</h2>
      <div class="sx-kw">{other_html}</div>
      <p class="sx-more"><a href="index.html">브랜드별 보기 전체 →</a> · <a href="../stores/index.html">전체 점포 색인 →</a></p>
    </div>

    <aside class="sx-side">
      {contact_card(f'{brand} 매장 상담', None)}
    </aside>
  </div>
</main>
"""
    html_out += page_foot(brand_links)
    return html_out


# ---------------------------------------------------------------- index pages
def build_brand_index(brand_links: list, groups: dict) -> str:
    title = "브랜드별 보기 · 메가커피·컴포즈·우지·교촌 양도양수 창업 | 에이피파트너"
    description = (
        "프랜차이즈 양도양수 창업 브랜드별 실사 매장 목록입니다. 메가커피·컴포즈커피·우지커피·백억커피·"
        "교촌치킨·맘스터치 등 브랜드별로 초기 인수 비용과 월 매출, 예상 순수익을 비교하세요."
    )
    keywords = ",".join(unique(
        [f"{b} 양도양수" for b in groups] + [f"{b} 창업" for b in groups]
        + ["프랜차이즈 양도양수", "카페 창업", "양도양수 창업"]
    ))
    canonical = f"{BASE_URL}/brands/index.html"
    cards = "".join(brand_card(b, items) for b, items in groups.items())
    ld = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "브랜드별 양도양수 창업 매장",
        "url": canonical,
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": f"{b} 양도양수",
             "url": f"{BASE_URL}/brands/{slug_for(b)}.html"}
            for i, b in enumerate(groups)
        ],
    }
    html_out = page_head(title, description, keywords, canonical, ld)
    html_out += crumbs([("홈", "../index.html"), ("브랜드별 보기", None)])
    html_out += f"""
<main id="main">
  <section class="sx-hero">
    <div class="wrap">
      <p class="eyebrow light"><span class="eyebrow-line"></span>BRANDS</p>
      <h1>브랜드별 양도양수 창업<br /><em>실사 마친 매장을 브랜드로</em></h1>
      <p class="sx-lead">메가커피·컴포즈커피·우지커피·백억커피·교촌치킨·맘스터치 등 브랜드별로 현장 실사를 마친 매장을 모았습니다. 브랜드마다 초기 인수 비용과 상권 구조가 달라, 같은 예산이라도 확인할 항목이 다릅니다.</p>
      <div class="sx-tags"><span>{len(groups)}개 브랜드</span><span>{sum(len(v) for v in groups.values())}곳 등록</span><span>현장 실사 완료</span></div>
    </div>
  </section>
  <div class="wrap sx-body sx-body-wide">
    <div class="sx-main">
      <h2>브랜드 목록</h2>
      <div class="sx-brand-grid">{cards}</div>
      <p class="sx-more"><a href="../stores/index.html">전체 점포 색인 →</a></p>
    </div>
    <aside class="sx-side">
      {contact_card('브랜드 상담', None)}
    </aside>
  </div>
</main>
"""
    html_out += page_foot(brand_links)
    return html_out


def build_store_index(groups: dict, brand_links: list) -> str:
    title = "전체 점포 색인 · 프랜차이즈 양도양수 창업 실사 매장 12곳 | 에이피파트너"
    description = (
        "현장 실사를 마친 프랜차이즈 양도양수 창업 매장 전체 목록입니다. 카페·디저트·치킨·패스트푸드 "
        "12곳의 초기 인수 비용, 월 매출, 예상 순수익, 상권, 규모를 고유번호(AP-001~)로 확인하세요."
    )
    keywords = ",".join(unique(
        ["전체 점포", "프랜차이즈 양도양수", "양도양수 창업", "카페 창업"]
        + [f"{b} 양도양수" for b in groups]
    ))
    canonical = f"{BASE_URL}/stores/index.html"

    sections = []
    for brand, items in groups.items():
        cards = "".join(store_card(L) for L in items)
        sections.append(
            f'<h2>{esc(brand)} <span class="sx-count">{len(items)}곳</span></h2>'
            f'<div class="sx-card-grid">{cards}</div>'
        )
    total = sum(len(v) for v in groups.values())
    ld = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "전체 점포 색인",
        "url": canonical,
        "numberOfItems": total,
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1,
             "name": f"No. {L['code']} {L['brand']} {L['area']}",
             "url": f"{BASE_URL}/stores/{L['id'].lower()}.html"}
            for i, L in enumerate([L for items in groups.values() for L in items])
        ],
    }
    html_out = page_head(title, description, keywords, canonical, ld)
    html_out += crumbs([("홈", "../index.html"), ("전체 점포 색인", None)])
    html_out += f"""
<main id="main">
  <section class="sx-hero">
    <div class="wrap">
      <p class="eyebrow light"><span class="eyebrow-line"></span>STORE INDEX</p>
      <h1>전체 점포 색인<br /><em>실사 마친 매장 {total}곳</em></h1>
      <p class="sx-lead">고유번호(No. AP-001~) 순서로 브랜드별 매장을 모았습니다. 각 매장 페이지에서 초기 인수 비용 구성, 월 매출, 예상 순수익, 상권과 규모를 확인하고 상담으로 이어질 수 있습니다.</p>
      <div class="sx-tags"><span>{total}곳</span><span>{len(groups)}개 브랜드</span><span>현장 실사 완료</span></div>
    </div>
  </section>
  <div class="wrap sx-body sx-body-wide">
    <div class="sx-main">
      {''.join(sections)}
      <p class="sx-more"><a href="../brands/index.html">브랜드별 보기 →</a></p>
    </div>
    <aside class="sx-side">
      {contact_card('전체 매장 상담', None)}
    </aside>
  </div>
</main>
"""
    html_out += page_foot(brand_links)
    return html_out


# ---------------------------------------------------------------- sitemap
def build_sitemap(groups: dict, updated_at: str) -> str:
    urls = [f"{BASE_URL}/"]
    urls.append(f"{BASE_URL}/brands/index.html")
    for brand in groups:
        urls.append(f"{BASE_URL}/brands/{slug_for(brand)}.html")
    urls.append(f"{BASE_URL}/stores/index.html")
    for items in groups.values():
        for L in items:
            urls.append(f"{BASE_URL}/stores/{L['id'].lower()}.html")

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url in urls:
        priority = "1.0" if url == f"{BASE_URL}/" else ("0.8" if "/brands/" in url else "0.7")
        changefreq = "weekly"
        lines += [
            "  <url>",
            f"    <loc>{esc(url)}</loc>",
            f"    <lastmod>{esc(updated_at)}</lastmod>",
            f"    <changefreq>{changefreq}</changefreq>",
            f"    <priority>{priority}</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- index footer block
START = "<!-- SEO:BRAND-LINKS:START -->"
END = "<!-- SEO:BRAND-LINKS:END -->"


def update_index_footer(brand_links: list) -> bool:
    if not INDEX_FILE.exists():
        return False
    source = INDEX_FILE.read_text(encoding="utf-8")
    if START not in source or END not in source:
        return False
    chips = "".join(
        f'<a href="brands/{esc(slug)}.html">{esc(brand)} 양도양수</a>' for brand, slug in brand_links
    )
    block = (
        f'{START}\n'
        f'    <p class="footer-seo-links">\n'
        f'      <a href="brands/index.html">브랜드별 보기</a>\n'
        f'      <a href="stores/index.html">전체 점포 색인</a>\n'
        f'      <span class="footer-seo-sep" aria-hidden="true">|</span>\n'
        f'      {chips}\n'
        f'    </p>\n'
        f'    {END}'
    )
    new_source = re.sub(
        re.escape(START) + r".*?" + re.escape(END), block, source, count=1, flags=re.S
    )
    if new_source != source:
        INDEX_FILE.write_text(new_source, encoding="utf-8")
        return True
    return False


# ---------------------------------------------------------------- main
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="생성 결과 검사만 수행")
    args = parser.parse_args()

    listings = load_listings()
    groups = group_by_brand(listings)
    brand_links = [(b, slug_for(b)) for b in groups]
    updated_at = json.loads(DATA_FILE.read_text(encoding="utf-8")).get("updated_at", "")

    missing = [b for b in groups if b not in BRAND_SLUGS]
    outputs = {}

    for brand, items in groups.items():
        outputs[BRANDS_DIR / f"{slug_for(brand)}.html"] = build_brand_page(brand, items, brand_links)
    outputs[BRANDS_DIR / "index.html"] = build_brand_index(brand_links, groups)
    outputs[STORES_DIR / "index.html"] = build_store_index(groups, brand_links)
    for items in groups.values():
        for L in items:
            outputs[STORES_DIR / f"{L['id'].lower()}.html"] = build_store_page(L, brand_links, items)
    outputs[SITEMAP_FILE] = build_sitemap(groups, updated_at)

    if args.check:
        stale = [str(p) for p, body in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != body]
        print(f"점포 {len(listings)}곳 · 브랜드 {len(groups)}개 · 페이지 {len(outputs)}개")
        print("최신 상태" if not stale else "다시 생성 필요:\n  " + "\n  ".join(stale))
        return 0 if not stale else 1

    for path, body in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
    if update_index_footer(brand_links):
        print("index.html 푸터 브랜드 링크 갱신")
    if missing:
        print("⚠ 슬러그 매핑이 없는 브랜드(대체 슬러그 사용): " + ", ".join(missing))
    print(f"생성 완료 — 점포 {len(listings)}곳 · 브랜드 {len(groups)}개 · 파일 {len(outputs) + 1}개")
    for path in sorted(outputs):
        print(f"  {path.relative_to(SITE_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
