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

# 페이지 구조(생성기·마크업)를 바꾼 날. sitemap lastmod·llms.txt 갱신일에 쓰고,
# 내용을 바꾸면 이 값을 직접 올립니다(매 실행일로 자동 변경하지 않아 --check 가 흔들리지 않습니다).
PAGE_UPDATED = "2026-11-27"
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
LLMS_FILE = SITE_DIR / "llms.txt"

# 브랜드 → 슬러그. 새 브랜드는 아래에 한 줄만 추가하면 됩니다.
BRAND_SLUGS = {
    "메가커피": "mega-coffee",
    "컴포즈커피": "compose-coffee",
    "우지커피": "wooji-coffee",
    "백억커피": "baekuk-coffee",
    "맘스터치&피자": "momstouch",
    "교촌치킨": "kyochon",
    "투썸플레이스": "twosome",
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

# ---------------------------------------------------------------- 브랜드 가이드
# 공개 점포가 아직 없는 주요 프랜차이즈.
# 허위 점포·수치를 만들지 않고, 브랜드별 실사 체크포인트와 비공개 입고 우선 알림만 안내합니다.
GUIDE_BRANDS = [
    {
        "slug": "baskinrobbins",
        "brand": "배스킨라빈스",
        "short": "배스킨",
        "category": "아이스크림·디저트",
        "note": "아이스크림과 아이스크림 케이크를 파는 디저트 전문점",
        "intro": "배스킨라빈스는 아이스크림과 아이스크림 케이크를 매장에서 판매하는 디저트 전문점입니다. 계절에 따라 매출 차이가 크고, 냉동 설비와 본사 인테리어 기준이 매장 운영을 좌우합니다.",
        "fit": "가족·학생 손님이 많은 동네 상권에서, 예약 주문까지 꼼꼼히 챙길 수 있는 분에게 맞습니다.",
        "checkpoints": [
            ("성수기·비수기 매출 차이", "아이스크림은 여름과 겨울 매출 차이가 큰 업종입니다. 최근 12개월 월별 매출 자료로 성수기와 비수기의 폭을 확인하고, 비수기에도 점포 사용료와 인건비를 견딜 수 있는지 계산합니다."),
            ("본사 인테리어·리뉴얼 주기", "아이스크림 진열 케이스와 매장 인테리어는 본사 기준이 정해져 있습니다. 다음 리뉴얼 시점과 비용 부담, 최근 케이스 교체 이력을 확인합니다."),
            ("냉동·냉장 설비와 전기료", "케이스와 냉동고가 하루 종일 돌아가 전기 사용량이 많습니다. 설비 연식과 수리 이력, 최근 전기·수도 요금 고지서를 확인합니다."),
            ("케이크 예약과 인력", "아이스크림 케이크는 예약 주문 비중이 있습니다. 예약을 누가 어떻게 처리하는지, 주말·저녁에 필요한 인력이 몇 명인지 실제 근무표로 확인합니다."),
        ],
        "faq": (
            "배스킨라빈스 매장 인수에서 가장 큰 변수는 무엇인가요?",
            "계절 매출 차이와 설비 상태입니다. 성수기 매출만 보고 결정하면 비수기 고정비를 놓치기 쉬우므로, 12개월 월별 매출과 전기료·시설 수리 이력을 함께 보는 것이 좋습니다.",
        ),
    },
    {
        "slug": "tenpercent",
        "brand": "텐퍼센트커피",
        "short": "텐퍼센트",
        "category": "저가·테이크아웃 카페",
        "note": "작은 평수에서 테이크아웃 중심으로 운영하는 저가 커피",
        "intro": "텐퍼센트커피는 소형 매장에서 테이크아웃 중심으로 운영하는 저가 커피 브랜드입니다. 객단가가 낮은 대신 회전이 빠르기 때문에, 점포 사용료와 유동 인구가 수익을 크게 가릅니다.",
        "fit": "혼자 또는 1~2명으로 짧게 운영하며 회전을 보는 쪽을 원하는 분에게 맞습니다.",
        "checkpoints": [
            ("평수와 제조 동선", "테이크아웃 중심이라 매장이 좁고 제조 동선이 짧습니다. 인수 후 키오스크·제빙기·그라인더 배치를 바꿀 수 있는지, 창고 공간이 있는지 확인합니다."),
            ("점포 사용료 비중", "저가 커피는 객단가가 낮아 점포 사용료가 수익을 크게 좌우합니다. 최근 12개월 고지서로 사용료·관리비·공과금을 확인하고 매출 대비 비중을 계산합니다."),
            ("유동 인구와 임차 조건", "역세권·대학가·오피스 상권은 시간대별 유동 차이가 큽니다. 평일·주말, 오전·점심·오후 매출을 나눠 보고 임차 계약 잔여 기간과 재계약 조건을 확인합니다."),
            ("1~2인 운영 구조", "점주가 직접 서는 것을 전제로 한 매장이 많습니다. 피크 시간에 몇 명이 필요한지, 매니저를 두면 인건비가 얼마인지 실제 근무표로 확인합니다."),
        ],
        "faq": (
            "텐퍼센트커피는 어떤 상권이 유리한가요?",
            "짧은 시간에 손님이 몰리는 역세권·대학가·오피스 상권이 일반적입니다. 다만 같은 상권이라도 층과 위치, 동선에 따라 차이가 커서 시간대별 매출 자료와 실제 유동을 함께 보는 것이 좋습니다.",
        ),
    },
    {
        "slug": "halmaebeer",
        "brand": "역전할머니맥주",
        "short": "역전할머니맥주",
        "category": "주점·호프",
        "note": "생맥주와 안주를 중심으로 늦은 시간까지 영업하는 호프 주점",
        "intro": "역전할머니맥주는 생맥주와 안주를 중심으로 운영하는 호프 주점 브랜드입니다. 주류 매출 비중이 크고 영업 시간이 늦어, 상권 특성과 영업 허가 형태를 먼저 확인해야 합니다.",
        "fit": "야간 영업과 손님 응대를 직접 챙길 수 있고, 주류 중심 운영을 이해하는 분에게 맞습니다.",
        "checkpoints": [
            ("영업 허가 형태와 주류 판매", "일반음식점인지 단란주점인지에 따라 주류 판매와 영업 시간 조건이 달라집니다. 허가 형태와 인수 시 승계되는지, 위반 이력이 없는지 확인합니다."),
            ("심야 상권과 민원 가능성", "늦은 시간까지 영업하는 구조라 심야 유동과 소음·민원 가능성을 함께 봅니다. 건물주와 이웃 상가의 관계, 영업 시간 제한 여부를 확인합니다."),
            ("주방·배기 설비", "안주 조리 주방의 배기·환기 상태와 조리 설비 연식을 확인합니다. 기름과 냄새 관리가 안 되면 민원으로 이어질 수 있습니다."),
            ("평일·주말, 학기 매출 차이", "대학가·번화가·주거 혼합 상권에 따라 손님층이 다릅니다. 최근 12개월 자료로 평일·주말, 학기·방학 매출 차이를 확인합니다."),
        ],
        "faq": (
            "역전할머니맥주 매장 인수에서 놓치기 쉬운 점은 무엇인가요?",
            "영업 허가 형태와 심야 영업에 따른 민원 가능성입니다. 매출 자료만 보면 보이지 않으므로, 허가증과 건물주·이웃과의 관계, 영업 시간 조건을 직접 확인하는 것이 좋습니다.",
        ),
    },
    {
        "slug": "paikdabang",
        "brand": "빽다방",
        "short": "빽다방",
        "category": "저가 카페",
        "note": "큰 용량 메뉴와 저렴한 가격이 특징인 생활형 카페",
        "intro": "빽다방은 큰 용량과 저렴한 가격을 앞세운 생활형 카페 브랜드입니다. 테이크아웃과 홀이 함께 있는 매장이 많아, 좌석 구성과 재료 보관 공간을 함께 봐야 합니다.",
        "fit": "동네 상권에서 가족·학생 손님을 상대하며, 큰 회전보다 꾸준한 단골을 원하는 분에게 맞습니다.",
        "checkpoints": [
            ("재료 보관 공간", "큰 용량 메뉴가 많아 냉장·냉동 보관 공간과 창고가 필요합니다. 매장 뒤 창고 크기와 냉장 설비 상태를 확인합니다."),
            ("홀과 테이크아웃 비중", "같은 브랜드라도 홀 손님과 포장 손님 비중이 다릅니다. 좌석 수, 홀 회전, 배달 여부를 최근 매출 자료로 확인합니다."),
            ("점포 사용료와 면적", "저가 브랜드는 점포 사용료 비중이 수익을 좌우합니다. 면적 대비 사용료가 적정한지 12개월 고지서로 확인합니다."),
            ("부가 메뉴 설비", "아이스크림·디저트를 함께 파는 매장은 전용 설비가 있습니다. 설비 연식과 수리 이력, 해당 메뉴 매출 비중을 확인합니다."),
        ],
        "faq": (
            "빽다방과 다른 저가 커피 브랜드는 무엇이 다른가요?",
            "메뉴 구성과 매장 형태가 브랜드마다 다릅니다. 같은 저가 커피라도 홀 비중, 부가 메뉴, 평수에 따라 필요한 인력과 점포 사용료 부담이 달라지므로, 인수할 매장의 실제 매출 구조를 기준으로 비교해야 합니다.",
        ),
    },
    {
        "slug": "ediya",
        "brand": "이디야커피",
        "short": "이디야",
        "category": "카페",
        "note": "동네 상권을 중심으로 매장이 많은 토종 커피 브랜드",
        "intro": "이디야커피는 동네 상권과 오피스 상권에 매장이 많은 커피 브랜드입니다. 브랜드 인지도가 있는 대신 가맹점이 많아, 같은 상권 안 경쟁과 본사 승계 조건을 함께 봐야 합니다.",
        "fit": "동네에서 안정적인 단골을 만들며 오래 운영할 매장을 찾는 분에게 맞습니다.",
        "checkpoints": [
            ("상권과 손님층", "동네 상권·오피스·학원가에 따라 손님층과 시간대 매출이 다릅니다. 최근 12개월 자료로 평일·주말, 시간대별 매출을 확인합니다."),
            ("본사 승계 조건", "가맹점이 많은 브랜드라 승계 심사와 교육 일정이 정해져 있습니다. 승계 절차, 교육 비용, 재계약 시점과 조건을 서면으로 확인합니다."),
            ("시설·집기 연식", "커피 머신·제빙기·쇼케이스의 연식과 수리 이력을 확인합니다. 시설·영업권 금액에 어떤 집기가 포함되는지도 목록으로 대조합니다."),
            ("점포 사용료와 관리비", "사용료·관리비·공과금을 고지서로 확인하고 매출 대비 비중을 계산합니다. 인수 후 인상 조건이 있는지도 확인합니다."),
        ],
        "faq": (
            "이디야커피 매장 인수 시 본사 승계는 어떻게 진행되나요?",
            "본사 심사와 교육을 거쳐 가맹 계약을 승계하는 절차가 일반적입니다. 필요한 서류와 일정, 비용은 본사 기준에 따라 달라지므로 후보 매장을 정한 뒤 본사에 직접 확인하는 것이 정확합니다.",
        ),
    },
    {
        "slug": "theventi",
        "brand": "더벤티",
        "short": "더벤티",
        "category": "저가·테이크아웃 카페",
        "note": "큰 용량과 빠른 회전을 앞세운 테이크아웃 커피",
        "intro": "더벤티는 큰 용량과 합리적인 가격을 앞세운 테이크아웃 중심 커피 브랜드입니다. 짧은 시간에 손님이 몰리는 상권에 맞춰져 있어, 유동 인구와 주문 처리 속도가 중요합니다.",
        "fit": "짧은 시간에 회전을 내는 운영을 선호하고, 시스템 중심으로 매장을 돌리고 싶은 분에게 맞습니다.",
        "checkpoints": [
            ("키오스크와 주문 시스템", "키오스크 도입 여부와 결제·주문 시스템을 그대로 인수할 수 있는지 확인합니다. 유지보수 비용과 본사 지원 범위도 함께 봅니다."),
            ("컵·재료 재고 공간", "큰 용량 메뉴 중심이라 컵과 재료 재고가 많습니다. 창고와 적재 공간, 발주 주기를 확인합니다."),
            ("시간대별 유동", "역세권·학원가·오피스 등 짧은 유동이 많은 상권에 맞습니다. 오전·점심·오후 매출을 나눠 보고 임차 계약 잔여 기간을 확인합니다."),
            ("점포 사용료 비중", "저가 브랜드는 사용료 비중이 수익을 가릅니다. 12개월 고지서로 사용료·관리비를 확인합니다."),
        ],
        "faq": (
            "더벤티 매장은 무인 운영이 가능한가요?",
            "키오스크와 주문 시스템 비중이 높은 브랜드지만, 제조와 마감은 사람이 해야 합니다. 실제 운영 인력과 근무표를 확인하고, 최소 인력으로 돌릴 수 있는 구조인지 점주에게 직접 물어보는 것이 정확합니다.",
        ),
    },
    {
        "slug": "banapresso",
        "brand": "바나프레소",
        "short": "바나프레소",
        "category": "저가·테이크아웃 카페",
        "note": "시그니처 바나나 음료로 알려진 테이크아웃 커피",
        "intro": "바나프레소는 바나나우유를 활용한 시그니처 음료로 알려진 테이크아웃 중심 커피 브랜드입니다. 소형 매장이 많아 평수와 동선, 시그니처 재료 관리가 수익을 가릅니다.",
        "fit": "작은 매장에서 빠르게 회전하는 운영을 원하고, 혼자 서는 시간이 많은 구조를 감당할 수 있는 분에게 맞습니다.",
        "checkpoints": [
            ("시그니처 재료 관리", "바나나우유 등 시그니처 재료는 유통기한과 공급 주기가 정해져 있습니다. 발주 단위와 폐기 기준, 남은 재료 처리 방식을 확인합니다."),
            ("소형 매장 동선", "테이크아웃 중심 소형 매장은 제조 동선이 짧아야 합니다. 설비 배치와 창고 공간, 인수 후 배치 변경 가능성을 확인합니다."),
            ("역세권·유동과 임차", "역세권·대학가 등 유동 중심 상권에 맞습니다. 시간대별 매출과 임차 계약 잔여 기간, 재계약 조건을 확인합니다."),
            ("점포 사용료와 관리비", "면적이 작아도 사용료 비중이 큰 경우가 있습니다. 12개월 고지서로 사용료·관리비·공과금을 확인합니다."),
        ],
        "faq": (
            "바나프레소 매장 인수 전에 무엇을 확인해야 하나요?",
            "시그니처 재료의 공급·폐기 기준과 실제 제조 동선입니다. 여기에 시간대별 매출과 임차 계약 잔여 기간을 더해 보면, 인수 후 운영이 무리 없는지 판단하기 쉽습니다.",
        ),
    },
    {
        "slug": "gongcha",
        "brand": "공차",
        "short": "공차",
        "category": "음료·티 카페",
        "note": "티와 버블티, 토핑을 중심으로 하는 음료 전문점",
        "intro": "공차는 티 베이스 음료와 버블티, 토핑을 중심으로 운영하는 음료 전문 브랜드입니다. 토핑 종류가 많고 계절 음료 비중이 커, 재고와 폐기 관리가 중요합니다.",
        "fit": "음료 제조와 재고 관리를 꼼꼼히 챙기고, 젊은 손님층을 상대하는 매장을 원하는 분에게 맞습니다.",
        "checkpoints": [
            ("토핑·재료 재고와 폐기", "토핑은 종류가 많고 유통기한이 짧습니다. 발주 주기와 폐기 기준, 재고를 얼마나 들고 운영하는지 확인합니다."),
            ("계절 매출 차이", "차가운 음료 비중이 커 여름과 겨울 매출 차이가 큽니다. 최근 12개월 월별 매출로 성수기·비수기 폭을 확인합니다."),
            ("홀 좌석과 제조 동선", "홀 비중이 있는 매장은 좌석 수와 제조 동선을 함께 봅니다. 포장·배달 비중도 매출 자료로 확인합니다."),
            ("위생·교육 기준", "음료 제조 위생과 직원 교육 기준이 정해져 있습니다. 인수 시 교육 이수 조건과 현재 직원의 교육 상태를 확인합니다."),
        ],
        "faq": (
            "공차 매장은 여름과 겨울 매출 차이가 큰가요?",
            "차가운 음료 중심이라 계절 차이가 있는 편입니다. 정확한 차이는 매장별로 다르므로 최근 12개월 월별 매출 자료와 겨울 음료 판매 비중을 함께 확인하는 것이 좋습니다.",
        ),
    },
    {
        "slug": "bhc",
        "brand": "BHC치킨",
        "short": "BHC",
        "category": "치킨",
        "note": "튀김 치킨과 시그니처 메뉴를 중심으로 하는 치킨 프랜차이즈",
        "intro": "BHC치킨은 튀김 치킨과 시그니처 메뉴를 중심으로 운영하는 치킨 프랜차이즈입니다. 주방 설비와 배달 비중, 저녁 피크 인력이 수익을 가릅니다.",
        "fit": "저녁과 주말 피크를 직접 챙길 수 있고, 배달과 홀을 함께 운영해 본 경험이 있거나 배우려는 분에게 맞습니다.",
        "checkpoints": [
            ("주방·배기·기름 관리", "튀김 주방은 후드와 배기 상태, 기름 교체 주기가 중요합니다. 설비 연식과 기름 처리 방식을 확인합니다."),
            ("배달과 홀 매출 비중", "배달 비중이 높으면 배달앱 수수료와 배달 동선이 수익에 영향을 줍니다. 최근 12개월 배달·홀 매출 비중을 확인합니다."),
            ("피크 인력과 근무표", "저녁 피크에 주방·홀 인력이 몇 명 필요한지 실제 근무표로 확인합니다. 점주 근무 시간과 매니저 인건비 구조도 함께 봅니다."),
            ("가맹 승계와 시설 기준", "본사 승계 심사, 재계약 시점, 인테리어·집기 기준을 서면으로 확인합니다."),
        ],
        "faq": (
            "BHC치킨 매장 인수 시 배달 수수료는 어떻게 확인하나요?",
            "최근 12개월 배달 정산 자료에서 배달 매출과 수수료를 함께 확인합니다. 배달 비중이 높은 매장은 수수료율과 배달 지역 범위가 수익에 큰 영향을 주므로, 정산서 원본을 요청하는 것이 정확합니다.",
        ),
    },
    {
        "slug": "bbq",
        "brand": "BBQ치킨",
        "short": "BBQ",
        "category": "치킨",
        "note": "대표 메뉴 중심으로 운영하는 치킨 프랜차이즈",
        "intro": "BBQ치킨은 대표 메뉴 중심으로 운영하는 치킨 프랜차이즈입니다. 배달 비중이 높은 매장이 많아 배달 구조와 주방 설비, 주거 상권 수요를 확인해야 합니다.",
        "fit": "배달 중심 운영을 이해하고, 저녁 피크에 주방을 직접 관리할 수 있는 분에게 맞습니다.",
        "checkpoints": [
            ("배달 구조와 배달앱", "배달 비중과 배달앱 수수료, 자체 배달 여부를 확인합니다. 배달 지역 범위와 평균 배달 시간도 수익에 영향을 줍니다."),
            ("주방 설비와 환기", "튀김 설비 연식과 배기 상태, 기름 관리 방식을 확인합니다. 설비 교체가 필요한 시점인지도 함께 봅니다."),
            ("주거 밀도와 경쟁", "아파트·주거 밀집 상권은 저녁·주말 수요가 큽니다. 반경 내 경쟁 매장 수와 시간대별 매출을 확인합니다."),
            ("가맹 승계와 시설 공사", "본사 승계·교육·재계약 조건과 인수 후 필요한 시설 공사 범위를 서면으로 확인합니다."),
        ],
        "faq": (
            "BBQ치킨 매장은 배달과 홀 중 어디를 봐야 하나요?",
            "매장별로 다릅니다. 최근 12개월 매출에서 배달과 홀 비중을 나눠 보고, 배달 수수료와 홀 좌석 회전을 각각 계산해 보는 것이 좋습니다.",
        ),
    },
    {
        "slug": "subway",
        "brand": "서브웨이",
        "short": "서브웨이",
        "category": "샌드위치·패스트푸드",
        "note": "주문 제조 방식의 샌드위치와 샐러드를 파는 패스트푸드 매장",
        "intro": "서브웨이는 손님 앞에서 샌드위치를 만들어 주는 방식의 패스트푸드 브랜드입니다. 신선 재료 관리와 직원 교육이 운영의 중심이고, 점심 수요가 있는 상권에 맞습니다.",
        "fit": "직원 교육과 위생 관리를 꾸준히 챙기고, 점심 시간대 회전을 운영해 본 분에게 맞습니다.",
        "checkpoints": [
            ("신선 재료 발주와 폐기", "야채와 빵은 유통기한이 짧아 발주 주기와 폐기 기준이 수익에 직결됩니다. 냉장·작업대 설비와 실제 폐기 수량을 확인합니다."),
            ("직원 교육과 위생", "제조가 직원 손에 달려 있어 교육과 위생 관리가 중요합니다. 현재 근무 인력과 교육 이수 상태, 이직 빈도를 확인합니다."),
            ("점심 수요 상권", "오피스·학원가·병원 등 점심 수요가 있는 상권에 맞습니다. 평일 점심 시간대 매출 비중과 주말 매출을 확인합니다."),
            ("본사 승계와 리뉴얼", "본사 승계 심사, 인테리어 기준과 다음 리뉴얼 시점을 확인합니다. 시설·영업권에 포함되는 집기 목록도 대조합니다."),
        ],
        "faq": (
            "서브웨이 매장 인수 시 가장 중요한 것은 무엇인가요?",
            "신선 재료 관리와 직원 운영입니다. 폐기 수량과 발주 주기, 근무 인력의 교육 상태를 확인하면 인수 후 운영이 무리 없이 이어질지 판단하기 쉽습니다.",
        ),
    },
]

GUIDE_BY_SLUG = {B["slug"]: B for B in GUIDE_BRANDS}

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

# 공식 채널 (푸터) — 새 탭으로 열립니다.
CHANNELS = [
    ("블로그 · 에이피파트너", "https://blog.naver.com/hyunyul89"),
    ("블로그 · 창업의 법칙", "https://blog.naver.com/kdh5117654"),
    ("인스타그램", "https://www.instagram.com/ap_artners/"),
    ("스레드", "https://www.threads.com/@ap_artners"),
]


def channel_links(indent: str = "    ") -> str:
    chips = "\n".join(
        f'{indent}  <a href="{esc(url)}" target="_blank" rel="noopener noreferrer">{esc(label)}'
        f' <span aria-hidden="true">↗</span></a>'
        for label, url in CHANNELS
    )
    return (
        f'{indent}<div class="footer-channels" aria-label="공식 채널">\n'
        f'{indent}  <span>공식 채널</span>\n'
        f'{chips}\n'
        f'{indent}</div>'
    )


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
              extra_ld: dict | list | None = None) -> str:
    ld = ""
    if extra_ld:
        blocks = extra_ld if isinstance(extra_ld, list) else [extra_ld]
        ld = "".join(
            '<script type="application/ld+json">\n'
            + json.dumps(block, ensure_ascii=False, indent=2)
            + "\n</script>\n"
            for block in blocks
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
{channel_links()}
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


# ---------------------------------------------------------------- brand FAQ
def brand_faqs(brand: str, items: list) -> list:
    """공개 점포가 있는 브랜드 페이지의 질문·답변.

    listings.json 에 있는 값(비용·매출 범위, 지역)만 인용하고,
    가맹비·로열티 같은 확인되지 않은 수치는 쓰지 않습니다.
    """
    n = len(items)
    costs = [L["initial_cost"]["total_manwon"] for L in items]
    sales = [L["monthly_sales"]["avg_manwon"] for L in items]
    districts = unique([L.get("district", "") for L in items])
    return [
        (f"{brand} 양도양수 비용은 얼마인가요?",
         f"지금 공개된 {brand} 매장은 {n}곳이고, 초기 인수 비용은 {range_label(min(costs), max(costs))}입니다. "
         f"비용은 점포 예치금과 시설·영업권으로 나뉘고, 같은 브랜드라도 평수·상권·시설 상태에 따라 달라집니다. "
         f"매장별 구성은 각 점포 상세 페이지의 '초기 인수 비용 구성'에서 확인할 수 있습니다."),
        (f"{brand} 매장은 어느 지역에 있나요?",
         f"{', '.join(districts)}에서 현장 실사를 마친 {brand} 매장을 등록해 두었습니다. "
         f"지점명과 상세 위치는 점주 보호를 위해 공개하지 않고 상담에서 안내합니다."),
        (f"{brand} 매장의 월 매출과 예상 순수익은 어떻게 확인하나요?",
         f"표시된 월 평균 매출 {range_label(min(sales), max(sales))}과 예상 순수익은 점주 제시 자료를 기준으로 정리한 값입니다. "
         f"상담에서 최근 12개월 포스·카드 정산 자료와 실제 근무표를 함께 대조하고, "
         f"항목별 지출은 사이트에서 희망 조건을 한 번 남기면 바로 확인할 수 있습니다."),
        (f"{brand} 가맹 승계는 어떤 순서로 진행되나요?",
         "후보 매장을 정한 뒤 본사 승계 심사와 교육 일정을 확인하고, 재계약 시점·교육 비용·시설 기준을 서면으로 받아 진행합니다. "
         "필요한 서류와 일정은 본사 기준에 따라 다르므로, 매장을 정한 뒤 본사에 직접 확인하는 것이 정확합니다."),
    ]


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
          <div class="sx-brand-tags">
            <span class="sx-store-code">{esc(items[0]['category'])}</span>
            <span class="sx-badge sx-badge-open">공개 {len(items)}곳</span>
          </div>
          <h3>{esc(brand)} 양도양수</h3>
          <p>{esc(', '.join(areas[:4]))} 실사 매장</p>
          <dl>
            <div><dt>초기 인수 비용</dt><dd>{esc(range_label(min(costs), max(costs)))}</dd></div>
          </dl>
          <span class="sx-store-more">매장 보기 →</span>
        </a>"""


def guide_card(B: dict) -> str:
    return f"""
        <a class="sx-brand-card" href="../brands/{esc(B['slug'])}.html">
          <div class="sx-brand-tags">
            <span class="sx-store-code">{esc(B['category'])}</span>
            <span class="sx-badge sx-badge-alert">비공개 · 우선 알림</span>
          </div>
          <h3>{esc(B['brand'])} 양도양수 가이드</h3>
          <p>{esc(B['note'])}</p>
          <dl>
            <div><dt>공개 점포</dt><dd>0곳</dd></div>
            <div><dt>비공개 입고</dt><dd>우선 알림</dd></div>
          </dl>
          <span class="sx-store-more">가이드 보기 →</span>
        </a>"""


# ---------------------------------------------------------------- brand page
def build_brand_page(brand: str, items: list, store_links: list) -> str:
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

    faqs = brand_faqs(brand, items)

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
    ld_faq = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in faqs
        ],
    }
    ld_crumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "에이피파트너", "item": BASE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": "브랜드별 보기", "item": f"{BASE_URL}/brands/index.html"},
            {"@type": "ListItem", "position": 3, "name": f"{brand} 양도양수", "item": canonical},
        ],
    }

    faq_html = "".join(
        f'<div class="sx-faq-item"><h3>{esc(q)}</h3><p>{esc(a)}</p></div>' for q, a in faqs
    )

    cards = "".join(store_card(L) for L in items)
    kw_chips = "".join(f'<span class="sx-chip">{esc(k)}</span>' for k in kw_all)

    vat = f'<p class="sx-lead">{esc(brand)}는 {esc(note)}입니다. ' if note else '<p class="sx-lead">'
    vat += (
        f"{esc(', '.join(regions))}에서 현장 실사를 마친 {esc(brand)} 매장 {n}곳의 초기 인수 비용·월 매출·예상 순수익을 "
        f"같은 기준으로 정리했습니다. 지점명과 상세 위치는 점주 보호를 위해 공개하지 않으며, 매장별 상세 지출은 상담에서 안내합니다.</p>"
    )

    other_brands = [(b, s) for b, s in store_links if b != brand][:6]
    other_html = "".join(
        f'<a class="sx-chip" href="../brands/{esc(s)}.html">{esc(b)} 양도양수</a>' for b, s in other_brands
    )
    guide_html = "".join(
        f'<a class="sx-chip" href="../brands/{esc(B["slug"])}.html">{esc(B["brand"])} 가이드</a>'
        for B in GUIDE_BRANDS
    )

    html_out = page_head(title, description, keywords, canonical, [ld, ld_faq, ld_crumb])
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

      <h2>자주 묻는 질문</h2>
      <div class="sx-faq">{faq_html}</div>

      <h2>{esc(brand)} 매장 검색 키워드</h2>
      <div class="sx-kw">{kw_chips}</div>

      <h2>다른 브랜드 매장</h2>
      <div class="sx-kw">{other_html}</div>

      <h2>공개 점포가 없는 브랜드 가이드</h2>
      <p class="sx-para">아래 브랜드는 지금 공개된 점포가 없어, 인수 전 실사 체크포인트와 비공개 입고 우선 알림만 안내합니다.</p>
      <div class="sx-kw">{guide_html}</div>
      <p class="sx-more"><a href="index.html">브랜드별 보기 전체 →</a> · <a href="../stores/index.html">전체 점포 색인 →</a></p>
    </div>

    <aside class="sx-side">
      {contact_card(f'{brand} 매장 상담', None)}
    </aside>
  </div>
</main>
"""
    html_out += page_foot(store_links + [(B["brand"], B["slug"]) for B in GUIDE_BRANDS])
    return html_out


# ---------------------------------------------------------------- guide page
def guide_keywords(B: dict) -> list:
    brand = B["brand"]
    short = B.get("short") or brand
    return unique([
        f"{brand} 양도양수", f"{brand} 창업", f"{brand} 인수", f"{brand} 매물",
        f"{brand} 점포", f"{brand} 창업비용", f"{brand} 가맹", f"{brand} 양도",
        f"{short} 창업", f"{short} 양도양수", f"{B['category'].replace('·', ' ')} 창업",
    ])


def guide_faqs(B: dict) -> list:
    brand = B["brand"]
    first_head, first_body = B["checkpoints"][0]
    return [
        (f"현재 {brand} 공개 매물이 있나요?",
         f"지금 에이피파트너에 공개된 {brand} 점포는 0곳입니다. 없는 매물을 있는 것처럼 올리지 않습니다. "
         f"희망 조건을 남겨 주시면 비공개로 들어오는 {brand} 점포와 신규 입고 소식을 먼저 알려 드립니다."),
        (f"{brand} 양도양수는 어떤 순서로 진행하나요?",
         "희망 지역·예산·운영 계획을 정리하는 1차 상담 → 조건에 맞는 후보 압축 → 현장 실사와 포스·정산 자료 대조 "
         "→ 본사 가맹 승계와 계약 순서로 진행합니다. 단계마다 확인한 자료는 문서로 남깁니다."),
        (f"{brand} 인수 전에 가장 먼저 확인할 것은 무엇인가요?",
         f"{first_head}입니다. {first_body}"),
        (f"{brand} 가맹비·로열티·교육비는 얼마인가요?",
         f"{brand} 가맹비와 로열티, 교육비는 가맹 시점과 평수, 계약 조건에 따라 달라 본사 기준을 확인해야 합니다. "
         f"금액은 본사 가맹사업 정보공개서와 가맹계약서로 확인하는 것이 정확하고, "
         f"에이피파트너는 확인되지 않은 금액을 게시하지 않습니다. 인수 상담에서는 승계 시점 기준으로 어떤 비용이 남는지 정리해 드립니다."),
        B["faq"],
    ]


def build_guide_page(B: dict, store_links: list, guide_links: list) -> str:
    brand = B["brand"]
    slug = B["slug"]
    category = B["category"]
    canonical = f"{BASE_URL}/brands/{slug}.html"

    title = f"{brand} 양도양수 가이드 · 창업 전 실사 체크포인트 | 에이피파트너"
    description = (
        f"{brand}({category}) 양도양수·창업을 준비할 때 확인할 실사 항목과 상담 절차를 정리했습니다. "
        f"현재 공개 점포 0곳 · 비공개 매물 우선 알림 신청. {MANAGER} {PHONE}."
    )
    keywords = ",".join(guide_keywords(B))

    faqs = guide_faqs(B)
    ld_faq = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in faqs
        ],
    }
    ld_crumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "에이피파트너", "item": BASE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": "브랜드별 보기", "item": f"{BASE_URL}/brands/index.html"},
            {"@type": "ListItem", "position": 3, "name": f"{brand} 양도양수 가이드", "item": canonical},
        ],
    }

    checks = "".join(
        f"<li><b>{esc(head)}</b> — {esc(body)}</li>" for head, body in B["checkpoints"]
    )
    faq_html = "".join(
        f'<div class="sx-faq-item"><h3>{esc(q)}</h3><p>{esc(a)}</p></div>' for q, a in faqs
    )
    kw_chips = "".join(f'<span class="sx-chip">{esc(k)}</span>' for k in guide_keywords(B))

    other_store = "".join(
        f'<a class="sx-chip" href="../brands/{esc(s)}.html">{esc(b)} 양도양수</a>'
        for b, s in store_links if b != brand
    )
    other_guide = "".join(
        f'<a class="sx-chip" href="../brands/{esc(G["slug"])}.html">{esc(G["brand"])} 가이드</a>'
        for G in guide_links if G["slug"] != slug
    )

    html_out = page_head(title, description, keywords, canonical, [ld_faq, ld_crumb])
    html_out += crumbs([
        ("홈", "../index.html"),
        ("브랜드별 보기", "index.html"),
        (f"{brand} 양도양수 가이드", None),
    ])
    html_out += f"""
<main id="main">
  <section class="sx-hero">
    <div class="wrap">
      <p class="eyebrow light"><span class="eyebrow-line"></span>BRAND GUIDE · {esc(brand)}</p>
      <h1>{esc(brand)} 양도양수 가이드<br /><em>{esc(category)} 창업, 인수 전 확인 포인트</em></h1>
      <p class="sx-lead">{esc(brand)}는 {esc(B['note'])}입니다. 이 페이지는 공개된 점포가 없는 브랜드를 위해, 인수 전에 확인할 실사 항목과 비공개로 들어오는 점포를 먼저 받아보는 방법을 정리한 가이드입니다. 확인되지 않은 매출·가맹 조건 수치는 쓰지 않았습니다.</p>
      <div class="sx-tags">
        <span>{esc(category)}</span>
        <span>공개 점포 0곳</span>
        <span>비공개 · 우선 알림</span>
        <span>실사 체크포인트</span>
      </div>
      <div class="sx-facts">
        <div class="sx-fact"><span>공개 점포</span><b class="gold">0곳</b></div>
        <div class="sx-fact"><span>알림 방식</span><b>비공개 입고 우선 알림</b></div>
        <div class="sx-fact"><span>업종</span><b>{esc(category)}</b></div>
      </div>
    </div>
  </section>

  <div class="wrap sx-body">
    <div class="sx-main">
      <h2>현재 {esc(brand)} 공개 매물 0건입니다</h2>
      <p class="sx-para">{esc(brand)} 점포는 아직 공개 등록된 곳이 없습니다. 없는 매물을 있는 것처럼 올리지 않습니다. 대신 인수 전에 확인해야 할 항목을 브랜드 특성에 맞춰 정리했고, 조건을 남겨 주시면 비공개로 들어오는 점포를 먼저 알려 드립니다.</p>

      <div class="sx-lock">
        <p class="sx-lock-badge">우선 알림</p>
        <h3>{esc(brand)} 비공개 매물 · 신규 입고 우선 알림 신청</h3>
        <p>희망 지역과 예산, 운영 형태(직접 운영·반오토·풀오토)를 남겨 주시면 {esc(brand)} 점포가 비공개로 들어오는 순서대로 먼저 연락드립니다. {esc(brand)} 외에 조건에 맞는 다른 브랜드 점포도 함께 추려 안내합니다.</p>
        <div class="sx-lock-actions">
          <a class="btn btn-gold btn-lg" href="{BASE_URL}/#concierge">우선 알림 · 조건 상담 신청</a>
          <a class="btn btn-outline-navy btn-lg" href="{PHONE_TEL}">전화 상담 {PHONE}</a>
        </div>
        <p class="sx-note">카카오톡 <b>{KAKAO}</b>로 문의하셔도 됩니다. 사이트에서 남긴 조건은 담당자에게 바로 접수되며, 점포별 상세 지출과 위치는 상담에서 안내합니다.</p>
      </div>

      <h2>{esc(brand)} 인수 전 실사 체크포인트</h2>
      <p class="sx-para">{esc(B['intro'])}</p>
      <ul class="sx-list">{checks}</ul>

      <h2>{esc(brand)} 창업, 이런 점포주에게 맞습니다</h2>
      <p class="sx-para">{esc(B['fit'])}</p>
      <p class="sx-para">같은 브랜드라도 상권·평수·인력 운영에 따라 수익 구조가 달라집니다. 아래 절차대로 후보를 좁히고, 확인한 자료를 문서로 남기는 것이 안전합니다.</p>

      <h2>양도양수 진행 절차</h2>
      <ul class="sx-list">
        <li><b>1차 상담</b> — 희망 지역·예산·운영 계획을 정리합니다. {esc(brand)} 외 대안 브랜드도 함께 놓고 봅니다.</li>
        <li><b>후보 압축</b> — 공개·비공개 점포 중 조건에 가까운 2~3곳과 비용 구조를 보내 드립니다.</li>
        <li><b>현장 실사</b> — 상권·동선·시설을 직접 확인하고 포스·카드 정산 자료로 매출을 대조합니다.</li>
        <li><b>본사 승계·계약</b> — 가맹 승계 조건과 <b>시설·영업권</b>·<b>점포 예치금</b> 항목을 서면으로 확인한 뒤 계약합니다.</li>
      </ul>

      <h2>자주 묻는 질문</h2>
      <div class="sx-faq">{faq_html}</div>

      <h2>{esc(brand)} 매장 검색 키워드</h2>
      <div class="sx-kw">{kw_chips}</div>

      <h2>공개 점포가 있는 다른 브랜드</h2>
      <div class="sx-kw">{other_store}</div>

      <h2>브랜드별 가이드</h2>
      <div class="sx-kw">{other_guide}</div>
      <p class="sx-more"><a href="index.html">브랜드별 보기 전체 →</a> · <a href="../stores/index.html">전체 점포 색인 →</a></p>
    </div>

    <aside class="sx-side">
      <div class="sx-card">
        <p class="sx-card-eyebrow">WAITING LIST</p>
        <h2 class="sx-card-title">{esc(brand)} 우선 알림</h2>
        <p class="sx-card-text">공개 점포는 0곳입니다. 조건을 남겨 주시면 비공개로 들어오는 {esc(brand)} 점포부터 알려 드립니다.</p>
        <div class="sx-card-actions">
          <a class="btn btn-gold" href="{BASE_URL}/#concierge">조건 상담 신청</a>
          <a class="btn btn-outline-navy" href="{PHONE_TEL}">전화 {PHONE}</a>
        </div>
        <dl class="sx-card-facts">
          <div><dt>담당</dt><dd>{MANAGER}</dd></div>
          <div><dt>카카오톡</dt><dd>{KAKAO}</dd></div>
          <div><dt>등록</dt><dd>{REGISTER_NO}</dd></div>
        </dl>
      </div>
    </aside>
  </div>
</main>
"""
    html_out += page_foot(store_links + [(G["brand"], G["slug"]) for G in guide_links])
    return html_out


# ---------------------------------------------------------------- index pages
def build_brand_index(brand_links: list, groups: dict) -> str:
    guide_links = [(B["brand"], B["slug"]) for B in GUIDE_BRANDS]
    total_pages = len(groups) + len(GUIDE_BRANDS)
    total_stores = sum(len(v) for v in groups.values())
    title = (
        "브랜드별 보기 · 투썸·배스킨라빈스·이디야·BHC 등 18개 브랜드 "
        "양도양수 창업 가이드 | 에이피파트너"
    )
    description = (
        "프랜차이즈 양도양수 창업 브랜드별 페이지입니다. 메가커피·컴포즈커피·우지커피·백억커피·교촌치킨·"
        "맘스터치 실사 매장과 함께, 투썸플레이스·배스킨라빈스·텐퍼센트·역전할머니맥주·빽다방·이디야커피·"
        "더벤티·바나프레소·공차·BHC치킨·BBQ치킨·서브웨이는 인수 전 실사 체크포인트와 비공개 매물 우선 알림을 안내합니다."
    )
    keywords = ",".join(unique(
        [f"{b} 양도양수" for b in groups] + [f"{b} 창업" for b in groups]
        + [f"{B['brand']} 양도양수" for B in GUIDE_BRANDS]
        + [f"{B['brand']} 창업" for B in GUIDE_BRANDS]
        + ["프랜차이즈 양도양수", "카페 창업", "치킨 창업", "양도양수 창업"]
    ))
    canonical = f"{BASE_URL}/brands/index.html"
    cards = "".join(brand_card(b, items) for b, items in groups.items())
    guide_cards = "".join(guide_card(B) for B in GUIDE_BRANDS)
    ld = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "브랜드별 양도양수 창업 매장 · 가이드",
        "url": canonical,
        "numberOfItems": total_pages,
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": f"{b} 양도양수",
             "url": f"{BASE_URL}/brands/{s}"}
            for i, (b, s) in enumerate(
                [(b, slug_for(b) + ".html") for b in groups]
                + [(B["brand"], B["slug"] + ".html") for B in GUIDE_BRANDS]
            )
        ],
    }
    html_out = page_head(title, description, keywords, canonical, ld)
    html_out += crumbs([("홈", "../index.html"), ("브랜드별 보기", None)])
    html_out += f"""
<main id="main">
  <section class="sx-hero">
    <div class="wrap">
      <p class="eyebrow light"><span class="eyebrow-line"></span>BRANDS</p>
      <h1>브랜드별 양도양수 창업<br /><em>{total_pages}개 브랜드 · 실사 매장과 인수 가이드</em></h1>
      <p class="sx-lead">현장 실사를 마친 매장이 있는 {len(groups)}개 브랜드와, 인수 전 확인 항목을 정리한 가이드 {len(GUIDE_BRANDS)}개 브랜드를 한곳에 모았습니다. 공개 점포가 없는 브랜드는 매물을 만들어 올리지 않고, 실사 체크포인트와 비공개 입고 우선 알림만 안내합니다.</p>
      <div class="sx-tags"><span>{total_pages}개 브랜드</span><span>공개 점포 {total_stores}곳</span><span>가이드 {len(GUIDE_BRANDS)}개</span></div>
    </div>
  </section>
  <div class="wrap sx-body sx-body-wide">
    <div class="sx-main">
      <h2>공개 점포가 있는 브랜드 <span class="sx-count">{len(groups)}개</span></h2>
      <div class="sx-brand-grid">{cards}</div>

      <h2>가이드 · 비공개 우선 알림 브랜드 <span class="sx-count">{len(GUIDE_BRANDS)}개</span></h2>
      <p class="sx-para">아래 브랜드는 지금 공개된 점포가 0곳입니다. 대신 브랜드별로 인수 전에 확인할 실사 항목을 정리했고, 조건을 남기면 비공개로 들어오는 점포를 먼저 알려 드립니다.</p>
      <div class="sx-brand-grid">{guide_cards}</div>
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
    for B in GUIDE_BRANDS:
        urls.append(f"{BASE_URL}/brands/{B['slug']}.html")
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


# ---------------------------------------------------------------- index store links
STORE_START = "<!-- SEO:STORE-LINKS:START -->"
STORE_END = "<!-- SEO:STORE-LINKS:END -->"


def update_index_store_links(listings: list) -> bool:
    """메인 index.html 안에 점포 12곳의 정적 링크 목록과 ItemList 구조화 데이터를
    다시 쑴니다(마커 사이 블록). 새 점포가 등록되면 자동으로 함께 갱신됩니다."""
    if not INDEX_FILE.exists():
        return False
    source = INDEX_FILE.read_text(encoding="utf-8")
    if STORE_START not in source or STORE_END not in source:
        return False

    items_html = "".join(
        f'\n        <li><a href="stores/{esc(L["id"].lower())}.html">'
        f'<b>{esc(L["code"])}</b> {esc(L["brand"])} · {esc(L["district"])}</a></li>'
        for L in listings
    )
    ld = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "에이피파트너 현장 실사 점포",
        "url": BASE_URL + "/",
        "numberOfItems": len(listings),
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1,
             "name": f"No. {L['code']} {L['brand']} {L['area']}",
             "url": f"{BASE_URL}/stores/{L['id'].lower()}.html"}
            for i, L in enumerate(listings)
        ],
    }
    counts = {}
    for L in listings:
        counts[L["brand"]] = counts.get(L["brand"], 0) + 1
    brand_html = "".join(
        f'\n        <a href="brands/{esc(slug_for(b))}.html">{esc(b)} <b>{n}</b></a>'
        for b, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    )
    block = (
        f'{STORE_START}\n'
        f'    <div class="store-index">\n'
        f'      <p class="store-index-title">점포 상세 페이지 <span class="store-index-count">{len(listings)}</span>곳 · 브랜드별 보기</p>\n'
        f'      <div class="store-index-brands">{brand_html}\n      </div>\n'
        f'      <details class="store-index-all">\n'
        f'        <summary>전체 점포 목록 <b>{len(listings)}</b>곳 펼쳐 보기</summary>\n'
        f'        <ul class="store-index-list">{items_html}\n        </ul>\n'
        f'      </details>\n'
        f'    </div>\n'
        f'    <script type="application/ld+json">\n'
        + json.dumps(ld, ensure_ascii=False, indent=2)
        + f'\n    </script>\n'
        f'    {STORE_END}'
    )
    new_source = re.sub(
        re.escape(STORE_START) + r".*?" + re.escape(STORE_END), lambda _m: block,
        source, count=1, flags=re.S
    )
    if new_source != source:
        INDEX_FILE.write_text(new_source, encoding="utf-8")
        return True
    return False


# ---------------------------------------------------------------- llms.txt
def build_llms_txt(groups: dict, listings: list, updated_at: str) -> str:
    """AI 검색·요약 도구가 읽기 좋은 사이트 안내(llms.txt).

    공개된 값(비용 구성·월 매출·예상 순수익·지역·규모)만 쑬고,
    항목별 지출과 지점명·상세 위치는 쓰지 않습니다.
    """
    total = len(listings)
    out = [
        "# 에이피파트너 (AP PARTNERS)",
        "",
        "> 프랜차이즈 양도양수·창업을 전문으로 하는 김현율 팀장(에이피파트너)의 사이트입니다. "
        f"현장 실사를 마친 공개 점포 {total}곳의 초기 인수 비용·월 매출·예상 순수익과, "
        f"브랜드 {len(GUIDE_BRANDS) + len(groups)}개의 인수 전 확인 항목을 정리했습니다.",
        "",
        "에이피파트너는 카페·디저트·치킨·패스트푸드 프랜차이즈 매장의 양도양수(점포 인수)를 "
        "중개하고 상담하는 1인 컨설팅 사무소입니다. 지점명과 상세 위치는 점주 보호를 위해 "
        "공개하지 않고 상담에서 안내하며, 게시된 수치는 점주 제시 자료를 기준으로 정리한 값입니다. "
        "확인되지 않은 가맹비·로열티·매출 수치는 게시하지 않습니다.",
        "",
        f"- 사이트: {BASE_URL}/",
        f"- 담당: {MANAGER} · 전화 {PHONE} · 카카오톡 {KAKAO} · 등록 {REGISTER_NO}",
        f"- 최종 갱신: {updated_at}",
        "",
        "## 사이트 지도",
        "",
        f"- [홈]({BASE_URL}/): 점포 카드 · 조건 입력 후 상세 지출 확인 · 상담 접수",
        f"- [브랜드별 보기]({BASE_URL}/brands/index.html): 브랜드 {len(GUIDE_BRANDS) + len(groups)}개 색인",
        f"- [전체 점포 색인]({BASE_URL}/stores/index.html): 공개 점포 {total}곳 목록",
        f"- [사이트맵]({BASE_URL}/sitemap.xml)",
        "",
        f"## 현재 공개 점포 {total}곳",
        "",
        "모든 금액은 만 원 단위이며 점주 제시 자료를 기준으로 정리한 값입니다. "
        "항목별 지출(재료비·인건비·매장 고정비·기타잡비)은 사이트에서 희망 조건을 남기면 확인할 수 있고, "
        "이 문서에는 싣지 않습니다.",
        "",
    ]
    for L in listings:
        costs = " + ".join(f"{item['label']} {item['value']}" for item in L["initial_cost"].get("items", []))
        out += [
            f"### No. {L['code']} · {L['brand']} · {L['area']}",
            "",
            f"- 업종: {L['category']}" + (f" ({L['brand_note']})" if L.get("brand_note") else ""),
            f"- 규모: {L.get('store_spec', '-')}",
            f"- 초기 인수 비용: {L['initial_cost']['label']}" + (f" ({costs})" if costs else ""),
            f"- 월 평균 매출: {L['monthly_sales']['label'].replace('월 평균 ', '')}",
            f"- 예상 순수익: {L['profit']['label']} (점주 제시 자료 기준)",
            f"- 상세 페이지: {BASE_URL}/stores/{L['id'].lower()}.html",
            "",
        ]

    out += [f"## 브랜드별 양도양수 가이드 {len(GUIDE_BRANDS)}개", "",
            "공개 점포가 아직 없는 브랜드는 매물을 만들어 올리지 않고, 인수 전 실사 체크포인트와 "
            "신규 입고 우선 알림만 안내합니다. 각 페이지에 질문·답변(FAQ)과 구조화 데이터가 있습니다.", ""]
    for B in GUIDE_BRANDS:
        out.append(f"- [{B['brand']}]({BASE_URL}/brands/{B['slug']}.html) — {B['category']} · {B['note']}")
    out += [""]

    out += [f"## 공개 점포가 있는 브랜드 {len(groups)}개", ""]
    for brand, items in groups.items():
        costs = [L["initial_cost"]["total_manwon"] for L in items]
        out.append(
            f"- [{brand}]({BASE_URL}/brands/{slug_for(brand)}.html) — {items[0]['category']} · "
            f"{len(items)}곳 · 초기 인수 비용 {range_label(min(costs), max(costs))}"
        )
    out += [
        "",
        "## 상담",
        "",
        f"- 전화: {PHONE}",
        f"- 카카오톡: {KAKAO}",
        f"- 조건 상담 접수: {BASE_URL}/#concierge",
        f"- 진행 절차: 조건 상담 → 후보 압축 → 현장 실사·포스 자료 대조 → 본사 가맹 승계·계약",
        "",
        "## 인용할 때",
        "",
        "- 금액과 수익은 점주 제시 자료 기준이며, 인력 운영과 배달 비중에 따라 실제 수익은 달라질 수 있습니다.",
        "- 지점명·상세 위치·항목별 지출은 공개하지 않습니다. 상담에서 안내합니다.",
        "- 가맹비·교육비·로열티 등 본사 비용은 매장과 시점에 따라 다르므로 본사 확인이 필요합니다.",
        "",
    ]
    return "\n".join(out)


# ---------------------------------------------------------------- main
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="생성 결과 검사만 수행")
    args = parser.parse_args()

    listings = load_listings()
    groups = group_by_brand(listings)
    store_links = [(b, slug_for(b)) for b in groups]
    guide_links = [(B["brand"], B["slug"]) for B in GUIDE_BRANDS]
    brand_links = store_links + guide_links
    updated_at = json.loads(DATA_FILE.read_text(encoding="utf-8")).get("updated_at", "")
    # 사이트맵·llms.txt 갱신일 = 등록 데이터 갱신일과 페이지 구조 변경일 중 최근 값.
    today = max(updated_at, PAGE_UPDATED)

    missing = [b for b in groups if b not in BRAND_SLUGS]
    outputs = {}

    for brand, items in groups.items():
        outputs[BRANDS_DIR / f"{slug_for(brand)}.html"] = build_brand_page(brand, items, store_links)
    for B in GUIDE_BRANDS:
        outputs[BRANDS_DIR / f"{B['slug']}.html"] = build_guide_page(B, store_links, GUIDE_BRANDS)
    outputs[BRANDS_DIR / "index.html"] = build_brand_index(brand_links, groups)
    outputs[STORES_DIR / "index.html"] = build_store_index(groups, brand_links)
    for items in groups.values():
        for L in items:
            outputs[STORES_DIR / f"{L['id'].lower()}.html"] = build_store_page(L, brand_links, items)
    outputs[SITEMAP_FILE] = build_sitemap(groups, max(updated_at, today))
    outputs[LLMS_FILE] = build_llms_txt(groups, listings, today)

    if args.check:
        stale = [str(p) for p, body in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != body]
        print(f"점포 {len(listings)}곳 · 브랜드 {len(groups)}개 · 가이드 {len(GUIDE_BRANDS)}개 · 페이지 {len(outputs)}개")
        print("최신 상태" if not stale else "다시 생성 필요:\n  " + "\n  ".join(stale))
        return 0 if not stale else 1

    for path, body in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
    if update_index_footer(brand_links):
        print("index.html 푸터 브랜드 링크 갱신")
    if update_index_store_links(listings):
        print("index.html 점포 상세 링크 갱신")
    if missing:
        print("⚠ 슬러그 매핑이 없는 브랜드(대체 슬러그 사용): " + ", ".join(missing))
    print(f"생성 완료 — 점포 {len(listings)}곳 · 브랜드 {len(groups)}개 · 파일 {len(outputs) + 1}개")
    for path in sorted(outputs):
        print(f"  {path.relative_to(SITE_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
