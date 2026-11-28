/* ==========================================================================
   AP PARTNERS · 에이피파트너 — 사이트 스크립트
   - 점포 데이터: data/listings.json (이 파일만 수정하면 목록에 자동 반영)
   - AI 매칭(내 조건 매장 찾기): 브라우저 안에서 조건을 해석하는 규칙 기반 매칭 (외부 API 없음)
   ========================================================================== */
(function () {
  'use strict';

  var PHONE_TEL = 'tel:010-2885-5553';
  var PHONE_SMS = 'sms:01028855553';
  var KAKAO_ID = 'hyunyul89';

  /* ---------------------------------------------------------------------
     4항목 손님 DB · 2단계 잠금 해제 (Lead Gate)
     - 1단계: 점포 목록·검색·필터는 연락처 없이 바로 열람
     - 2단계: '맞춤 매칭 결과' 또는 '상세 지출'을 누를 때
       ① 업종/브랜드 ② 지역 ③ 예산 ④ 연락처(동의) 4항목 입력
     - 입력값은 JSON 페이로드로 localStorage / sessionStorage 에 저장되고,
       LEAD_ENDPOINT 를 채우면 그대로 전송(구글 시트 · 이메일 · 웹훅)됩니다.
     --------------------------------------------------------------------- */
  var LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycby46wERwxPPkkGeOXVO0zyerX4DWgua0tqBRbtgN3eh-aDJGLJ7ggNewUUY8sTl7EGHUA/exec';
  var LEAD_STORAGE_KEY = 'apPartnerLead';
  var LEAD_SESSION_KEY = 'apPartnerLeadSession';
  var LEAD_QUEUE_KEY = 'apPartnerLeadQueue';
  var LEAD_ALL_KEY = 'apPartnerLeads';          // 관리자 페이지 '손님 DB' 탭이 읽는 전체 목록

  var LEAD_CATEGORY_CHIPS = ['카페', '디저트', '음식점', '패스트푸드', '치킨', '판매·서비스', '기타'];
  var LEAD_AREA_CHIPS = ['서울', '경기', '인천', '대전', '충남', '기타'];
  var LEAD_BUDGET_CHIPS = ['1억 미만', '1억대', '2억대', '3억 이상'];

  var gateEl = null;
  var gateOpen = false;
  var gateReturnFocus = null;
  var gateFormState = { category: [], area: [], budget: '', brand: '' };

  /* ---------------------------------------------------------------------
     예비 데이터: data/listings.json 을 fetch 할 수 없을 때만 사용됩니다.
     (index.html 을 파일로 직접 열면 브라우저가 fetch 를 막습니다.)
     실제 데이터 관리는 JSON 한 곳에서 하세요. 배포 후에는 항상 JSON 을 읽습니다.
     --------------------------------------------------------------------- */
  var FALLBACK = [
    {
      "id": "ap-001",
      "code": "AP-001",
      "status": "live",
      "region": "서울",
      "district": "종로구",
      "area": "서울 종로구 대학가 상권",
      "area_note": "대학가·인근 주민 상권 · 주차 없음 · 평일 08:00~19:30 / 주말 09:00~17:00",
      "category": "카페",
      "brand": "메가커피",
      "brand_note": "저가 커피 프랜차이즈",
      "store_spec": "1층 · 13평",
      "store_floor": "1층",
      "store_pyeong": 13,
      "initial_cost": {
        "total_manwon": 23000,
        "label": "2억 3,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "1,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2억 2,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 3141,
        "label": "월 평균 3,141만 원"
      },
      "profit": {
        "label": "월 약 1,242만 원",
        "avg_manwon": 1242,
        "note": "점주 제시 자료 기준"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ],
          "range": "1,099만 원",
          "share": "매출의 35%"
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            500,
            500
          ],
          "range": "500만 원",
          "share": "매출의 15.9%"
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            95,
            95
          ],
          "range": "95만 원",
          "share": "매출의 3%"
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            205,
            205
          ],
          "range": "205만 원",
          "share": "매출의 6.5%"
        }
      ],
      "points": [
        "키오스크 1대, 2인 테이블 4개 구성 · 평일은 점주가 07:30~15:00 근무",
        "학기 중 인건비 월 520만 원, 방학에는 140~220만 원으로 줄어듭니다",
        "배달 비중 13% · 주말은 오전·오후 1명씩 운영",
        "2023년 10월 개업, 2025년 5월 인수한 매장입니다",
        "로열티는 월 25만 원입니다"
      ],
      "check_note": "방학 4개월은 인건비를 520만 원에서 140~220만 원으로 줄여 운영합니다. 방학 중 매출 하락 폭과 주말 1인 운영 계획을 함께 확인하세요.",
      "keywords": [
        "대학가",
        "키오스크",
        "방학",
        "테이크아웃",
        "주말"
      ],
      "visible": true
    },
    {
      "id": "ap-002",
      "code": "AP-002",
      "status": "live",
      "region": "경기",
      "district": "성남시 위례",
      "area": "경기 성남시 위례신도시",
      "area_note": "신도시 아파트 배후 상권 · 주차 가능 · 매일 07:30~24:00",
      "category": "카페",
      "brand": "백억커피",
      "brand_note": "커피 프랜차이즈",
      "store_spec": "1층 · 14평",
      "store_floor": "1층",
      "store_pyeong": 14,
      "initial_cost": {
        "total_manwon": 5000,
        "label": "5,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "3,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 3472,
        "label": "월 평균 3,472만 원"
      },
      "profit": {
        "label": "월 약 747만 원",
        "avg_manwon": 747,
        "note": "점주 제시 자료 기준"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ],
          "range": "1,215만 원",
          "share": "매출의 35%"
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            600,
            600
          ],
          "range": "600만 원",
          "share": "매출의 17.3%"
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            270,
            270
          ],
          "range": "270만 원",
          "share": "매출의 7.8%"
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            640,
            640
          ],
          "range": "640만 원",
          "share": "매출의 18.4%"
        }
      ],
      "points": [
        "오픈·미들·마감 각 1명으로 돌아가는 최소 인력 구조입니다",
        "점주는 발주와 관리만 보고, 현장은 인력이 운영합니다",
        "키오스크 1대 · 2인석 6개, 6인석 1개 · 주차 가능",
        "배달 비중 60%(쿠팡·요기요·배민) · 최소주문 9,900원",
        "본사 예치금 500만 원, 교육비 300만 원, 로열티 월 33만 원은 초기 인수 비용과 별도입니다"
      ],
      "check_note": "배달 비중이 60%이고 배달지출이 월 520만 원입니다. 배달 채널 수수료와 최소주문 9,900원 기준 객단가를 함께 확인하세요.",
      "keywords": [
        "매니저",
        "주차",
        "배달",
        "신도시",
        "키오스크"
      ],
      "visible": true
    },
    {
      "id": "ap-003",
      "code": "AP-003",
      "status": "live",
      "region": "서울",
      "district": "금천구",
      "area": "서울 금천구 주거상권",
      "area_note": "아파트 단지 배후 주거 상권 · 매일 08:00~21:30",
      "category": "카페",
      "brand": "메가커피",
      "brand_note": "저가 커피 프랜차이즈",
      "store_spec": "1층 · 11평",
      "store_floor": "1층",
      "store_pyeong": 11,
      "initial_cost": {
        "total_manwon": 26000,
        "label": "2억 6,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "3,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2억 3,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 7750,
        "label": "월 평균 7,750만 원"
      },
      "profit": {
        "label": "월 약 1,898만 원",
        "avg_manwon": 1898,
        "note": "점주 제시 자료 기준"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            38.0,
            38.0
          ],
          "range": "2,945만 원",
          "share": "매출의 38%"
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            950,
            950
          ],
          "range": "950만 원",
          "share": "매출의 12.3%"
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            190,
            190
          ],
          "range": "190만 원",
          "share": "매출의 2.5%"
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            1767,
            1767
          ],
          "range": "1,767만 원",
          "share": "매출의 22.8%"
        }
      ],
      "points": [
        "매니저 1명이 오픈부터 16시까지 근무하고, 점주는 바쁠 때만 잠깐 출근해 관리합니다",
        "배달 비중 62% · 배달지출은 배달 매출의 30% 이내",
        "2024년 2월 인수 후 2년 운영한 매장입니다",
        "제빙기, 롤 아이스크림 제조기 등 시설 포함"
      ],
      "check_note": "배달지출이 월 1,441만 원으로 매출의 18.6%를 차지합니다. 배달 비중 62%와 카드·부가세 월 181만 원을 함께 확인하세요.",
      "keywords": [
        "매니저",
        "배달",
        "주거",
        "아파트",
        "고매출"
      ],
      "visible": true
    },
    {
      "id": "ap-004",
      "code": "AP-004",
      "status": "live",
      "region": "서울",
      "district": "강서구",
      "area": "서울 강서구 주거상권",
      "area_note": "배달 없이 홀·테이크아웃(행사 픽업만)으로 운영 · 매일 08:00~21:00",
      "category": "카페",
      "brand": "메가커피",
      "brand_note": "저가 커피 프랜차이즈",
      "store_spec": "1층 · 15평 (49.59㎡) · 좌석 26석",
      "store_floor": "1층",
      "store_pyeong": 15,
      "initial_cost": {
        "total_manwon": 18000,
        "label": "1억 8,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "3,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "1억 5,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 2872,
        "label": "월 평균 2,872만 원"
      },
      "profit": {
        "label": "월 약 800만 원",
        "avg_manwon": 800,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 4.44%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            760,
            760
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            207,
            207
          ]
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            100,
            100
          ]
        }
      ],
      "points": [
        "매니저 1명이 평일 07:30~18:30, 주말 07:30~12:00 근무하고 점주는 현장에서 빠지는 풀오토 구조입니다",
        "매니저 보수는 시급 11,000원에 주휴수당 별도, 매출 수익의 10% 인센티브를 함께 주는 조건입니다",
        "알바 4명은 12~15시 피크타임에만 집중 배치합니다(주말 12:00~17:00, 금요일은 14:30까지)",
        "배달은 하지 않고 홀·테이크아웃으로 돌아가며, 행사 건만 픽업으로 받습니다",
        "2023년 6월 신규 개업, 시설 인테리어 AAA 등급 · 1층 15평에 좌석 26석입니다",
        "매장 고정비 207만 원은 점포 사용료 200만 원과 관리 7만 원, 계약 기간 3년 기준입니다",
        "기타잡비 100만 원은 제세공과금 65만 원(보안·방역·통신·보험·세무 포함)과 홍보·기타잡비 35만 원입니다"
      ],
      "check_note": "2026년 10월은 4일 휴무와 2일 조기마감이 반영된 2,480만 원입니다. 매니저 인계 조건(매출 수익 10% 인센티브 포함)과 12~15시 피크타임 인력 집중 구조를 실사에서 확인하세요.",
      "keywords": [
        "매니저",
        "풀오토",
        "테이크아웃",
        "주거",
        "1층",
        "강서"
      ],
      "visible": true
    },
    {
      "id": "ap-005",
      "code": "AP-005",
      "status": "live",
      "region": "서울",
      "district": "서초구",
      "area": "서울 서초구 주거상권",
      "area_note": "대단지 아파트 항아리상권 · 2면 코너 · 매일 07:30~22:00",
      "category": "카페",
      "brand": "우지커피",
      "brand_note": "커피 프랜차이즈",
      "store_spec": "1층 · 14평 (46.28㎡)",
      "store_floor": "1층",
      "store_pyeong": 14,
      "initial_cost": {
        "total_manwon": 28000,
        "label": "2억 8,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "5,500만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2억 2,500만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 5175,
        "label": "월 평균 5,175만 원"
      },
      "profit": {
        "label": "월 약 1,326만 원",
        "avg_manwon": 1326,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 4.74%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            1000,
            1000
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            380,
            380
          ]
        },
        {
          "label": "제세공과금·관리",
          "unit": "manwon",
          "amount": [
            138,
            138
          ]
        },
        {
          "label": "배달 수수료",
          "unit": "manwon",
          "amount": [
            490,
            490
          ]
        },
        {
          "label": "홍보·기타잡비",
          "unit": "manwon",
          "amount": [
            30,
            30
          ]
        }
      ],
      "points": [
        "대단지 아파트 단지 안 상가 1층, 2면 코너에 자리한 항아리 상권입니다",
        "2025년 12월 24일 개업한 지 1년 된 매장으로 시설 인테리어는 AAAA 등급입니다",
        "에버시스 e4s 전자동 머신을 비롯한 고급 장비가 갖춰져 있어 추가 설비 부담이 적습니다",
        "직원 1명과 알바 10명 체제로 돌아가고 점주는 발주·관리만 보는 풀오토 구조입니다",
        "배달 비중 31.7%로 배달 수수료가 월 490만 원 발생합니다",
        "본사 로열티는 월 20만 원이며 점주 제시 총경비에는 포함되지 않은 별도 비용입니다",
        "양도 사유는 타회사 이직입니다",
        "상세 지출 내역과 실제 위치는 상담에서 안내합니다"
      ],
      "check_note": "점주 제시 총경비 3,849만 원은 배달 수수료 490만 원(배달 31.7%)과 인건비 1,000만 원을 포함한 금액입니다. 배달 비중을 줄일 여지와 직원 1명·알바 10명 인력 구조의 실제 근무표를 실사에서 확인하세요.",
      "keywords": [
        "주거",
        "항아리상권",
        "2면 코너",
        "풀오토",
        "배달",
        "서초",
        "1층"
      ],
      "visible": true
    },
    {
      "id": "ap-006",
      "code": "AP-006",
      "status": "live",
      "region": "서울",
      "district": "강동구",
      "area": "서울 강동구 역세권·학원가 상권",
      "area_note": "역세권·학원가·인근 주민 상권 · 주차 없음 · 매일 08:00~21:00",
      "category": "카페",
      "brand": "컴포즈커피",
      "brand_note": "가성비 커피 프랜차이즈",
      "store_spec": "1층 · 14.7평 (48.6㎡) · 좌석 18석",
      "store_floor": "1층",
      "store_pyeong": 14.7,
      "initial_cost": {
        "total_manwon": 18000,
        "label": "1억 8,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "7,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "1억 1,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 3100,
        "label": "월 평균 3,100만 원"
      },
      "profit": {
        "label": "월 약 765만 원",
        "avg_manwon": 765,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 4.25%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            700,
            700
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            400,
            400
          ]
        },
        {
          "label": "제세공과금·관리",
          "unit": "manwon",
          "amount": [
            100,
            100
          ]
        },
        {
          "label": "로열티",
          "unit": "manwon",
          "amount": [
            20,
            20
          ]
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            30,
            30
          ]
        }
      ],
      "points": [
        "역세권·학원가와 인근 주거 수요를 함께 끼고 있는 1층 매장입니다",
        "2023년 7월 신규 오픈한 매장으로 시설 등급은 AAA입니다",
        "배달 없이 홀 중심으로 운영해 배달 수수료가 발생하지 않습니다",
        "키오스크 1대, 디카페인 머신 1대, 와플기계 1대, 아이스크림기 1대를 갖췄습니다",
        "CCTV는 자가 설치로 렌탈 비용이 없습니다",
        "점주가 오전 시간과 목요일 일부 시간에 참여하는 반오토 운영입니다 (주 5일 매니저 1명, 세전 270만 원)",
        "영업시간은 매일 08:00~21:00이며 주차는 불가합니다",
        "양도 사유는 타 지역 상가 분양 정리입니다",
        "상세 지출 내역과 실제 위치는 상담에서 안내합니다"
      ],
      "check_note": "점주 제시 총경비 2,335만 원은 재료비 35%(약 1,085만 원)·인건비 700만 원·매장 고정비 400만 원·제세공과금 100만 원·로열티 20만 원·기타잡비 30만 원을 합한 금액입니다. 학원가 상권이라 방학·시험 기간에 매출 변동이 큰 편이므로, 최근 월별 매출 추이와 주 5일 매니저 근무표·점주 참여 시간을 실사에서 확인하세요.",
      "keywords": [
        "역세권",
        "학원가",
        "홀",
        "신규오픈",
        "반오토",
        "강동",
        "1층"
      ],
      "visible": true
    },
    {
      "id": "ap-007",
      "code": "AP-007",
      "status": "live",
      "region": "인천",
      "district": "미추홀구",
      "area": "인천 미추홀구 주거·생활상권",
      "area_note": "주거·생활 수요 상권 · 주차 불가 · 매일 08:00~22:00",
      "category": "카페",
      "brand": "메가커피",
      "brand_note": "저가 커피 프랜차이즈",
      "store_spec": "1층 · 15평 (50㎡) · 좌석 22석 (7테이블)",
      "store_floor": "1층",
      "store_pyeong": 15,
      "initial_cost": {
        "total_manwon": 25000,
        "label": "2억 5,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "5,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2억 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 3916,
        "label": "월 평균 3,916만 원"
      },
      "profit": {
        "label": "월 약 1,107만 원",
        "avg_manwon": 1107,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 4.43%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            700,
            700
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            348,
            348
          ]
        },
        {
          "label": "제세공과금·관리",
          "unit": "manwon",
          "amount": [
            80,
            80
          ]
        },
        {
          "label": "배달 수수료",
          "unit": "manwon",
          "amount": [
            285,
            285
          ]
        },
        {
          "label": "홍보·기타잡비",
          "unit": "manwon",
          "amount": [
            25,
            25
          ]
        }
      ],
      "points": [
        "2023년 3월 신규 오픈한 매장으로 시설 인테리어 등급은 AAA입니다",
        "평일은 매니저 07:30~17:00, 미들 12:00~17:00, 마감 19:00~22:30 1명으로 돌아가고 마감 17:00~22:30은 점주가 서는 반오토 운영입니다",
        "주말은 오픈·미들·마감 각 2명씩 서고, 인건비는 월 700만 원 내외입니다",
        "배달 비중 약 17% · 배달 단가 15,000~20,000원",
        "키오스크 2대, 태블릿 1대, 최근 교체한 제빙기, 바(bar) 냉동고, 간냉식 실링기를 갖췄습니다",
        "계약 기간은 2년을 3년으로 연장하는 조건이며 점포 사용료 변동은 없습니다",
        "양도 사유는 투잡입니다",
        "상세 지출 내역과 실제 위치는 상담에서 안내합니다"
      ],
      "check_note": "점주 제시 총경비 2,809만 원은 재료비 35%(약 1,371만 원)·인건비 700만 원·매장 고정비 348만 원(점포 사용료 328+관리 20)·제세공과금 80만 원·배달 수수료 285만 원·홍보·기타잡비 25만 원을 합한 금액입니다. 점주가 마감에 일부 참여하는 반오토 구조이므로, 점주 참여 시간과 배달 비중 17%의 최근 추이를 실사에서 확인하세요.",
      "keywords": [
        "인천",
        "미추홀",
        "주거",
        "반오토",
        "배달",
        "키오스크",
        "신규오픈",
        "1층"
      ],
      "visible": true
    },
    {
      "id": "ap-008",
      "code": "AP-008",
      "status": "live",
      "region": "경기",
      "district": "고양시 일산동구",
      "area": "경기 고양시 일산동구 역세권 상권",
      "area_note": "역세권·인근 주거 수요 상권 · 점주 주차 1대 가능",
      "category": "카페",
      "brand": "메가커피",
      "brand_note": "저가 커피 프랜차이즈",
      "store_spec": "1층 · 15평 (49.59㎡) · 좌석 18석",
      "store_floor": "1층",
      "store_pyeong": 15,
      "initial_cost": {
        "total_manwon": 29000,
        "label": "2억 9,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "6,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2억 3,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 4000,
        "label": "월 평균 4,000만 원"
      },
      "profit": {
        "label": "월 약 1,030만 원",
        "avg_manwon": 1030,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 3.55%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            1100,
            1100
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            290,
            290
          ]
        },
        {
          "label": "제세공과금·관리",
          "unit": "manwon",
          "amount": [
            100,
            100
          ]
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            30,
            30
          ]
        },
        {
          "label": "배달 수수료",
          "unit": "manwon",
          "amount": [
            50,
            50
          ]
        }
      ],
      "points": [
        "2019년 9월 신규 오픈한 매장으로 시설 인테리어 등급은 AAA이고 머신기는 교체 예정입니다",
        "역세권 상권으로 경쟁업체 입점이 마무리된 자리입니다",
        "배달 비중 5%로 배달 의존도가 낮습니다",
        "키오스크 1대 · 2인석 18석 구성이며 점주 주차 1대가 가능합니다",
        "정직원 2명(4대 보험)에 평일 알바 2명·주말 알바 3명으로 돌아가고, 점주 메모에는 풀오토 기준 인건비 900만 원이 적혀 있습니다",
        "계약 기간은 2년이며 점포 사용료 변동은 없습니다",
        "영업시간은 점주 자료에 적혀 있지 않아 상담에서 안내합니다",
        "양도 사유는 건강 악화입니다",
        "상세 지출 내역과 실제 위치는 상담에서 안내합니다"
      ],
      "check_note": "점주 제시 총경비 2,970만 원은 재료비 35%(약 1,400만 원)·인건비 1,100만 원·매장 고정비 290만 원·제세공과금 100만 원·기타잡비 30만 원·배달 수수료 50만 원을 합한 금액입니다. 인건비 1,100만 원은 정직원 2명·알바 5명 기준이고 점주 메모에는 풀오토 900만 원으로 적혀 있으니, 실제 근무표와 인건비 차이를 실사에서 확인하세요.",
      "keywords": [
        "경기",
        "일산",
        "역세권",
        "주차",
        "키오스크",
        "매니저",
        "풀오토"
      ],
      "visible": true
    },
    {
      "id": "ap-009",
      "code": "AP-009",
      "status": "live",
      "region": "대전",
      "district": "서구",
      "area": "대전 서구 핵심 상권",
      "area_note": "핵심 상권 · 주차 불가 · 매일 08:30~24:00 (라스트오더 23:30)",
      "category": "패스트푸드",
      "brand": "맘스터치&피자",
      "brand_note": "버거·피자 프랜차이즈",
      "store_spec": "1층 · 50평 (165.29㎡) · 좌석 약 25석",
      "store_floor": "1층",
      "store_pyeong": 50,
      "initial_cost": {
        "total_manwon": 35000,
        "label": "3억 5,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "5,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "3억 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 15295,
        "label": "월 평균 1억 5,295만 원"
      },
      "profit": {
        "label": "월 약 1,447만 원",
        "avg_manwon": 1447,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 4.13%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            50.0,
            50.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            2300,
            2300
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            600,
            600
          ]
        },
        {
          "label": "제세공과금·관리",
          "unit": "manwon",
          "amount": [
            350,
            350
          ]
        },
        {
          "label": "배달·기타잡비",
          "unit": "manwon",
          "amount": [
            2900,
            2900
          ]
        },
        {
          "label": "홍보·기타잡비",
          "unit": "manwon",
          "amount": [
            50,
            50
          ]
        }
      ],
      "points": [
        "2024년 5월 신규 오픈한 2년차 매장으로 시설 인테리어 등급은 AAA입니다",
        "점주는 발주만 챙기는 풀오토 운영으로, 매니저 3~4명과 파트타임 7~8명이 오픈 2~3명·미들 3~4명·마감 3~4명으로 돌아갑니다",
        "배달 비중 65%로 배달 매출의 약 30%가 배달 비용으로 나갑니다",
        "1층 50평에 좌석 약 25석이며 주차는 불가합니다",
        "매장 고정비 600만 원은 점포 사용료이고, 관리비 250만 원(전기·수도·관리)은 점주 제시 총경비에 포함되지 않은 별도 비용입니다",
        "계약 기간은 2년으로 점포 사용료 변동은 없습니다",
        "가맹비 250만 원과 로열티(본사 매입가액의 2%)는 초기 인수 비용과 별도입니다",
        "양도 사유는 본업 집중입니다",
        "상세 지출 내역과 실제 위치는 상담에서 안내합니다"
      ],
      "check_note": "점주 제시 총경비 13,848만 원은 재료비 50%(약 7,648만 원)·인건비 2,300만 원·매장 고정비 600만 원·제세공과금 350만 원·배달·기타잡비 2,900만 원·홍보·기타잡비 50만 원을 합한 금액이고, 관리비 250만 원은 여기에 포함되지 않은 별도 비용입니다. 매출의 절반 이상이 배달에서 나오는 구조이므로, 배달 채널 수수료율과 최근 월별 배달 매출 추이를 실사에서 확인하세요.",
      "keywords": [
        "대전",
        "서구",
        "핵심상권",
        "패스트푸드",
        "풀오토",
        "배달",
        "대형평수"
      ],
      "visible": true
    },
    {
      "id": "ap-010",
      "code": "AP-010",
      "status": "live",
      "region": "서울",
      "district": "강동구",
      "area": "서울 강동구 역세권 상권",
      "area_note": "역세권·인근 주거 수요 상권 · 경쟁업체 입점 완료 · 매일 08:00~22:30",
      "category": "카페",
      "brand": "메가커피",
      "brand_note": "저가 커피 프랜차이즈",
      "store_spec": "1층 · 10평 (33.06㎡) · 좌석 16석",
      "store_floor": "1층",
      "store_pyeong": 10,
      "initial_cost": {
        "total_manwon": 24000,
        "label": "2억 4,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "5,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "1억 9,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 3050,
        "label": "월 평균 3,050만 원"
      },
      "profit": {
        "label": "월 약 952만 원",
        "avg_manwon": 952,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 3.97%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            550,
            550
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            300,
            300
          ]
        },
        {
          "label": "제세공과금·관리",
          "unit": "manwon",
          "amount": [
            100,
            100
          ]
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            30,
            30
          ]
        },
        {
          "label": "배달 수수료",
          "unit": "manwon",
          "amount": [
            50,
            50
          ]
        }
      ],
      "points": [
        "역세권 상권의 1층 10평 매장으로, 주변 경쟁업체 입점이 완료된 자리입니다",
        "2020년 신규 오픈 후 2022년 1월 양수·2024년 4월 인수한 매장이며 시설 인테리어 등급은 A입니다",
        "배달 비중이 5% 미만으로, 쿠팡이츠만 운영하고 최소 주문 금액은 12,000원입니다",
        "키오스크 1대를 운영하고 있으며 머신기·제빙기는 교체 예정입니다",
        "평일·주말 모두 총 4명이 근무하고, 점주는 평일 11:30~22:00에 매장을 지킵니다",
        "계약 기간은 2년이며 관리비는 없습니다. 전기·수도 요금은 월 100만 원 수준으로 제세공과금 항목에 포함해 정리했습니다",
        "프랜차이즈 합계금 1,300만 원은 초기 인수 비용과 별도로 표시되어 있습니다 (세부 항목은 상담에서 확인)",
        "양도 사유는 거주지 이전(결혼)입니다",
        "상세 지출 내역과 실제 위치는 상담에서 안내합니다"
      ],
      "check_note": "점주 제시 총경비 2,098만 원은 재료비 35%(약 1,068만 원)·인건비 550만 원·매장 고정비 300만 원·제세공과금 100만 원·기타잡비 30만 원·배달 수수료 50만 원을 합한 금액입니다. 배달 비중이 5% 미만인 홀 중심 매장이므로, 최근 월별 매출 추이와 평일·주말 인력 운영표, 시설 등급 A인 내부 상태를 실사에서 확인하세요.",
      "keywords": [
        "서울",
        "강동",
        "강동구",
        "역세권",
        "카페",
        "메가커피",
        "홀",
        "키오스크",
        "1층"
      ],
      "visible": true
    },
    {
      "id": "ap-011",
      "code": "AP-011",
      "status": "live",
      "region": "충남",
      "district": "천안시 서북구",
      "area": "충남 천안시 서북구 핵심 상권",
      "area_note": "핵심 상권 · 매일 14:00~02:00 (월 1~2회 휴무)",
      "category": "치킨",
      "brand": "교촌치킨",
      "brand_note": "치킨 프랜차이즈",
      "store_spec": "1층 · 30평 (99.17㎡) · 4인 테이블 5개 (20석)",
      "store_floor": "1층",
      "store_pyeong": 30,
      "initial_cost": {
        "total_manwon": 27000,
        "label": "2억 7,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "2,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2억 5,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 9980,
        "label": "월 평균 9,980만 원"
      },
      "profit": {
        "label": "월 약 2,050만 원",
        "avg_manwon": 2050,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 7.59%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            50.0,
            50.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            1200,
            1200
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            110,
            110
          ]
        },
        {
          "label": "제세공과금·관리",
          "unit": "manwon",
          "amount": [
            130,
            130
          ]
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            500,
            500
          ]
        },
        {
          "label": "배달 수수료",
          "unit": "manwon",
          "amount": [
            1000,
            1000
          ]
        }
      ],
      "points": [
        "핵심 상권 1층 30평 매장으로 150수 이상 판매되는 매장입니다",
        "2018년 신규 오픈 후 2020년 6월 확장 이전, 2024년 10월 8일 인수한 매장이며 시설 인테리어 등급은 AAA입니다",
        "홀 비중 10%로 주류를 찾는 손님이 많고, 배달 비중은 90%입니다",
        "매니저 1명(주 5일 근무·월·화 휴무)과 주방·홀 인력이 근무하고, 점주는 월·화 풀근무와 금·토·일 밤 마감을 맡습니다",
        "4인 테이블 5개(20석) 규모이며 영업시간은 매일 14:00~02:00, 월 1~2회 휴무입니다",
        "계약 기간은 5년이며 점포 사용료 변동은 없습니다",
        "교육비 355만 원은 초기 인수 비용과 별도입니다",
        "상세 지출 내역과 실제 위치는 상담에서 안내합니다"
      ],
      "check_note": "점주 제시 총경비 7,930만 원은 재료비 50%(약 4,990만 원)·인건비 1,200만 원·매장 고정비 110만 원·제세공과금 130만 원·기타잡비 500만 원·배달 수수료 1,000만 원을 합한 금액입니다. 매출의 대부분이 배달에서 나오는 구조이므로, 배달 채널별 수수료율과 최근 월별 배달 매출 추이, 심야 영업 인력표를 실사에서 확인하세요.",
      "keywords": [
        "충남",
        "천안",
        "서북구",
        "치킨",
        "교촌",
        "배달",
        "홀",
        "프랜차이즈",
        "심야"
      ],
      "visible": true
    },
    {
      "id": "ap-012",
      "code": "AP-012",
      "status": "live",
      "region": "경기",
      "district": "평택시",
      "area": "경기 평택시 학군·주거 상권",
      "area_note": "학군·주거 수요 상권 · 매일 08:30~21:00",
      "category": "카페",
      "brand": "메가커피",
      "brand_note": "저가 커피 프랜차이즈",
      "store_spec": "1층 · 25평 (82.65㎡) · 18테이블 (4인 12~14 / 2인 3~5)",
      "store_floor": "1층",
      "store_pyeong": 25,
      "initial_cost": {
        "total_manwon": 23000,
        "label": "2억 3,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "5,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "1억 8,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 3211,
        "label": "월 평균 3,211만 원"
      },
      "profit": {
        "label": "월 약 1,071만 원",
        "avg_manwon": 1071,
        "note": "점주 제시 자료 기준 · 초기 인수 비용 대비 월 4.66%"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.0,
            35.0
          ]
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            600,
            600
          ]
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            241,
            241
          ]
        },
        {
          "label": "제세공과금·관리",
          "unit": "manwon",
          "amount": [
            85,
            85
          ]
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            30,
            30
          ]
        },
        {
          "label": "배달 수수료",
          "unit": "manwon",
          "amount": [
            60,
            60
          ]
        }
      ],
      "points": [
        "학군·주거 수요가 있는 1층 25평 매장으로, 넓은 평수에서 홀 중심으로 운영됩니다",
        "2021년 10월 신규 오픈 후 2025년 6월 인수한 매장이며 시설 인테리어 등급은 AAAA입니다",
        "테이블은 18개(4인 12~14·2인 3~5)이고 영업시간은 매일 08:30~21:00입니다",
        "배달 비중은 2025년 기준 약 10%이고, 배달관리비로 월 60만 원이 나갑니다",
        "점주는 평일 2.5시간·토요일 4시간 참여하고, 인력은 오픈 1명·마감 1명·기타 1명에 인건비 월 600만 원입니다 (일요일 휴무 표기)",
        "머신기 등 시설 상태가 좋고 매출·운영 관리가 편한 구조입니다",
        "계약 기간은 2년이며 점포 사용료 변동은 없습니다",
        "양도 사유는 원본 자료에 기재되어 있지 않아 상담에서 안내합니다",
        "상세 지출 내역과 실제 위치는 상담에서 안내합니다"
      ],
      "check_note": "점주 제시 총경비 2,140만 원은 재료비 35%(약 1,124만 원)·인건비 600만 원·매장 고정비 241만 원·제세공과금 85만 원·기타잡비 30만 원·배달 수수료 60만 원을 합한 금액입니다. 점주 참여 시간이 짧은 구조이므로, 실제 인력 운영표와 일요일 휴무 여부, 최근 월별 매출 추이를 실사에서 확인하세요.",
      "keywords": [
        "경기",
        "평택",
        "학군",
        "주거",
        "카페",
        "메가커피",
        "홀",
        "대형평수",
        "1층"
      ],
      "visible": true
    }
  ];

  var state = {
    listings: [],
    filters: { q: '', region: '', category: '', budget: '', metro: false, profitMin: 0 },
    chips: { region: '', budget: '' },
    lastFocus: null,
    currentListing: null,
    modalView: 'detail',
    usingFallback: false,
    lead: null,
    gatePending: null,
    gateContext: null,
    lastCriteria: null,
    lastMatches: null,
    compare: [],
    compareStores: []
  };

  /* ---------------- utils ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function comma(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function manwonLabel(m) {
    m = Math.round(Number(m) || 0);
    if (m >= 10000) {
      var eok = Math.floor(m / 10000);
      var rest = m % 10000;
      return eok + '억' + (rest ? ' ' + comma(rest) + '만' : '') + ' 원';
    }
    return comma(m) + '만 원';
  }

  /* ---- 지출 항목 --------------------------------------------------------
     재료비는 매출 대비 비율(%), 인건비·매장 고정비·기타잡비는 만 원 금액으로
     저장합니다. 예전처럼 비율만 있는 데이터도 읽을 수 있게 금액을 계산해 둡니다.
     ---------------------------------------------------------------------- */
  var EXP_LABEL_ALIAS = { '배달·기타': '기타잡비', '배달·본사 비용': '기타잡비', '기타': '기타잡비' };

  function pctRangeText(p) {
    var a = Math.round((Number(p && p[0]) || 0) * 10) / 10;
    var b = Math.round(((p && p[1] != null ? p[1] : p && p[0]) || 0) * 10) / 10;
    return a === b ? String(a) : a + '~' + b;
  }

  function manwonRangeLabel(a, b) {
    a = Math.round(Number(a) || 0);
    b = Math.round(Number(b) || 0);
    if (!a && !b) return '';
    if (!b) b = a;
    var lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo === hi) return manwonLabel(lo);
    if (hi < 10000) return comma(lo) + '~' + comma(hi) + '만 원';
    return manwonLabel(lo) + '~' + manwonLabel(hi);
  }

  /* '480~560만 원' 같은 문자열에서 금액 범위를 읽는다. */
  function amountRange(value) {
    if (value == null) return null;
    if (typeof value === 'number') return [value, value];
    if (value instanceof Array) {
      var a0 = Number(value[0]) || 0;
      var b0 = Number(value[1]);
      return [a0, isNaN(b0) ? a0 : b0];
    }
    function parsePart(part) {
      var p = String(part || '').replace(/[,\s]/g, '');
      var total = 0, found = false;
      var eok = p.match(/([0-9]+(?:\.[0-9]+)?)억/);
      if (eok) { total += parseFloat(eok[1]) * 10000; found = true; p = p.replace(eok[0], ''); }
      var man = p.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (man) { total += parseFloat(man[1]); found = true; }
      return found ? total : NaN;
    }
    var parts = String(value).split('~');
    var a = parsePart(parts[0]);
    var b = parts.length > 1 ? parsePart(parts[1]) : a;
    if (isNaN(a)) return null;
    if (isNaN(b)) b = a;
    return [a, b];
  }

  function normalizeExpense(L, ex) {
    if (!ex || typeof ex !== 'object') return ex;
    var label = String(ex.label || '').trim();
    if (EXP_LABEL_ALIAS[label]) label = EXP_LABEL_ALIAS[label];
    ex.label = label;
    var sales = (L.monthly_sales && L.monthly_sales.avg_manwon) || 0;
    var isMat = /재료/.test(label);
    if (ex.unit !== 'pct' && ex.unit !== 'manwon') ex.unit = isMat ? 'pct' : 'manwon';

    var pct = null;
    if (ex.pct instanceof Array) pct = [Number(ex.pct[0]) || 0, Number(ex.pct[1] != null ? ex.pct[1] : ex.pct[0]) || 0];
    var amt = amountRange(ex.amount);
    if (!amt) amt = amountRange(ex.range);

    if (ex.unit === 'pct') {
      if (!pct) pct = [0, 0];
      if (!amt && sales) amt = [sales * pct[0] / 100, sales * pct[1] / 100];
      ex.pct = pct;
    } else {
      if (!amt) amt = (pct && sales) ? [sales * pct[0] / 100, sales * pct[1] / 100] : [0, 0];
      ex.pct = pct || (sales ? [amt[0] / sales * 100, amt[1] / sales * 100] : [0, 0]);
    }
    if (amt) ex.amount = amt;
    if (!ex.range) ex.range = amt ? manwonRangeLabel(amt[0], amt[1]) : '상담 시 안내';
    return ex;
  }

  /* 월 매출 대비 비중(%) — 막대 길이와 추론 로직에 쓴다. */
  function expensePct(L, ex) {
    var sales = (L.monthly_sales && L.monthly_sales.avg_manwon) || 0;
    if (ex.unit === 'pct' && ex.pct) return [Number(ex.pct[0]) || 0, Number(ex.pct[1] != null ? ex.pct[1] : ex.pct[0]) || 0];
    var amt = ex.amount || amountRange(ex.range);
    if (amt && sales) return [amt[0] / sales * 100, (amt[1] || amt[0]) / sales * 100];
    return ex.pct ? [Number(ex.pct[0]) || 0, Number(ex.pct[1] != null ? ex.pct[1] : ex.pct[0]) || 0] : [0, 0];
  }

  function expenseAmountText(L, ex) {
    var amt = ex.amount || amountRange(ex.range);
    if (amt) return '약 ' + manwonRangeLabel(amt[0], amt[1]);
    var sales = (L.monthly_sales && L.monthly_sales.avg_manwon) || 0;
    var p = expensePct(L, ex);
    if (sales && p[1]) return '약 ' + manwonRangeLabel(sales * p[0] / 100, sales * p[1] / 100);
    return '상담 시 안내';
  }

  function budgetBand(manwon) {
    if (manwon < 10000) return 'under1';
    if (manwon < 20000) return '1';
    if (manwon < 30000) return '2';
    return 'over3';
  }
  function bandLabel(band) {
    return { under1: '1억 미만', '1': '1억대', '2': '2억대', over3: '3억 이상' }[band] || '';
  }

  /* ---- 매장 규모 · 한줄평 ---------------------------------------------
     store_spec 은 '1층 · 13평', area_note 는 특징·한줄평 문장이다.
     비어 있는 기본값('상담 시 안내')은 화면에서 숨긴다.
     ---------------------------------------------------------------------- */
  function storeSpecText(L) {
    var s = String((L && L.store_spec) || '').trim();
    return (s && s !== '상담 시 안내') ? s : '';
  }
  function storeNoteText(L) {
    var s = String((L && L.area_note) || '').trim();
    return (s && s !== '상담 시 상권 설명') ? s : '';
  }
  function storeLineText(L) {
    return [storeSpecText(L), storeNoteText(L)].filter(Boolean).join(' · ') || '상담 시 안내';
  }

  /* 공개 사이트는 순화된 지출 항목 이름을 쓴다. (관리자 화면에서만 임대료·점포 사용료를 안내) */
  var EXPENSE_DESC = { '기타잡비': '공과금·일반관리비 등' };
  function expenseLabelHTML(label) {
    var name = String(label || '');
    var desc = EXPENSE_DESC[name];
    return esc(name) + (desc ? '<em>(' + esc(desc) + ')</em>' : '');
  }

  var toastTimer = null;
  function toast(message) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3600);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  function copyKakao() {
    copyText(KAKAO_ID).then(function () {
      toast('카카오톡 ID ' + KAKAO_ID + ' 를 복사했어요. 카카오톡 친구 검색에서 찾아 메시지를 보내 주세요.');
    }).catch(function () {
      toast('카카오톡 ID는 ' + KAKAO_ID + ' 입니다. 친구 검색에서 찾아 메시지를 보내 주세요.');
    });
  }

  /* ---------------- 4항목 손님 DB (lead gate) ---------------- */
  function lockIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" class="lock-ico"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  }
  function checkIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function readLead() {
    if (state.lead) return state.lead;
    var lead = null;
    try { lead = safeParse(sessionStorage.getItem(LEAD_SESSION_KEY)); } catch (e) { lead = null; }
    if (!lead) { try { lead = safeParse(localStorage.getItem(LEAD_STORAGE_KEY)); } catch (e2) { lead = null; } }
    if (lead && lead.contact && lead.contact.phone) state.lead = lead;
    return state.lead;
  }

  function hasLead() { return !!readLead(); }

  /* 접수 기록만 관리자 목록(손님 DB)에 쌓고 현재 방문자 상태(잠금 해제)는 건드리지 않습니다. */
  function recordLeadEntry(payload) {
    try {
      var all = safeParse(localStorage.getItem(LEAD_ALL_KEY));
      if (!(all instanceof Array)) all = [];
      all = all.filter(function (x) { return x && x.lead_id !== payload.lead_id; });
      all.unshift(payload);
      localStorage.setItem(LEAD_ALL_KEY, JSON.stringify(all.slice(0, 300)));
    } catch (e3) { /* 무시 */ }
  }

  function saveLead(payload) {
    state.lead = payload;
    try { localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(payload)); } catch (e) { /* 저장 불가 환경 무시 */ }
    try { sessionStorage.setItem(LEAD_SESSION_KEY, JSON.stringify(payload)); } catch (e2) { /* 무시 */ }
    recordLeadEntry(payload);
    updateLeadStatus();
  }

  function clearLead() {
    state.lead = null;
    try { localStorage.removeItem(LEAD_STORAGE_KEY); } catch (e) { /* 무시 */ }
    try { sessionStorage.removeItem(LEAD_SESSION_KEY); } catch (e2) { /* 무시 */ }
    updateLeadStatus();
    refreshOpenModal();
  }

  function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }

  function leadStamp(d) {
    return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function leadId() {
    return 'LEAD-' + leadStamp(new Date()) + '-' + String(Math.floor(Math.random() * 9000) + 1000);
  }

  /* 손님 화면에 보이는 접수번호는 한글 접두어로 보여 줍니다.
     (텔레그램 웹훅·관리자 저장소가 읽는 lead_id · request_id 값은 그대로 둡니다) */
  function displayReceiptNo(id) {
    var s = String(id || '');
    var m = s.match(/^(LEAD|SELL|REQ)-(\d{4})(\d{2})(\d{2})-(\d+)$/);
    if (m) {
      var label = m[1] === 'LEAD' ? '상담' : m[1] === 'SELL' ? '양도' : '문의';
      return label + '-' + m[2] + '-' + m[3] + '-' + m[4] + '-' + m[5];
    }
    return s.replace(/^LEAD-/, '상담-').replace(/^SELL-/, '양도-').replace(/^REQ-/, '문의-');
  }

  function leadCriteriaText(c) {
    if (!c) return '';
    var parts = [];
    if ((c.category || []).length) parts.push(c.category.join('/'));
    if (c.brand_text) parts.push(c.brand_text);
    if ((c.area || []).length) parts.push(c.area.join('/'));
    if (c.budget) parts.push(c.budget);
    return parts.join(' · ');
  }

  /* 웹훅(Apps Script → 텔레그램)이 읽는 필수 필드
     : type · source · criteria · phone · stores · brand · region · monthly_sales · key_money
     - 손님 DB 접수: type 'lead', source 'site' | 'detail' | 'matching' | 'compare'
     - 내 매장 양도 의뢰: type 'sell_request', source 'sell' (brand · region · monthly_sales · key_money) */
  function buildLeadPayload(form, ctx) {
    function codeOfStore(s) { return s && s.code ? normalizeCode(s.code) : (s && s.id ? codeOf(s) : ''); }
    var now = new Date();
    var cats = (form.category || []).slice();
    var areas = (form.area || []).slice();
    var brandText = (form.brand || '').trim();
    var crit = {
      industry: cats.length ? cats.join('/') : brandText,
      category: cats,
      brand_text: brandText,
      region: areas.join('/'),
      area: areas,
      budget: form.budget || ''
    };
    var payload = {
      type: 'lead',
      form_version: 'lead-gate-v1',
      lead_id: leadId(),
      submitted_at: now.toISOString(),
      source: (ctx && ctx.source) || 'site',
      phone: form.phone,
      brand: brandText || crit.industry,
      region: crit.region,
      store: ctx && ctx.store
        ? {
            id: ctx.store.id,
            code: codeOfStore(ctx.store),
            label: storeLabel(ctx.store),
            area: ctx.store.area,
            brand: ctx.store.brand,
            category: ctx.store.category,
            url: adminListingUrl(ctx.store)
          }
        : null,
      criteria: crit,
      contact: {
        phone: form.phone,
        phone_digits: String(form.phone || '').replace(/[^0-9]/g, ''),
        consent: true,
        consent_at: now.toISOString()
      },
      page: location.href
    };
    if (ctx && ctx.stores && ctx.stores.length) {
      /* 텔레그램 알림에 문의 대상 매물의 고유번호와 관리자 페이지 링크가 실리도록
         문자열마다 '[AP-005] 우지커피 · 서울 서초구 주거상권 (https://…/admin.html?id=AP-005)' 형태로 적고,
         링크만 따로 담은 store_links 도 함께 보냅니다. (손님 화면·공유 링크는 ?id= 그대로) */
      payload.stores = ctx.stores.map(function (L) { return storeAlertLabel(L); });
      payload.store_codes = ctx.stores.map(function (L) { return codeOfStore(L); });
      payload.store_links = ctx.stores.map(function (L) { return adminListingUrl(L); });
    } else if (ctx && ctx.store) {
      payload.stores = [storeAlertLabel(ctx.store)];
      payload.store_codes = [codeOfStore(ctx.store)];
      payload.store_links = [adminListingUrl(ctx.store)];
    }
    return payload;
  }

  function queueLead(payload) {
    try {
      var q = safeParse(localStorage.getItem(LEAD_QUEUE_KEY));
      if (!(q instanceof Array)) q = [];
      q.push(payload);
      localStorage.setItem(LEAD_QUEUE_KEY, JSON.stringify(q.slice(-50)));
    } catch (e) { /* 무시 */ }
  }

  /* 구글 시트(Apps Script) · Formspree · 자체 웹훅 모두 JSON POST 로 받습니다.
     text/plain 은 CORS 사전요청(OPTIONS)을 만들지 않아 Apps Script가 그대로 e.postData.contents 로 받습니다.
     응답을 받지 못했을 때(네트워크·CORS 차단)만 no-cors 로 한 번 더 보내 전송을 보장합니다.
     서버가 응답한 경우에는 다시 보내지 않습니다(같은 접수가 두 번 알림되는 것을 막기 위해). */
  function sendLead(payload) {
    if (!LEAD_ENDPOINT) { queueLead(payload); return Promise.resolve({ sent: false, reason: 'no-endpoint' }); }
    var body = JSON.stringify(payload);
    return fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    }).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) return { sent: true };
      var e = new Error('HTTP ' + (res ? res.status : '?'));
      e.received = true;   // 서버가 응답한 경우 — 다시 보내면 같은 접수가 두 번 알림될 수 있음
      throw e;
    }).catch(function (err) {
      if (err && err.received) {
        queueLead(payload);
        return { sent: false, reason: String(err.message || err) };
      }
      return fetch(LEAD_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body
      }).then(function () {
        return { sent: true, transport: 'no-cors' };
      }).catch(function (err2) {
        queueLead(payload);
        return { sent: false, reason: String((err2 && err2.message) || (err && err.message) || err2 || err) };
      });
    });
  }

  function formatPhone(v) {
    var d = String(v || '').replace(/[^0-9]/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length < 11) return d.slice(0, 3) + '-' + d.slice(3, d.length - 4) + '-' + d.slice(d.length - 4);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }

  function updateLeadStatus() {
    var bar = $('#leadStatus');
    if (!bar) return;
    var lead = readLead();
    if (!lead) { bar.hidden = true; return; }
    bar.hidden = false;
    var line = $('#leadStatusLine');
    if (line) {
      var text = leadCriteriaText(lead.criteria);
      if (lead.contact && lead.contact.phone) text += (text ? ' · ' : '') + lead.contact.phone;
      line.textContent = text ? '· ' + text : '';
    }
  }

  /* ---------------- gate: 폼 · 성공 · 보기 화면 ---------------- */
  function gateChipsHTML(values, group, multi) {
    return '<div class="chips gate-chips" data-group="' + group + '" role="group" aria-label="' +
      (group === 'category' ? '희망 업종' : group === 'area' ? '희망 지역' : '가용 예산') + '"' +
      (multi ? '' : ' data-single="1"') + '>' +
      values.map(function (v) {
        return '<button type="button" class="chip" data-value="' + esc(v) + '" aria-pressed="false">' + esc(v) + '</button>';
      }).join('') +
      '</div>';
  }

  function gateFormHTML(ctx) {
    var sub = ctx && ctx.store
      ? esc(ctx.store.area + ' · ' + ctx.store.brand) + '의 상세 지출 구성과 인력 운영 포인트를 확인합니다.'
      : (ctx && ctx.source === 'compare' && ctx.stores && ctx.stores.length)
        ? '선택한 점포 ' + ctx.stores.length + '곳의 비교 상담을 준비합니다.'
        : '조건에 맞는 후보의 매칭 이유와 상세 내용을 바로 확인합니다.';
    return '' +
      '<div class="gate-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>상세 비용 확인 · 4가지 입력</p>' +
        '<h3 id="gateTitle">4가지만 남기면 바로 열립니다</h3>' +
        '<p>' + sub + '</p>' +
        '<ol class="gate-steps">' +
          '<li><b>①</b><span>업종·브랜드</span></li>' +
          '<li><b>②</b><span>지역</span></li>' +
          '<li><b>③</b><span>예산</span></li>' +
          '<li><b>④</b><span>연락처</span></li>' +
        '</ol>' +
      '</div>' +
      '<div class="gate-body">' +
        '<form id="leadForm" novalidate>' +
          '<div class="gate-field">' +
            '<div class="gate-legend"><span class="g-num">01</span><b>희망 업종 / 브랜드</b><em>복수 선택 가능</em></div>' +
            gateChipsHTML(LEAD_CATEGORY_CHIPS, 'category', true) +
            '<input class="gate-input" id="leadBrand" type="text" autocomplete="off" maxlength="40" placeholder="브랜드명 직접 입력 (예: 메가커피) — 선택" />' +
          '</div>' +
          '<div class="gate-field">' +
            '<div class="gate-legend"><span class="g-num">02</span><b>희망 지역</b><em>복수 선택 가능</em></div>' +
            gateChipsHTML(LEAD_AREA_CHIPS, 'area', true) +
          '</div>' +
          '<div class="gate-field">' +
            '<div class="gate-legend"><span class="g-num">03</span><b>가용 예산</b><em>초기 인수 비용 기준</em></div>' +
            gateChipsHTML(LEAD_BUDGET_CHIPS, 'budget', false) +
          '</div>' +
          '<div class="gate-field">' +
            '<div class="gate-legend"><span class="g-num">04</span><b>연락처</b><em>휴대폰 번호</em></div>' +
            '<input class="gate-input" id="leadPhone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="13" placeholder="010-0000-0000" />' +
            '<label class="consent gate-consent"><input type="checkbox" id="leadConsent" />' +
              '<span><b>(필수)</b> 상담 안내를 위한 휴대폰 번호 수집·이용에 동의합니다. 번호는 상담 목적으로만 사용합니다.</span></label>' +
          '</div>' +
          '<p class="gate-error" id="gateError" hidden></p>' +
          '<div class="gate-actions">' +
            '<button type="submit" class="btn btn-gold btn-lg">입력하고 잠금 해제</button>' +
            '<button type="button" class="btn btn-quiet" data-close-gate>나중에</button>' +
          '</div>' +
          '<p class="gate-foot">한 번 입력하면 이 브라우저에서는 다시 묻지 않습니다.</p>' +
        '</form>' +
      '</div>';
  }

  /* stores 항목은 문자열('지역 브랜드')과 객체({area, brand}) 둘 다 올 수 있습니다.
     텔레그램 전송용으로 붙은 링크 '(https://…/?id=AP-005)' 는 화면에서 띄어 냅니다. */
  function storeName(s) {
    if (!s) return '';
    if (typeof s === 'string') return s.replace(/\s*\(https?:\/\/[^)]*\)\s*$/, '').trim();
    return ((s.area || '') + ' ' + (s.brand || '')).trim();
  }

  function gateSummaryRows(payload) {
    var c = payload.criteria || {};
    var ct = payload.contact || {};
    var rows = [
      ['① 업종·브랜드', [(c.category || []).join(', '), c.brand_text].filter(Boolean).join(' · ') || '-'],
      ['② 희망 지역', (c.area || []).join(', ') || '-'],
      ['③ 가용 예산', c.budget || '-'],
      ['④ 연락처', (ct.phone || '-') + (ct.consent ? '  (동의 완료)' : '')]
    ];
    if (payload.stores && payload.stores.length) {
      var storeRowLabel = payload.source === 'detail' ? '조회 점포'
        : payload.source === 'matching' ? '매칭 후보' : '비교 점포';
      rows.push([storeRowLabel, payload.stores.map(storeName).join(' / ')]);
    }
    return rows.map(function (r) {
      return '<div><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>';
    }).join('');
  }

  /* 내 입력 정보 다시 보기 화면. 손님에게는 입력한 4항목과 접수번호만 요약해 보여 줍니다. */
  function gateSuccessHTML(payload, isView) {
    var sourceLabel = payload.source === 'detail' ? '상세 보기 잠금 해제'
      : payload.source === 'matching' ? '맞춤 매칭 잠금 해제'
      : payload.source === 'compare' ? '비교 상담 신청' : '4항목 접수';
    return '' +
      '<div class="gate-hero">' +
        '<h3 id="gateTitle">저장된 4항목 정보</h3>' +
        '<p>이 브라우저에 저장된 입력값입니다. 아래 <b>조건 다시 입력</b>을 누르면 상세 내용이 다시 잠깁니다.</p>' +
      '</div>' +
      '<div class="gate-body">' +
        '<div class="gate-receipt">' +
          '<div class="gate-receipt-head">' +
            '<span class="receipt-icon">' + checkIcon() + '</span>' +
            '<div><strong>접수번호 ' + esc(displayReceiptNo(payload.lead_id)) + '</strong><span>' + esc(sourceLabel) + '</span></div>' +
          '</div>' +
          '<div class="receipt-summary">' + gateSummaryRows(payload) + '</div>' +
        '</div>' +
        '<p class="gate-foot">접수 내용은 이 브라우저에 저장되고 담당자에게도 전달됩니다. 남겨주신 번호로 김현율 팀장이 바로 확인합니다.</p>' +
        '<div class="gate-actions">' +
          '<button type="button" class="btn btn-navy btn-lg" data-close-gate>닫기</button>' +
          '<button type="button" class="btn btn-quiet" data-gate-restart>조건 다시 입력</button>' +
        '</div>' +
      '</div>';
  }

  function renderGate(html) {
    var body = $('#gateBody');
    if (body) body.innerHTML = html;
  }

  function initGateFormState(ctx) {
    gateFormState = { category: [], area: [], budget: '', brand: '' };
    var c = ctx && ctx.criteria;
    if (!c) return;
    if (c.category) {
      var cat = String(c.category);
      gateFormState.category = LEAD_CATEGORY_CHIPS.indexOf(cat) !== -1 ? [cat] : ['기타'];
    }
    if (c.region && LEAD_AREA_CHIPS.indexOf(c.region) !== -1) gateFormState.area = [c.region];
    if (c.budget && LEAD_BUDGET_CHIPS.indexOf(c.budget) !== -1) gateFormState.budget = c.budget;
  }

  function applyGateFormState() {
    var body = $('#gateBody');
    if (!body) return;
    $all('.gate-chips', body).forEach(function (group) {
      var key = group.getAttribute('data-group');
      var val = gateFormState[key];
      $all('.chip', group).forEach(function (chip) {
        var v = chip.getAttribute('data-value');
        var on = key === 'budget' ? (val === v) : (val || []).indexOf(v) !== -1;
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  }

  function openGatePanel() {
    if (!gateEl) gateEl = $('#leadGate');
    if (!gateEl) return;
    gateReturnFocus = document.activeElement;
    gateOpen = true;
    gateEl.hidden = false;
    document.body.classList.add('gate-open');
    var panel = $('.gate-panel', gateEl);
    if (panel) { panel.scrollTop = 0; panel.focus({ preventScroll: true }); }
  }

  function closeGate() {
    if (!gateEl) return;
    gateEl.hidden = true;
    gateOpen = false;
    document.body.classList.remove('gate-open');
    renderGate('');
    if (gateReturnFocus && gateReturnFocus.focus) {
      try { gateReturnFocus.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
    }
    gateReturnFocus = null;
  }

  function openGate(mode, opts) {
    gateEl = gateEl || $('#leadGate');
    if (!gateEl) return;
    opts = opts || {};
    if (mode === 'view') {
      var saved = readLead();
      if (!saved) mode = 'form';
      else {
        renderGate(gateSuccessHTML(saved, true));
        openGatePanel();
        bindGateBody();
        return;
      }
    }
    state.gatePending = opts.pending || null;
    state.gateContext = opts.context || { source: 'site' };
    initGateFormState(state.gateContext);
    renderGate(gateFormHTML(state.gateContext));
    applyGateFormState();
    openGatePanel();
    bindGateBody();
  }

  function onGateSubmit(e) {
    e.preventDefault();
    var ctx = state.gateContext || { source: 'site' };
    var body = $('#gateBody');
    var brandEl = $('#leadBrand', body);
    var phoneEl = $('#leadPhone', body);
    var consentEl = $('#leadConsent', body);
    var err = $('#gateError', body);

    gateFormState.brand = brandEl ? brandEl.value : '';
    var phone = formatPhone(phoneEl ? phoneEl.value : '');
    if (phoneEl) phoneEl.value = phone;
    var digits = phone.replace(/[^0-9]/g, '');

    var problem = '';
    if (!gateFormState.category.length && !gateFormState.brand.trim()) problem = '① 희망 업종이나 브랜드를 하나 이상 선택해 주세요.';
    else if (!gateFormState.area.length) problem = '② 희망 지역을 하나 이상 선택해 주세요.';
    else if (!gateFormState.budget) problem = '③ 가용 예산 구간을 선택해 주세요.';
    else if (!(digits.length >= 10 && /^01[016789]/.test(digits))) problem = '④ 휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)';
    else if (!consentEl || !consentEl.checked) problem = '④ 번호 수집·이용에 동의해 주세요.';

    if (problem) {
      if (err) { err.textContent = problem; err.hidden = false; }
      return;
    }
    if (err) err.hidden = true;

    var payload = buildLeadPayload({
      category: gateFormState.category,
      brand: gateFormState.brand,
      area: gateFormState.area,
      budget: gateFormState.budget,
      phone: phone
    }, ctx);

    /* 접수 내용은 이 브라우저에 저장하고 담당자 알림은 백그라운드로 보냅니다(실패하면 큐에 보관).
       접수증·JSON 코드 같은 중간 단계 없이 게이트를 바로 닫고, 요청했던 상세/매칭 결과를 즉시 보여 줍니다. */
    saveLead(payload);
    sendLead(payload);

    var pending = state.gatePending;
    state.gatePending = null;
    var isCompare = !!(pending && pending.type === 'compare');
    closeGate();
    if (pending && pending.type === 'match' && pending.criteria) {
      respond(pending.criteria);
    } else if (pending && pending.type === 'detail') {
      refreshOpenModal();
    } else if (isCompare) {
      /* 모달이 닫히면 전화·문자 버튼을 볼 수 없으므로 비교 상담은 완료 안내를 보여 줍니다. */
      openCompareReceipt(pending.stores || []);
    }
    toast(isCompare
      ? '비교 상담 신청이 접수되었습니다. 담당자가 바로 확인합니다.'
      : '잠금이 해제되었습니다.');
  }

  function bindGateBody() {
    var body = $('#gateBody');
    if (!body) return;

    $all('[data-close-gate]', body).forEach(function (btn) {
      btn.addEventListener('click', closeGate);
    });

    $all('.gate-chips', body).forEach(function (group) {
      var key = group.getAttribute('data-group');
      var single = group.getAttribute('data-single') === '1';
      group.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        var value = chip.getAttribute('data-value');
        if (single) {
          var wasOn = chip.getAttribute('aria-pressed') === 'true';
          $all('.chip', group).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
          gateFormState.budget = wasOn ? '' : value;
          if (!wasOn) chip.setAttribute('aria-pressed', 'true');
        } else {
          var on = chip.getAttribute('aria-pressed') !== 'true';
          chip.setAttribute('aria-pressed', on ? 'true' : 'false');
          var arr = gateFormState[key] || [];
          var idx = arr.indexOf(value);
          if (on && idx === -1) arr.push(value);
          if (!on && idx !== -1) arr.splice(idx, 1);
          gateFormState[key] = arr;
        }
      });
    });

    var phone = $('#leadPhone', body);
    if (phone) {
      phone.addEventListener('input', function () {
        var atEnd = phone.selectionStart === phone.value.length;
        phone.value = formatPhone(phone.value);
        if (atEnd) { try { phone.setSelectionRange(phone.value.length, phone.value.length); } catch (e) { /* 무시 */ } }
      });
    }

    var restart = $('[data-gate-restart]', body);
    if (restart) {
      restart.addEventListener('click', function () {
        clearLead();
        state.gatePending = null;
        var ctx = state.gateContext || { source: 'site' };
        initGateFormState(ctx);
        renderGate(gateFormHTML(ctx));
        applyGateFormState();
        bindGateBody();
        var panel = $('.gate-panel', gateEl);
        if (panel) panel.scrollTop = 0;
      });
    }

    var form = $('#leadForm', body);
    if (form) form.addEventListener('submit', onGateSubmit);
  }

  function initGateGlobal() {
    gateEl = $('#leadGate');
    if (!gateEl) return;
    $all('[data-close-gate]', gateEl).forEach(function (el) {
      el.addEventListener('click', closeGate);
    });
  }

  function initLeadStatus() {
    $all('#leadStatus [data-reset-lead]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearLead();
        toast('4항목 입력을 초기화했습니다. 상세 내용이 다시 잠깁니다.');
      });
    });
  }

  /* ---------------- data ---------------- */
  /* 예상 순수익은 평균치 한 값으로 다룬다. 범위가 아닌 한 값짜리 표기에는 '약'을 붙여 평균임을 드러낸다
     (관리자·CSV에서 평균치 하나로 등록한 점포도, 예전 범위 표기 점포도 같은 방식으로 표시된다). */
  function normalizeProfit(L) {
    var p = (L.profit && typeof L.profit === 'object') ? L.profit : null;
    if (!p) {
      var seed = (typeof L.profit === 'number') ? L.profit : 0;
      p = { avg_manwon: seed };
    }
    L.profit = p;
    var label = String(p.label || '').trim();
    var avg = Number(p.avg_manwon);
    if (!(avg > 0)) {
      var nums = (label.match(/[0-9][0-9,]*(?:\.[0-9]+)?/g) || [])
        .map(function (s) { return parseFloat(s.replace(/,/g, '')); })
        .filter(function (n) { return !isNaN(n) && n > 0; });
      if (nums.length) avg = Math.round(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length);
    }
    if (!label && avg > 0) label = '월 ' + comma(avg) + '만 원';
    if (label && !/~/.test(label) && !/약/.test(label)) {
      label = /^월\s*/.test(label) ? label.replace(/^월\s*/, '월 약 ') : '약 ' + label;
    }
    p.label = label;
    if (avg > 0) p.avg_manwon = avg;
    if (!p.note) p.note = '점주 제시 자료 기준';
    return p;
  }

  /* ---- 매물 고유번호 ---------------------------------------------------
     자료마다 붙는 공개 번호입니다. id(내부 키)와 달리 사람이 읽고 부르는 값이라
     카드·상세·비교·AI 매칭·텔레그램 알림에 'No. AP-001' 형태로 함께 표시합니다.
     'AP-005' · 'ap5' · '005' 처럼 적어도 같은 번호로 읽습니다.
     ---------------------------------------------------------------------- */
  function normalizeCode(v, fallbackNumber) {
    var s = String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
    var m = s.match(/^AP-?0*([0-9]{1,4})$/);
    if (m) return 'AP-' + ('000' + m[1]).slice(-3);
    m = s.match(/^0*([0-9]{1,4})$/);
    if (m) return 'AP-' + ('000' + m[1]).slice(-3);
    var n = Number(fallbackNumber);
    if (!(n > 0)) return '';
    return 'AP-' + ('000' + n).slice(-3);
  }

  function codeOf(L, index) {
    if (!L) return '';
    var fromData = normalizeCode(L.code);
    if (fromData) return fromData;
    var idm = String(L.id || '').match(/([0-9]{1,4})$/);
    return normalizeCode('', idm ? Number(idm[1]) : index);
  }

  /* 알림·문자에 쓰는 점포 표기: '[AP-005] 우지커피 · 서울 서초구 주거상권' */
  function storeLabel(L) {
    if (!L) return '';
    var name = [L.brand, L.area].filter(Boolean).join(' · ');
    var code = codeOf(L);
    return (code ? '[' + code + '] ' : '') + name;
  }

  /* 텔레그램에서 눌러 바로 그 물건 상세 창이 열리는 주소(손님용).
     예: https://apchangup.com/?id=AP-005 */
  var SITE_BASE_URL = 'https://apchangup.com/';

  /* 관리자 확인용 링크 — 텔레그램 알림에서 누르면 관리자 페이지가 그 매장 카드로 열립니다.
     예: https://apchangup.com/admin.html?id=AP-005 */
  var ADMIN_BASE_URL = SITE_BASE_URL + 'admin.html';

  function listingUrl(L) {
    var code = codeOf(L);
    return SITE_BASE_URL + (code ? '?id=' + encodeURIComponent(code) : '');
  }

  function adminListingUrl(L) {
    var code = codeOf(L);
    return ADMIN_BASE_URL + (code ? '?id=' + encodeURIComponent(code) : '');
  }

  /* 알림(텔레그램) 전송용 표기 — 화면·문자에는 storeLabel 만 씁니다.
     '[AP-005] 우지커피 · 서울 서초구 주거상권 (https://…/admin.html?id=AP-005)' */
  function storeAlertLabel(L) {
    var label = storeLabel(L);
    if (!label) return '';
    return label + ' (' + adminListingUrl(L) + ')';
  }

  function normalize(list) {
    return (list || []).map(function (L, i) {
      L.keywords = L.keywords || [];
      L.points = L.points || [];
      L.code = codeOf(L, i + 1);
      L.profit = normalizeProfit(L);
      L.expenses = (L.expenses || []).map(function (ex) { return normalizeExpense(L, ex); });
      return L;
    });
  }

  /* 관리자 페이지(site/admin.html)에서 등록·수정·감춤한 점포는 이 키에 저장되고,
     사이트는 JSON 대신 이 목록을 우선 사용합니다. */
  var CATALOG_KEY = 'apPartnerCatalog';

  function readCatalog() {
    var cat = null;
    try { cat = safeParse(localStorage.getItem(CATALOG_KEY)); } catch (e) { cat = null; }
    if (cat && cat.listings instanceof Array) return cat.listings;
    return null;
  }

  function loadListings() {
    var managed = readCatalog();
    if (managed) {
      return Promise.resolve({ listings: normalize(managed), local: false, managed: true });
    }
    return fetch('data/listings.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        return { listings: normalize((json && json.listings) || []), local: false, managed: false };
      })
      .catch(function () {
        return { listings: normalize(FALLBACK || []), local: true, managed: false };
      });
  }

  /* ---------------------------------------------------------------------
     관심 점포 비교 담기 (최대 3곳) · 내 매장 양도 의뢰
     --------------------------------------------------------------------- */
  var COMPARE_KEY = 'apPartnerCompare';
  var SELL_KEY = 'apPartnerSellRequests';

  function findListingById(id) {
    return state.listings.filter(function (x) { return x.id === id; })[0] || null;
  }

  function loadCompare() {
    var arr = null;
    try { arr = safeParse(sessionStorage.getItem(COMPARE_KEY)); } catch (e) { arr = null; }
    if (arr instanceof Array) {
      state.compare = arr.filter(function (id) { return !!findListingById(id); }).slice(0, 3);
    } else {
      state.compare = [];
    }
  }

  function saveCompare() {
    try { sessionStorage.setItem(COMPARE_KEY, JSON.stringify(state.compare)); } catch (e) { /* 무시 */ }
  }

  function inCompare(id) { return state.compare.indexOf(id) !== -1; }

  function compareButtonHTML(L, compact) {
    var on = inCompare(L.id);
    return '<button type="button" class="compare-btn' + (on ? ' is-on' : '') + (compact ? ' compact' : '') + '"' +
      ' data-compare="' + esc(L.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
      ' aria-label="' + esc(L.area + ' ' + L.brand) + (on ? ' 비교에서 빼기' : ' 비교에 담기') + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" class="ico"><path d="M4 7h6M4 17h6M17 4v16M13 4h4M13 20h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '<span>' + (on ? '담김' : '비교 담기') + '</span>' +
      '</button>';
  }

  function toggleCompare(id) {
    var i = state.compare.indexOf(id);
    if (i !== -1) {
      state.compare.splice(i, 1);
      toast('비교에서 뺐습니다.');
    } else {
      if (state.compare.length >= 3) {
        toast('비교는 최대 3곳까지 담을 수 있습니다. 한 곳을 빼고 담아 주세요.');
        return;
      }
      state.compare.push(id);
      toast('비교에 담았습니다. (' + state.compare.length + '/3)');
    }
    saveCompare();
    renderCompareBar();
    renderListings();
    refreshOpenModal();
  }

  function renderCompareBar() {
    var bar = $('#compareBar');
    if (!bar) return;
    var n = state.compare.length;
    if (!n) {
      bar.hidden = true;
      document.body.classList.remove('compare-on');
      return;
    }
    bar.hidden = false;
    document.body.classList.add('compare-on');
    var count = $('#compareCount');
    if (count) count.textContent = String(n);
    var box = $('#compareChips');
    if (box) {
      box.innerHTML = state.compare.map(function (id) {
        var L = findListingById(id);
        if (!L) return '';
        return '<span class="compare-chip">' + esc(codeOf(L)) + ' · ' + esc(L.district || L.area) + ' · ' + esc(L.brand) +
          '<button type="button" data-compare-remove="' + esc(id) + '" aria-label="' + esc(L.brand) + ' 비교에서 빼기">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
          '</button></span>';
      }).join('');
    }
    var open = $('#compareOpen');
    if (open) {
      open.disabled = n < 2;
      open.textContent = n < 2 ? '한 곳 더 담아 주세요' : '나란히 비교 (' + n + '곳)';
    }
  }

  function compareHTML(stores) {
    var minCost = Math.min.apply(null, stores.map(function (L) { return L.initial_cost.total_manwon; }));
    var maxProfit = Math.max.apply(null, stores.map(function (L) { return L.profit.avg_manwon || 0; }));

    var head = '<tr><th scope="col"><span class="visually-hidden">비교 항목</span></th>' + stores.map(function (L) {
      return '<th scope="col"><span class="cmp-code">No. ' + esc(codeOf(L)) + '</span>' +
        '<span class="cmp-area">' + esc(L.area) + '</span><b>' + esc(L.brand) + '</b>' +
        '<span class="cmp-sub">' + esc(L.category) + '</span></th>';
    }).join('') + '</tr>';

    function row(label, cells) { return '<tr><th scope="row">' + label + '</th>' + cells + '</tr>'; }

    var cost = stores.map(function (L) {
      var best = L.initial_cost.total_manwon === minCost;
      return '<td><b class="' + (best ? 'cmp-best' : '') + '">' + esc(L.initial_cost.label) + '</b>' +
        (best ? '<span class="cmp-mark">비용 최저</span>' : '') +
        '<span class="cmp-sub">' + esc(bandLabel(budgetBand(L.initial_cost.total_manwon))) + ' 구간</span></td>';
    }).join('');

    var sales = stores.map(function (L) {
      return '<td><b>' + esc(L.monthly_sales.label.replace('월 평균 ', '')) + '</b>' +
        '<span class="cmp-sub">' + (L.monthly_sales.range ? esc(L.monthly_sales.range) + ' 범위' : '점주 제시 자료 기준') + '</span></td>';
    }).join('');

    var profit = stores.map(function (L) {
      var best = (L.profit.avg_manwon || 0) === maxProfit;
      return '<td><b class="' + (best ? 'cmp-best' : '') + '">' + esc(L.profit.label.replace('월 ', '')) + '</b>' +
        (best ? '<span class="cmp-mark">수익 최고</span>' : '') +
        '<span class="cmp-sub">' + esc(L.profit.note || '점주 제시 자료 기준') + '</span></td>';
    }).join('');

    var place = stores.map(function (L) {
      return '<td><b>' + esc(L.area) + '</b><span class="cmp-sub">정확한 위치는 상담에서 안내</span></td>';
    }).join('');

    var spec = stores.map(function (L) {
      var note = storeNoteText(L);
      return '<td><b>' + esc(storeSpecText(L) || '상담 시 안내') + '</b>' +
        (note ? '<span class="cmp-sub">' + esc(note) + '</span>' : '') + '</td>';
    }).join('');

    var check = stores.map(function (L) {
      return '<td class="cmp-text">' + esc(L.check_note || '상담에서 함께 확인합니다.') + '</td>';
    }).join('');

    return '' +
      '<div class="modal-hero compare-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>COMPARE · ' + stores.length + ' STORES</p>' +
        '<h3 id="compareTitle">담은 점포 ' + stores.length + '곳을 나란히 비교합니다</h3>' +
        '<p>표시 수치는 점주 제시 자료 기준입니다. 세부 원자료와 정확한 위치는 상담에서 확인하세요.</p>' +
      '</div>' +
      '<div class="modal-content">' +
        '<p class="compare-swipe">옆으로 넘기면 3곳을 함께 볼 수 있습니다</p>' +
        '<div class="compare-scroll">' +
          '<table class="compare-table">' +
            '<thead>' + head + '</thead>' +
            '<tbody>' +
              row('초기 인수 비용', cost) +
              row('월 평균 매출', sales) +
              row('예상 순수익', profit) +
              row('상권 · 위치', place) +
              row('매장 규모', spec) +
              row('확인할 점', check) +
            '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="compare-note">최저 비용·최고 수익은 표시된 값 기준으로만 비교한 결과입니다. 실제 조건은 인력 운영과 배달 비중에 따라 달라지므로, 상담에서 세 점포의 원자료를 함께 확인해 드립니다.</p>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-gold" type="button" data-compare-request>선택한 점포 한 번에 상담 신청</button>' +
          '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담 010-2885-5553</a>' +
          '<button class="btn btn-quiet" type="button" data-close-compare>닫기</button>' +
        '</div>' +
      '</div>';
  }

  function bindCompareBody() {
    var body = $('#compareBody');
    if (!body) return;
    $all('[data-close-compare]', body).forEach(function (b) { b.addEventListener('click', closeCompare); });
    var req = $('[data-compare-request]', body);
    if (req) req.addEventListener('click', function () {
      var stores = (state.compareStores || []).slice();
      if (!stores.length) return;
      closeCompare();
      openGate('form', {
        pending: { type: 'compare', stores: stores },
        context: { source: 'compare', stores: stores, criteria: null }
      });
    });
  }

  function openCompareReceipt(stores) {
    if (!modal) modal = $('#modal');
    var lead = readLead();
    var names = stores.map(function (L) { return storeLabel(L); });
    var smsBody = '[에이피파트너 비교 상담 신청]\n' + names.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n') +
      (lead && lead.contact ? '\n연락처: ' + lead.contact.phone : '');
    var smsHref = PHONE_SMS + '?body=' + encodeURIComponent(smsBody);

    state.currentListing = null;
    state.modalView = 'compareReceipt';
    state.lastFocus = document.activeElement;
    $('#modalBody').innerHTML = '' +
      '<div class="modal-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>REQUEST RECEIVED</p>' +
        '<h3 id="modalTitle">비교 상담 신청이 접수됐습니다</h3>' +
        '<p>' + stores.length + '곳을 한 번에 정리해 연락드립니다.</p>' +
      '</div>' +
      '<div class="modal-content">' +
        '<div class="receipt">' +
          '<div class="receipt-icon" aria-hidden="true">' + checkIcon() + '</div>' +
          '<h4>선택한 ' + stores.length + '곳으로 상담을 준비합니다</h4>' +
          '<div class="receipt-summary">' +
            stores.map(function (L) {
              return '<div><span>No. ' + esc(codeOf(L)) + ' ' + esc(L.area) + '</span><b>' + esc(L.brand) + ' · ' + esc(L.initial_cost.label) + '</b></div>';
            }).join('') +
            (lead && lead.contact ? '<div><span>연락처</span><b>' + esc(lead.contact.phone) + '</b></div>' : '') +
          '</div>' +
          '<div class="receipt-note"><b>다음 단계</b><br />선택한 ' + stores.length + '곳의 실사 일정과 비교 자료를 정리해 드립니다. 아래 <b>전화</b> 또는 <b>문자</b>로 연결하시면 김현율 팀장이 바로 확인합니다.</div>' +
          '<div class="form-actions">' +
            '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담</a>' +
            '<a class="btn btn-gold" href="' + smsHref + '">문자로 보내기</a>' +
            '<button class="btn btn-quiet" type="button" data-close-modal>닫기</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    modal.hidden = false;
    document.body.classList.add('modal-open');
    var panel = $('.modal-panel', modal);
    if (panel) { panel.scrollTop = 0; panel.focus({ preventScroll: true }); }
    bindModalBody();
  }

  function openCompare() {
    if (state.compare.length < 2) { toast('두 곳 이상 담아야 비교할 수 있습니다.'); return; }
    var cm = $('#compareModal');
    if (!cm) return;
    state.compareStores = state.compare.map(findListingById).filter(Boolean);
    $('#compareBody').innerHTML = compareHTML(state.compareStores);
    cm.hidden = false;
    document.body.classList.add('modal-open');
    var panel = $('.modal-panel', cm);
    if (panel) { panel.scrollTop = 0; panel.focus({ preventScroll: true }); }
    bindCompareBody();
  }

  function closeCompare() {
    var cm = $('#compareModal');
    if (!cm || cm.hidden) return;
    cm.hidden = true;
    $('#compareBody').innerHTML = '';
    if (modal && modal.hidden && (!gateEl || gateEl.hidden)) document.body.classList.remove('modal-open');
  }

  function initCompare() {
    loadCompare();
    renderCompareBar();
    var bar = $('#compareBar');
    if (bar) {
      bar.addEventListener('click', function (e) {
        var rm = e.target.closest('[data-compare-remove]');
        if (rm) { toggleCompare(rm.getAttribute('data-compare-remove')); return; }
      });
    }
    var clear = $('#compareClear');
    if (clear) clear.addEventListener('click', function () {
      state.compare = [];
      saveCompare();
      renderCompareBar();
      renderListings();
      refreshOpenModal();
      toast('비교 목록을 비웠습니다.');
    });
    var open = $('#compareOpen');
    if (open) open.addEventListener('click', openCompare);
    var cm = $('#compareModal');
    if (cm) $all('[data-close-compare]', cm).forEach(function (el) { el.addEventListener('click', closeCompare); });
  }

  /* ---------------- 내 매장 양도 의뢰 ---------------- */
  function sellFormHTML() {
    return '' +
      '<div class="modal-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>SELL YOUR STORE</p>' +
        '<h3 id="sellTitle">내 매장 양도 의뢰</h3>' +
        '<p>브랜드·지역·매출·희망 권리금을 남겨 주시면 실사 일정과 조건을 정리해 연락드립니다.</p>' +
      '</div>' +
      '<div class="modal-content">' +
        '<form id="sellForm" novalidate>' +
          '<div class="field-row">' +
            '<div class="field"><label for="sellBrand">브랜드 / 업종 <span class="req">*</span></label>' +
              '<input id="sellBrand" type="text" autocomplete="off" placeholder="예: 메가커피" /></div>' +
            '<div class="field"><label for="sellArea">지역 <span class="req">*</span></label>' +
              '<input id="sellArea" type="text" autocomplete="off" placeholder="예: 서울 종로구" /></div>' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label for="sellSales">월 평균 매출 (만 원) <span class="req">*</span></label>' +
              '<input id="sellSales" type="number" min="0" step="10" inputmode="numeric" placeholder="3200" /></div>' +
            '<div class="field"><label for="sellPremium">희망 권리금 (만 원) <span class="req">*</span></label>' +
              '<input id="sellPremium" type="number" min="0" step="10" inputmode="numeric" placeholder="20000" /></div>' +
          '</div>' +
          '<div class="field"><label for="sellPhone">연락처 <span class="req">*</span></label>' +
            '<input id="sellPhone" type="tel" inputmode="numeric" maxlength="13" autocomplete="tel" placeholder="010-0000-0000" /></div>' +
          '<label class="consent"><input type="checkbox" id="sellConsent" />' +
            '<span><b>(필수)</b> 양도 상담을 위한 연락처 수집·이용에 동의합니다. 번호는 상담 목적으로만 사용합니다.</span></label>' +
          '<p class="form-error" id="sellError" hidden></p>' +
          '<div class="form-actions">' +
            '<button type="submit" class="btn btn-gold">양도 의뢰 접수</button>' +
            '<button type="button" class="btn btn-quiet" data-close-sell>취소</button>' +
          '</div>' +
        '</form>' +
      '</div>';
  }

  function sellReceiptHTML(payload) {
    var smsBody = '[에이피파트너 양도 의뢰]\n브랜드: ' + payload.brand + '\n지역: ' + payload.area +
      '\n월 매출: ' + manwonLabel(payload.monthly_sales_manwon) + '\n희망 권리금: ' + manwonLabel(payload.premium_manwon) +
      '\n연락처: ' + payload.contact.phone;
    var smsHref = PHONE_SMS + '?body=' + encodeURIComponent(smsBody);
    return '' +
      '<div class="modal-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>REQUEST RECEIVED</p>' +
        '<h3 id="sellTitle">양도 의뢰가 접수됐습니다</h3>' +
        '<p>접수번호 <b style="color:#E7D6B0">' + esc(displayReceiptNo(payload.request_id)) + '</b></p>' +
      '</div>' +
      '<div class="modal-content">' +
        '<div class="receipt">' +
          '<div class="receipt-icon" aria-hidden="true">' + checkIcon() + '</div>' +
          '<h4>' + esc(payload.brand) + ' · ' + esc(payload.area) + '</h4>' +
          '<p class="no">' + esc(displayReceiptNo(payload.request_id)) + '</p>' +
          '<div class="receipt-summary">' +
            '<div><span>브랜드 / 업종</span><b>' + esc(payload.brand) + '</b></div>' +
            '<div><span>지역</span><b>' + esc(payload.area) + '</b></div>' +
            '<div><span>월 평균 매출</span><b>' + manwonLabel(payload.monthly_sales_manwon) + '</b></div>' +
            '<div><span>희망 권리금</span><b>' + manwonLabel(payload.premium_manwon) + '</b></div>' +
            '<div><span>연락처</span><b>' + esc(payload.contact.phone) + '</b></div>' +
          '</div>' +
          '<div class="receipt-note"><b>다음 단계</b><br />접수 내용은 담당자에게 바로 전달되었습니다. 매출·지출 원자료와 인수 조건의 근거를 함께 확인하며, 아래 <b>전화</b> 또는 <b>문자</b>로 연결하시면 김현율 팀장이 바로 확인합니다.</div>' +
          '<div class="form-actions">' +
            '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담</a>' +
            '<a class="btn btn-gold" href="' + smsHref + '">문자로 보내기</a>' +
            '<button class="btn btn-quiet" type="button" data-close-sell>닫기</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function openSell() {
    var sm = $('#sellModal');
    if (!sm) return;
    state.lastFocus = document.activeElement;
    $('#sellBody').innerHTML = sellFormHTML();
    sm.hidden = false;
    document.body.classList.add('modal-open');
    var panel = $('.modal-panel', sm);
    if (panel) { panel.scrollTop = 0; panel.focus({ preventScroll: true }); }
    bindSellBody();
  }

  function closeSell() {
    var sm = $('#sellModal');
    if (!sm || sm.hidden) return;
    sm.hidden = true;
    $('#sellBody').innerHTML = '';
    if (modal && modal.hidden && (!gateEl || gateEl.hidden)) document.body.classList.remove('modal-open');
  }

  function bindSellBody() {
    var body = $('#sellBody');
    if (!body) return;
    $all('[data-close-sell]', body).forEach(function (b) { b.addEventListener('click', closeSell); });
    var phone = $('#sellPhone', body);
    if (phone) {
      phone.addEventListener('input', function () {
        var atEnd = phone.selectionStart === phone.value.length;
        phone.value = formatPhone(phone.value);
        if (atEnd) { try { phone.setSelectionRange(phone.value.length, phone.value.length); } catch (e) { /* 무시 */ } }
      });
    }
    var form = $('#sellForm', body);
    if (form) form.addEventListener('submit', onSellSubmit);
  }

  function onSellSubmit(e) {
    e.preventDefault();
    var body = $('#sellBody');
    var brand = ($('#sellBrand', body) || {}).value || '';
    var area = ($('#sellArea', body) || {}).value || '';
    var sales = Number(($('#sellSales', body) || {}).value || 0);
    var premium = Number(($('#sellPremium', body) || {}).value || 0);
    var phoneEl = $('#sellPhone', body);
    var phone = formatPhone(phoneEl ? phoneEl.value : '');
    if (phoneEl) phoneEl.value = phone;
    var consent = $('#sellConsent', body);
    var err = $('#sellError', body);

    var problem = '';
    if (brand.trim().length < 2) problem = '브랜드나 업종을 입력해 주세요.';
    else if (area.trim().length < 2) problem = '지역을 입력해 주세요. (예: 서울 종로구)';
    else if (!(sales > 0)) problem = '월 평균 매출을 만 원 단위로 입력해 주세요.';
    else if (!(premium > 0)) problem = '희망 권리금을 만 원 단위로 입력해 주세요.';
    else if (!/^01[016789]-?[0-9]{3,4}-?[0-9]{4}$/.test(phone)) problem = '연락처를 정확히 입력해 주세요. (예: 010-1234-5678)';
    else if (!consent || !consent.checked) problem = '연락처 수집·이용에 동의해 주세요.';

    if (problem) {
      if (err) { err.textContent = problem; err.hidden = false; }
      return;
    }
    if (err) err.hidden = true;

    var now = new Date();
    var payload = {
      type: 'sell_request',
      source: 'sell',
      form_version: 'sell-request-v1',
      request_id: 'SELL-' + leadStamp(now) + '-' + String(Math.floor(Math.random() * 9000) + 1000),
      submitted_at: now.toISOString(),
      brand: brand.trim(),
      region: area.trim(),
      phone: phone,
      monthly_sales: '월 ' + manwonLabel(sales),
      key_money: '권리금 ' + manwonLabel(premium),
      area: area.trim(),
      monthly_sales_manwon: Math.round(sales),
      premium_manwon: Math.round(premium),
      contact: { phone: phone, consent: true, consent_at: now.toISOString() },
      page: location.href
    };

    try {
      var list = safeParse(localStorage.getItem(SELL_KEY));
      if (!(list instanceof Array)) list = [];
      list.unshift(payload);
      localStorage.setItem(SELL_KEY, JSON.stringify(list.slice(0, 200)));
    } catch (e2) { /* 무시 */ }

    sendLead(payload);
    $('#sellBody').innerHTML = sellReceiptHTML(payload);
    var panel = $('.modal-panel', $('#sellModal'));
    if (panel) panel.scrollTop = 0;
    bindSellBody();
    toast('양도 의뢰가 접수되었습니다.');
  }

  function initSell() {
    $all('[data-open-sell]').forEach(function (btn) {
      btn.addEventListener('click', openSell);
    });
    var sm = $('#sellModal');
    if (sm) $all('[data-close-sell]', sm).forEach(function (el) { el.addEventListener('click', closeSell); });
  }

  /* ---------------- listings ---------------- */
  function searchBlob(L) {
    var code = codeOf(L);
    var digits = code.replace(/[^0-9]/g, '');
    var bare = String(Number(digits) || digits);
    return [
      code, code.toLowerCase(), 'ap-' + digits, 'ap' + digits, 'ap' + bare,
      'no.' + digits, 'no' + bare, digits,
      L.area, L.area_note, L.category, L.brand, L.brand_note, L.store_spec,
      (L.keywords || []).join(' '), L.district
    ].join(' ').toLowerCase();
  }

  /* 빠른 조건 칩(수도권 · 월 순수익)은 목록 필터와 함께 적용됩니다. */
  function matchesQuickFilters(L) {
    var f = state.filters;
    if (f.metro && ['서울', '경기', '인천'].indexOf(L.region) === -1) return false;
    if (f.profitMin && Number((L.profit && L.profit.avg_manwon) || 0) < Number(f.profitMin)) return false;
    return true;
  }

  function filteredListings() {
    var f = state.filters;
    var q = f.q.trim().toLowerCase();
    /* 'AP-005' · 'ap5' · '005' 처럼 고유번호만 적으면 그 점포만 보여준다. */
    var codeQ = normalizeCode(q.replace(/\s+/g, ''));
    if (codeQ) {
      var codeHits = state.listings.filter(function (L) {
        if (L.visible === false || L.status === 'closed') return false;
        if (f.region && L.region !== f.region) return false;
        if (f.category && L.category !== f.category) return false;
        if (f.budget && budgetBand(L.initial_cost.total_manwon) !== f.budget) return false;
        if (!matchesQuickFilters(L)) return false;
        return codeOf(L) === codeQ;
      });
      if (codeHits.length) return codeHits;
    }
    var intent = operationIntentOf(q);
    var intentWord = /^(풀오토|완전오토|오토|반오토|매니저|위탁|직영|직접|운영|직접운영|반|풀로)$/;
    var tokens = q.split(/\s+/).filter(Boolean).filter(function (w) {
      return !(intent && intentWord.test(w));
    });
    var list = state.listings.filter(function (L) {
      if (L.visible === false || L.status === 'closed') return false;
      if (f.region && L.region !== f.region) return false;
      if (f.category && L.category !== f.category) return false;
      if (f.budget && budgetBand(L.initial_cost.total_manwon) !== f.budget) return false;
      if (!matchesQuickFilters(L)) return false;
      if (tokens.length) {
        var blob = searchBlob(L);
        for (var i = 0; i < tokens.length; i++) {
          if (blob.indexOf(tokens[i]) === -1) return false;
        }
      }
      return true;
    });
    /* "오토로 돌릴 만한 곳"처럼 운영 계획으로 찾으면, 그 계획에 맞는 순서로 보여준다. */
    if (intent) {
      list = list.slice().sort(function (a, b) {
        return operationFit(b, intent).score - operationFit(a, intent).score;
      });
    }
    return list;
  }

  function cardHTML(L) {
    /* 카드에는 지역명이 이미 있으므로, 상권 표기에서는 앞의 시·도 이름을 덜어냅니다. */
    var areaShort = String(L.area || '').replace(/^(서울|경기|인천|대전|충남)\s*/, '') || L.area;
    var note = storeLineText(L);
    return '' +
      '<article class="listing-card" role="button" tabindex="0" data-id="' + esc(L.id) + '" ' +
        'aria-label="' + esc(L.area + ' ' + L.brand + ' 상세 보기') + '">' +
        '<div class="card-visual">' +
          '<div class="card-region">' +
            '<span>' + esc(L.region.toUpperCase()) + ' · ' + esc(L.category) + '</span>' +
            '<strong>' + esc(areaShort) + '</strong>' +
          '</div>' +
          '<span class="card-code">No. ' + esc(codeOf(L)) + '</span>' +
          (L.private_only ? '<span class="card-flag">비공개전용</span>' : '') +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + esc(L.brand) +
            (L.brand_note ? '<em>' + esc(L.brand_note) + '</em>' : '') +
          '</h3>' +
          (note ? '<p class="card-note">' + esc(note) + '</p>' : '') +
          '<div class="card-figures">' +
            '<div><span>초기 인수 비용</span><b class="gold">' + esc(L.initial_cost.label) + '</b></div>' +
            '<div><span>월 평균 매출</span><b>' + esc(L.monthly_sales.label.replace('월 평균 ', '')) + '</b></div>' +
            '<div><span>예상 순수익</span><b>' + esc(L.profit.label.replace(/^월\s*(약\s*)?/, '')) + '</b></div>' +
          '</div>' +
          '<div class="card-footer">' +
            '<span class="card-more">상세 보기 ' +
              '<svg viewBox="0 0 24 24" aria-hidden="true" class="ico"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</span>' +
            compareButtonHTML(L) +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function isSample(L) {
    return !L.status || L.status === 'sample';
  }

  function shortName(district) {
    return String(district || '').replace(/\s/g, '').slice(0, 2);
  }

  function renderListings() {
    var grid = $('#listingGrid');
    var empty = $('#emptyState');
    var count = $('#listingCount');
    var items = filteredListings();
    grid.innerHTML = items.map(cardHTML).join('');
    if (count) count.textContent = String(items.length);
    if (empty) empty.hidden = items.length !== 0;

    var hint = $('#filterHint');
    if (hint) {
      var intent = operationIntentOf(state.filters.q);
      hint.hidden = !intent;
      if (intent) {
        hint.innerHTML = '<b>' + esc(intent) + '</b> 계획으로 찾으셨습니다. 점포마다 운영 형태를 표시하지는 않고, ' +
          '매출 규모 · 인건비 비중 · 매장 규모를 보고 그 계획이 통할 점포부터 보여드립니다.';
      }
    }
    syncQuickChips();
  }

  function initListingFilters() {
    var search = $('#searchInput');
    var region = $('#filterRegion');
    var category = $('#filterCategory');
    var budget = $('#filterBudget');
    var reset = $('#filterReset');

    if (search) {
      var t = null;
      search.addEventListener('input', function () {
        clearTimeout(t);
        var v = search.value;
        t = setTimeout(function () { state.filters.q = v; renderListings(); }, 120);
      });
    }
    if (region) region.addEventListener('change', function () {
      state.filters.region = region.value;
      if (region.value) state.filters.metro = false;
      renderListings();
    });
    if (category) category.addEventListener('change', function () { state.filters.category = category.value; renderListings(); });
    if (budget) budget.addEventListener('change', function () { state.filters.budget = budget.value; renderListings(); });
    if (reset) {
      reset.addEventListener('click', function () {
        state.filters = { q: '', region: '', category: '', budget: '', metro: false, profitMin: 0 };
        if (search) search.value = '';
        if (region) region.value = '';
        if (category) category.value = '';
        if (budget) budget.value = '';
        renderListings();
      });
    }

    var grid = $('#listingGrid');
    function openFromCard(el) {
      var id = el && el.getAttribute('data-id');
      var L = state.listings.filter(function (x) { return x.id === id; })[0];
      if (L) openModal(L, 'detail');
    }
    grid.addEventListener('click', function (e) {
      var cmp = e.target.closest('[data-compare]');
      if (cmp) { e.preventDefault(); e.stopPropagation(); toggleCompare(cmp.getAttribute('data-compare')); return; }
      var card = e.target.closest('.listing-card');
      if (card) openFromCard(card);
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('[data-compare]')) return;
      var card = e.target.closest('.listing-card');
      if (card) { e.preventDefault(); openFromCard(card); }
    });
  }

  /* ---------------- modal ---------------- */
  var modal = null;

  function detailSectionsHTML(L) {
    var costItems = L.initial_cost.items.map(function (it) {
      return '<div><span>' + esc(it.label) + '</span><b>' + esc(it.value) + '</b></div>';
    }).join('');
    var bars = L.expenses.map(function (ex) {
      var pct = expensePct(L, ex);
      var width = Math.min(100, (pct[1] || 0) / 40 * 100);
      var money = expenseAmountText(L, ex);
      var pctLine = '매출의 ' + pctRangeText(pct) + '%';
      var head, share;
      if (ex.unit === 'pct') {
        /* 재료비: % + (약 OOO만 원) */
        head = pctLine + ' <em>(' + money + ')</em>';
        share = '';
      } else {
        /* 인건비·고정비·기타잡비: 금액 중심 */
        head = money;
        share = pctLine;
      }
      return '' +
        '<div class="bar-row">' +
          '<div class="bar-head"><strong>' + expenseLabelHTML(ex.label) + '</strong><span>' + head + '</span></div>' +
          '<div class="bar-track"><span class="bar-fill" style="width:' + width.toFixed(1) + '%"></span></div>' +
          (share ? '<span class="bar-share">' + share + '</span>' : '') +
        '</div>';
    }).join('');
    var points = (L.points || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
    var deals = (L.private_deals || []).map(function (d) {
      return '<div class="private-deal"><div><strong>' + esc(d.label) + '</strong><span>' + esc(d.detail) + '</span></div><span class="pill">비공개</span></div>';
    }).join('');

    return '' +
      '<section class="modal-section">' +
        '<h4>초기 인수 비용 구성</h4>' +
        '<div class="cost-list">' + costItems +
          '<div class="cost-total"><span>합계</span><b>' + esc(L.initial_cost.label) + '</b></div>' +
        '</div>' +
      '</section>' +
      '<section class="modal-section">' +
        '<h4>월 지출 요약</h4>' +
        '<p class="section-mini">재료비는 매출 대비 비율로, 인건비·매장 고정비·기타잡비는 월 금액으로 표시합니다. 세부 항목과 원자료는 상담에서 공개됩니다.</p>' +
        bars +
        '<div class="expense-total"><span>예상 순수익 (' + esc(L.profit.note) + ')</span><b>' + esc(L.profit.label) + '</b></div>' +
      '</section>' +
      '<section class="modal-section">' +
        '<h4>확인 포인트</h4>' +
        '<ul class="check-list">' + points + '</ul>' +
        (L.check_note ? '<p class="check-note"><b>확인할 점</b><br />' + esc(L.check_note) + '</p>' : '') +
      '</section>' +
      (deals ? '<section class="modal-section"><h4>상담 시 추가 안내</h4><div class="private-list">' + deals + '</div></section>' : '');
  }

  function modalDetailHTML(L) {
    var band = budgetBand(L.initial_cost.total_manwon);
    var unlocked = hasLead();
    var lead = unlocked ? readLead() : null;
    var leadLine = lead ? leadCriteriaText(lead.criteria) : '';

    return '' +
      '<div class="modal-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>STORE DETAIL</p>' +
        '<h3 id="modalTitle">' + esc(L.area) + ' · ' + esc(L.brand) + '</h3>' +
        '<p>' + esc(storeLineText(L)) + '</p>' +
        '<div class="modal-hero-tags">' +
          '<span class="modal-code">No. ' + esc(codeOf(L)) + '</span>' +
          '<span class="gold">현장 실사 완료</span>' +
          '<span>상세 위치 비공개</span>' +
          (L.private_only ? '<span>비공개 전용</span>' : '') +
          '<span>' + esc(L.category) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="modal-content">' +
        '<div class="summary-tiles">' +
          '<div class="tile accent"><span>초기 인수 비용</span><b>' + esc(L.initial_cost.label) + '</b><small>' + esc(bandLabel(band)) + ' 구간</small></div>' +
          '<div class="tile"><span>월 평균 매출</span><b>' + esc(L.monthly_sales.label.replace('월 평균 ', '')) + '</b><small>' + (L.monthly_sales.range ? esc(L.monthly_sales.range) + ' 범위' : '점주 제시 자료 기준') + '</small></div>' +
          '<div class="tile"><span>예상 순수익</span><b>' + esc(L.profit.label.replace('월 ', '')) + '</b><small>' + esc(L.profit.note) + '</small></div>' +
        '</div>' +
        (unlocked
          ? '<div class="unlock-line">' + checkIcon() + '4항목 확인 완료 · 잠금 해제' +
              (leadLine ? '<span>· ' + esc(leadLine) + '</span>' : '') + '</div>' +
            detailSectionsHTML(L)
          : '<div class="detail-lock">' +
              '<div class="detail-lock-blur" aria-hidden="true" inert>' + detailSectionsHTML(L) + '</div>' +
              '<div class="detail-lock-overlay">' +
                '<span class="lock-badge">' + lockIcon() + '상세 지출 잠금</span>' +
                '<strong>상세 지출 구성은<br />4항목 입력 후 열립니다</strong>' +
                '<p>희망 업종·지역·예산·연락처를 한 번만 남기시면 항목별 지출 금액과 비율, 인력 운영 포인트까지 바로 보실 수 있습니다.</p>' +
                '<button class="btn btn-gold btn-lg" type="button" data-open-gate="detail">상세 지출 더 보기</button>' +
                '<span class="lock-foot">30초 이내 · 한 번 입력하면 다시 묻지 않습니다</span>' +
              '</div>' +
            '</div>') +
        '<div class="privacy-box">' +
          '<strong>상세 자료와 정확한 위치는 상담에서 안내합니다</strong>' +
          '인력 운영과 배달 비중에 따라 실제 수익은 달라질 수 있으며, 상세 원자료와 정확한 위치는 유선·미팅 상담 시 공개됩니다.' +
        '</div>' +
        '<div class="modal-actions">' +
          '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담 ' + '010-2885-5553' + '</a>' +
          '<button class="btn btn-gold" type="button" data-request="' + esc(L.id) + '">상세 자료 요청</button>' +
          '<button class="btn btn-quiet" type="button" data-copy-kakao>카톡 ID 복사</button>' +
          compareButtonHTML(L, true) +
          (unlocked ? '<button class="btn btn-quiet" type="button" data-view-lead>내 입력 정보</button>' : '') +
        '</div>' +
        '<p class="modal-sample-line">현장 실사 완료 · 지점명과 상세 위치는 상담에서 안내합니다. 표시 수치는 점주 제시 자료 기준입니다. (' + esc(bandLabel(band)) + ' 구간)</p>' +
      '</div>';
  }

  function modalFormHTML(L) {
    return '' +
      '<div class="modal-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>REQUEST DETAILS</p>' +
        '<h3 id="modalTitle">상세 자료 요청</h3>' +
        '<p>No. ' + esc(codeOf(L)) + ' · ' + esc(L.area) + ' · ' + esc(L.brand) + ' · ' + esc(L.initial_cost.label) + '</p>' +
        '<div class="modal-hero-tags"><span class="modal-code">No. ' + esc(codeOf(L)) + '</span><span class="gold">현장 실사 완료</span><span>' + esc(L.category) + '</span></div>' +
      '</div>' +
      '<div class="modal-content">' +
        '<div class="form-head">' +
          '<h4>연락처를 남겨 주세요</h4>' +
          '<p>이 점포의 매출·지출 원자료 요약과 상담 가능한 시간을 안내드립니다. 남겨 주신 정보는 상담 목적으로만 사용합니다.</p>' +
        '</div>' +
        '<form id="requestForm" novalidate>' +
          '<div class="field-row">' +
            '<div class="field"><label for="reqName">이름 <span class="req">*</span></label>' +
              '<input id="reqName" name="name" type="text" autocomplete="name" placeholder="홍길동" /></div>' +
            '<div class="field"><label for="reqPhone">연락처 <span class="req">*</span></label>' +
              '<input id="reqPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" /></div>' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label for="reqBudget">희망 예산</label>' +
              '<select id="reqBudget" name="budget">' +
                '<option value="">선택 안 함</option>' +
                '<option>1억 미만</option><option>1억대</option><option>2억대</option><option>3억 이상</option>' +
              '</select></div>' +
            '<div class="field"><label for="reqWhen">상담 희망 시간</label>' +
              '<select id="reqWhen" name="when">' +
                '<option value="">언제든 괜찮습니다</option>' +
                '<option>평일 오전</option><option>평일 오후</option><option>평일 저녁</option><option>주말</option>' +
              '</select></div>' +
          '</div>' +
          '<div class="field"><label for="reqMsg">문의 내용</label>' +
            '<textarea id="reqMsg" name="message" placeholder="예: 배달 비중을 줄일 수 있는지, 주말 방문 가능한지 궁금합니다"></textarea></div>' +
          '<label class="consent"><input type="checkbox" id="reqConsent" />' +
            '<span>상담을 위한 이름·연락처 수집 및 이용에 동의합니다. 입력하신 내용은 담당 컨설턴트에게 즉시 전달됩니다.</span></label>' +
          '<p class="form-error" id="formError" hidden></p>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-quiet" data-back="' + esc(L.id) + '">이전</button>' +
            '<button type="submit" class="btn btn-gold">상담 요청 보내기</button>' +
          '</div>' +
        '</form>' +
      '</div>';
  }

  function receiptHTML(L, data) {
    /* 접수번호는 매물 고유번호(AP-001)와 헷갈리지 않게 '문의-'로 시작합니다. (화면 전용 값) */
    var nowNo = new Date();
    var no = '문의-' + nowNo.getFullYear() + '-' + pad2(nowNo.getMonth() + 1) + '-' + pad2(nowNo.getDate()) +
      '-' + String(Math.floor(Math.random() * 9000) + 1000);
    var bodyLines = [
      '[에이피파트너 상담 요청]',
      '점포: ' + storeLabel(L),
      '이름: ' + data.name,
      '연락처: ' + data.phone,
      '희망 예산: ' + (data.budget || '미선택'),
      '희망 시간: ' + (data.when || '언제든 괜찮습니다'),
      data.message ? '문의: ' + data.message : ''
    ].filter(Boolean).join('\n');
    var smsHref = PHONE_SMS + '?body=' + encodeURIComponent(bodyLines);

    return '' +
      '<div class="modal-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>REQUEST RECEIVED</p>' +
        '<h3 id="modalTitle">상담 요청이 접수되었습니다</h3>' +
        '<p>접수번호 <b style="color:#E7D6B0">' + esc(no) + '</b></p>' +
      '</div>' +
      '<div class="modal-content">' +
        '<div class="receipt">' +
          '<div class="receipt-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24"><path d="m4 12.5 5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</div>' +
          '<h4>확인했습니다, ' + esc(data.name) + '님</h4>' +
          '<p class="no">No. ' + esc(codeOf(L)) + ' · ' + esc(L.area) + ' · ' + esc(L.brand) + '</p>' +
          '<div class="receipt-summary">' +
            '<div><span>점포</span><b>No. ' + esc(codeOf(L)) + ' · ' + esc(L.brand) + ' · ' + esc(L.area) + '</b></div>' +
            '<div><span>연락처</span><b>' + esc(data.phone) + '</b></div>' +
            '<div><span>희망 예산</span><b>' + esc(data.budget || '미선택') + '</b></div>' +
            '<div><span>상담 희망</span><b>' + esc(data.when || '언제든 괜찮습니다') + '</b></div>' +
          '</div>' +
          '<div class="receipt-note">' +
            '<b>상담 연결 안내</b><br />입력하신 내용은 담당 컨설턴트에게 즉시 전달됩니다. ' +
            '바로 상담을 원하시면 아래 <b>전화</b> 또는 <b>문자</b> 버튼을 눌러 주세요. 문자는 입력하신 내용이 그대로 채워집니다.' +
          '</div>' +
          '<div class="form-actions">' +
            '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담</a>' +
            '<a class="btn btn-gold" href="' + smsHref + '">문자로 보내기</a>' +
            '<button class="btn btn-quiet" type="button" data-close-modal>닫기</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function openModal(L, view) {
    if (!modal) modal = $('#modal');
    state.currentListing = L;
    state.modalView = view || 'detail';
    state.lastFocus = document.activeElement;
    var body = $('#modalBody');
    body.innerHTML = view === 'form' ? modalFormHTML(L) : modalDetailHTML(L);
    modal.hidden = false;
    document.body.classList.add('modal-open');
    var panel = $('.modal-panel', modal);
    panel.scrollTop = 0;
    // focus first meaningful control
    var target = view === 'form' ? $('#reqName') : $('.modal-close', modal);
    if (target) target.focus({ preventScroll: true });
    bindModalBody();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    $('#modalBody').innerHTML = '';
    state.currentListing = null;
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus({ preventScroll: true });
  }

  function refreshOpenModal() {
    if (!modal || modal.hidden || !state.currentListing) return;
    if (state.modalView !== 'detail') return;
    var panel = $('.modal-panel', modal);
    var keep = panel ? panel.scrollTop : 0;
    $('#modalBody').innerHTML = modalDetailHTML(state.currentListing);
    if (panel) panel.scrollTop = keep;
    bindModalBody();
  }

  function bindModalBody() {
    var body = $('#modalBody');

    $all('[data-compare]', body).forEach(function (btn) {
      btn.addEventListener('click', function () { toggleCompare(btn.getAttribute('data-compare')); });
    });

    $all('[data-open-gate]', body).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var L = state.currentListing;
        openGate('form', {
          pending: { type: 'detail', id: L ? L.id : '' },
          context: {
            source: 'detail',
            store: L,
            criteria: L ? {
              category: L.category,
              region: L.region,
              budget: bandLabel(budgetBand(L.initial_cost.total_manwon))
            } : null
          }
        });
      });
    });

    $all('[data-view-lead]', body).forEach(function (btn) {
      btn.addEventListener('click', function () { openGate('view'); });
    });

    $all('[data-request]', body).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-request');
        var L = state.listings.filter(function (x) { return x.id === id; })[0];
        if (L) openModal(L, 'form');
      });
    });

    $all('[data-back]', body).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-back');
        var L = state.listings.filter(function (x) { return x.id === id; })[0];
        if (L) openModal(L, 'detail');
      });
    });

    $all('[data-close-modal]', body).forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });

    $all('[data-copy-kakao]', body).forEach(function (btn) {
      btn.addEventListener('click', copyKakao);
    });

    var form = $('#requestForm', body);
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var L = state.currentListing;
        if (!L) return;
        var name = ($('#reqName') || {}).value || '';
        var phone = ($('#reqPhone') || {}).value || '';
        var budget = ($('#reqBudget') || {}).value || '';
        var when = ($('#reqWhen') || {}).value || '';
        var message = ($('#reqMsg') || {}).value || '';
        var consent = $('#reqConsent');
        var err = $('#formError');

        name = name.trim();
        phone = phone.trim();

        var problem = '';
        if (name.length < 2) problem = '이름을 2자 이상 입력해 주세요.';
        else if (phone.replace(/[^0-9]/g, '').length < 9) problem = '연락처를 정확히 입력해 주세요. (예: 010-0000-0000)';
        else if (!consent || !consent.checked) problem = '상담을 위해 이름·연락처 수집에 동의해 주세요.';

        if (problem) {
          if (err) { err.textContent = problem; err.hidden = false; }
          return;
        }
        if (err) err.hidden = true;

        var now = new Date();
        var storeName = storeLabel(L);
        var data = { name: name, phone: phone, budget: budget, when: when, message: message, listing: L.id, at: now.toISOString() };
        try {
          var saved = JSON.parse(localStorage.getItem('apPartnerRequests') || '[]');
          saved.push(data);
          localStorage.setItem('apPartnerRequests', JSON.stringify(saved));
        } catch (e) { /* 저장 실패는 무시 */ }

        /* 상세 모달 상담 요청도 다른 접수 경로와 같은 웹훅(텔레그램)으로 보냅니다.
           Apps Script 는 c = data.criteria || data 에서 industry · region · budget · phone · stores 를 읽습니다. */
        var payload = {
          type: 'store_consult',
          source: 'store_detail',
          form_version: 'store-consult-v1',
          lead_id: leadId(),
          submitted_at: now.toISOString(),
          store: { id: L.id, code: codeOf(L), label: storeLabel(L), area: L.area, brand: L.brand, category: L.category, name: storeName, url: adminListingUrl(L) },
          stores: [storeAlertLabel(L)],
          store_codes: [codeOf(L)],
          store_links: [adminListingUrl(L)],
          name: name,
          phone: phone,
          when: when || '',
          message: message || '',
          brand: L.brand || '',
          region: L.area || '',
          criteria: {
            industry: L.brand || '',
            region: L.area || '',
            budget: budget || (L.initial_cost && L.initial_cost.label) || '',
            phone: phone
          },
          contact: { phone: phone, phone_digits: phone.replace(/[^0-9]/g, ''), consent: true, consent_at: now.toISOString() },
          page: location.href
        };
        recordLeadEntry(payload);
        sendLead(payload);

        $('#modalBody').innerHTML = receiptHTML(L, data);
        $('.modal-panel', modal).scrollTop = 0;
        bindModalBody();
      });
    }
  }

  /* ---------------- AI concierge ---------------- */
  var chatBusy = false;

  function addMessage(html, kind, extraClass) {
    var log = $('#chatLog');
    var el = document.createElement('div');
    el.className = 'msg ' + (kind === 'user' ? 'msg-user' : 'msg-bot') + (extraClass ? ' ' + extraClass : '');
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function addTyping() {
    var log = $('#chatLog');
    var el = document.createElement('div');
    el.className = 'msg msg-bot';
    el.id = 'typingMsg';
    el.innerHTML = '<span class="typing" aria-label="입력 중"><i></i><i></i><i></i></span>';
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  /* 손님이 쓴 말에서 운영 계획만 뽑아낸다. (점포 데이터에는 저장하지 않음) */
  function operationIntentOf(text) {
    var t = String(text || '').toLowerCase();
    if (/반오토|반 오토/.test(t)) return '반오토';
    if (/풀오토|완전\s*오토|오토|매니저|위탁|직영이 아닌/.test(t)) return '오토';
    if (/직접\s*운영|직접\s*하|직영|내가\s*운영|사장님\s*운영|점주가\s*운영/.test(t)) return '직접 운영';
    return '';
  }

  /* 손님이 말한 지역을 지역명으로 정리합니다.
     등록 점포가 있는 지역뿐 아니라 전국 시·도를 알아듣고, 등록 점포가 없는 지역을 물었을 때
     "부산 → 서울 매물"처럼 조용히 바꿔 보여 주지 않도록 하기 위해 씁니다. */
  var REGION_WORDS = [
    { name: '서울', re: /서울|마포|강남|종로|영등포|관악|금천|송파|홍대|서초|강서|강동|용산|성동|광진|노원|은평|동작/ },
    { name: '경기', re: /경기|성남|분당|수원|용인|부천|안양|일산|위례|고양|평택|안산|남양주|하남|김포/ },
    { name: '인천', re: /인천|부평|송도|계양|미추홀|연수구|남동구/ },
    { name: '대전', re: /대전|둔산|유성/ },
    { name: '충남', re: /충남|충청남도|천안|아산|당진|서산/ },
    { name: '부산', re: /부산|해운대|광안리|남포동|동래|수영구|부산진/ },
    { name: '대구', re: /대구|동성로|수성구|달서구/ },
    { name: '광주', re: /광주|상무지구|충장로/ },
    { name: '울산', re: /울산|삼산동/ },
    { name: '세종', re: /세종|조치원/ },
    { name: '충북', re: /충북|충청북도|청주|충주|제천/ },
    { name: '전북', re: /전북|전라북도|전주|군산|익산/ },
    { name: '전남', re: /전남|전라남도|여수|순천|목포/ },
    { name: '경북', re: /경북|경상북도|포항|구미|경주/ },
    { name: '경남', re: /경남|경상남도|창원|김해|양산|진주/ },
    { name: '제주', re: /제주|서귀포/ },
    { name: '강원', re: /강원|춘천|원주|강릉/ }
  ];

  function regionOfText(text) {
    var t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t) return '';
    for (var i = 0; i < REGION_WORDS.length; i++) {
      if (REGION_WORDS[i].re.test(t)) return REGION_WORDS[i].name;
    }
    return '';
  }

  /* 지금 등록된 점포가 있는 지역인지 */
  function regionHasStores(name) {
    if (!name) return true;
    return (state.listings || []).some(function (L) { return L.region === name; });
  }

  function parseInput(text) {
    var out = { region: '', budget: '', category: '', tokens: [] };
    var t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t) return out;

    out.region = regionOfText(t);

    if (/3\s*억/.test(t)) out.budget = '3억 이상';
    else if (/1\s*억\s*미만|[5-9]\s*천|오천|육천|칠천/.test(t)) out.budget = '1억 미만';
    else if (/2\s*억/.test(t)) out.budget = '2억대';
    else if (/1\s*억/.test(t)) out.budget = '1억대';

    out.operation = operationIntentOf(t);

    if (/디저트|케이크|빵|베이커리|마카롱/.test(t)) out.category = '디저트';
    else if (/패스트푸드|햄버거|버거|피자/.test(t)) out.category = '패스트푸드';
    else if (/치킨|교촌/.test(t)) out.category = '치킨';
    else if (/식당|음식|분식|고기|국밥|주점|술집/.test(t)) out.category = '음식점';
    else if (/카페|커피/.test(t)) out.category = '카페';
    else if (/정관장|홍삼|건강식품|건강기능식품|판매|서비스/.test(t)) out.category = '판매·서비스';

    var stop = /^(서울|경기|인천|대전|충남|부산|대구|광주|울산|세종|충북|전북|전남|경북|경남|제주|강원|천안|마포|강남|종로|성남|분당|수원|부평|둔산|억|억대|만원|카페|커피|디저트|음식점|패스트푸드|치킨|판매·서비스|오토|반오토|직접|운영|매장|점포|있는|하고|싶어요|싶습니다|해주세요|추천|찾아|보여|주세요|그리고|정도|이상|미만)$/;
    out.tokens = t.split(' ').filter(function (w) { return w.length > 1 && !stop.test(w); });
    return out;
  }

  /* ---------------------------------------------------------------------
     손님이 말한 운영 계획(오토·반오토·직접 운영)은 점포 데이터에 저장하지 않는다.
     대신 매출 규모 · 인건비 비중 · 매장 규모/특징을 보고 "그 계획이 통할 점포"를
     추정해 추천 사유만 만들어 준다. 점포 카드·비교표에는 운영 구분을 표시하지 않는다.
     --------------------------------------------------------------------- */
  function laborExpense(L) {
    return (L.expenses || []).filter(function (e) { return e.label === '인건비'; })[0] || null;
  }

  /* 인건비 비중(%) = 인건비 월 금액 ÷ 월 평균 매출 */
  function laborShare(L) {
    var ex = laborExpense(L);
    if (!ex) return 0;
    var p = expensePct(L, ex);
    return p[1] || p[0] || 0;
  }

  function storeHaystack(L) {
    return [
      L.store_spec || '', L.area_note || '', (L.keywords || []).join(' '),
      (L.points || []).join(' '), L.check_note || ''
    ].join(' ');
  }

  function operationFit(L, intent) {
    var sales = (L.monthly_sales && L.monthly_sales.avg_manwon) || 0;
    var salesLabel = (L.monthly_sales && L.monthly_sales.label)
      ? L.monthly_sales.label.replace('월 평균 ', '') : manwonLabel(sales);
    var labor = laborShare(L);
    var exLabor = laborExpense(L);
    var laborPct = exLabor ? expensePct(L, exLabor) : [0, 0];
    var laborText = exLabor
      ? '인건비 월 ' + manwonRangeLabel(exLabor.amount[0], exLabor.amount[1]) + '(매출의 ' + pctRangeText(laborPct) + '%)'
      : '인건비 정보 없음';
    var hay = storeHaystack(L);
    var hasManager = /매니저|관리만|점주는 관리/.test(hay);
    var hasRotation = /16시간|파트타임|로테이션|주방 2인|3인/.test(hay);
    var ownFriendly = /테이크아웃|키오스크|소규모/.test(hay);
    var score = 0;
    var reason = '';

    if (intent === '오토') {
      /* 매출이 크고 인건비 여력이 있어 매니저에게 맡길 수 있는 규모인지 */
      if (sales >= 6000) score += 3;
      else if (sales >= 4000) score += 2;
      else if (sales >= 2500) score += 1;
      if (labor >= 12) score += 2;
      else if (labor >= 10) score += 1;
      if (hasManager) score += 2;
      if (hasRotation) score += 1;

      if (score >= 5 && (sales >= 5000 || hasManager)) {
        reason = '월 매출 ' + salesLabel + ', ' + laborText + '로 매출 규모와 인건비 여력이 있어, 매니저를 세우고 점주는 관리 중심으로 돌리는 오토 체제를 검토하기 좋은 점포입니다';
      } else if (score >= 3) {
        reason = '월 매출 ' + salesLabel + ', ' + laborText + ' 구조라 매니저 1명을 두는 오토에 가까운 운영도 검토해 볼 수 있습니다';
      }
    } else if (intent === '반오토') {
      /* 파트타임 로테이션으로 돌릴 수 있는 인력 구조인지 */
      if (labor >= 10 && labor <= 20) score += 2;
      if (hasRotation) score += 3;
      if (sales >= 2500 && sales <= 5000) score += 2;
      if (hasManager) score += 1;

      if (score >= 5 && hasRotation) {
        reason = '월 매출 ' + salesLabel + ', ' + laborText + '에 파트타임 로테이션으로 돌아가는 구조라, 점주가 매장을 비우고 인력에게 맡기는 반오토 운영에 맞습니다';
      } else if (score >= 3) {
        reason = laborText + '로 파트타임 인력을 나눠 쓰는 반오토 운영을 검토할 만한 규모입니다';
      }
    } else if (intent === '직접 운영') {
      /* 점주가 직접 서면 인건비를 아낄 수 있는 규모인지 */
      if (labor >= 16) score += 2;
      else if (labor >= 12) score += 1;
      if (sales <= 3500) score += 2;
      else if (sales <= 5000) score += 1;
      else if (sales >= 6000) score -= 2;
      if (ownFriendly) score += 2;

      if (score >= 5 && ownFriendly) {
        reason = '월 매출 ' + salesLabel + ', ' + laborText + '로 소규모·테이크아웃 구조에 가까워, 점주가 직접 서서 인건비를 줄이는 운영이 수익에 유리합니다';
      } else if (score >= 3) {
        reason = '월 매출 ' + salesLabel + ', ' + laborText + '라 점주가 직접 나서면 그만큼 지출을 줄일 수 있는 규모입니다';
      }
    }
    return { score: score, reason: reason };
  }

  function matchListings(criteria) {
    var bandOrder = { under1: 0, '1': 1, '2': 2, over3: 3 };

    // 지역을 말씀하셨으면 같은 지역 안에서 먼저 찾습니다.
    var pool = state.listings;
    if (criteria.region) {
      var regional = pool.filter(function (L) { return L.region === criteria.region; });
      if (regional.length) pool = regional;
    }

    var scored = pool.map(function (L) {
      var score = 0;
      var reasons = [];
      var lb = budgetBand(L.initial_cost.total_manwon);

      if (criteria.region && L.region === criteria.region) { score += 4; reasons.push(L.area + ' · ' + L.area_note); }

      if (criteria.budget) {
        var want = criteria.budget === '1억 미만' ? 'under1'
          : criteria.budget === '1억대' ? '1'
          : criteria.budget === '2억대' ? '2' : 'over3';
        if (lb === want) { score += 4; reasons.push('초기 인수 비용 ' + L.initial_cost.label + '으로 말씀하신 ' + criteria.budget + ' 조건에 맞습니다'); }
        else if (Math.abs(bandOrder[lb] - bandOrder[want]) === 1) {
          score += 2;
          reasons.push('초기 인수 비용 ' + L.initial_cost.label + '로 예산보다 ' + (bandOrder[lb] > bandOrder[want] ? '조금 높은' : '조금 낮은') + ' 구간입니다');
        }
      }

      if (criteria.operation) {
        var fit = operationFit(L, criteria.operation);
        score += fit.score;
        if (fit.reason) reasons.push(fit.reason);
      }

      if (criteria.category) {
        var blob = searchBlob(L);
        if (L.category === criteria.category || blob.indexOf(criteria.category.toLowerCase()) !== -1) {
          score += 3;
        }
      }

      if (criteria.tokens && criteria.tokens.length) {
        var blob2 = searchBlob(L);
        var hits = criteria.tokens.filter(function (w) { return blob2.indexOf(w) !== -1; }).slice(0, 2);
        score += hits.length;
      }

      return { listing: L, score: score, reasons: reasons };
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    var best = scored.filter(function (s) { return s.score >= 3; }).slice(0, 2);
    var loose = best.length === 0;
    if (loose) best = scored.slice(0, 2);
    return { matches: best, loose: loose };
  }

  function conditionLabel(c) {
    var parts = [];
    if (c.region) parts.push(c.region);
    if (c.budget) parts.push(c.budget);
    if (c.operation) parts.push(c.operation);
    if (c.category) parts.push(c.category);
    return parts.join(' · ');
  }

  function miniCardHTML(m, masked) {
    var L = m.listing;
    var title = masked ? (L.region + ' · 지역 비공개') : (L.area + ' · ' + L.brand);
    var reason = masked
      ? L.category
      : (m.reasons.join(' / ') || L.area_note);
    function fig(label, value) {
      return '<div><span>' + label + '</span><b>' + (masked ? '입력 후 공개' : esc(value)) + '</b></div>';
    }
    return '' +
      '<div class="mini-list">' +
        '<button type="button" class="mini-card' + (masked ? ' is-masked' : '') + '"' +
          (masked ? ' tabindex="-1" aria-hidden="true"' : ' data-open="' + esc(L.id) + '"') + '>' +
          '<div class="mini-top">' +
            '<span class="mini-code">No. ' + esc(codeOf(L)) + '</span>' +
            '<strong>' + esc(title) + '</strong>' +
            '<span class="mini-tag">' + (masked ? '비공개 대기' : 'MATCH') + '</span>' +
          '</div>' +
          '<p class="mini-reason">' + esc(reason) + '</p>' +
          '<div class="mini-figures">' +
            fig('초기 인수', L.initial_cost.label) +
            fig('월 매출', L.monthly_sales.label.replace('월 평균 ', '')) +
            fig('예상 순수익', L.profit.label.replace('월 ', '')) +
          '</div>' +
          '<span class="mini-more">' + (masked ? '4항목 입력 후 확인' : '상세 보기 →') + '</span>' +
        '</button>' +
      '</div>';
  }

  function teaserHTML(matches, note) {
    var rows = matches.map(function (m) {
      var L = m.listing;
      return '' +
        '<div class="teaser-row">' +
          '<span class="tr-lock" aria-hidden="true">' + lockIcon() + '</span>' +
          '<div class="tr-main">' +
            '<strong>' + esc(L.region) + ' · 지역 비공개</strong>' +
            '<span>No. ' + esc(codeOf(L)) + ' · ' + esc(L.category) + '</span>' +
          '</div>' +
          '<span class="tr-open">초기 인수<br />입력 후 공개</span>' +
        '</div>';
    }).join('');

    return '' +
      '<div class="teaser">' +
        '<div class="teaser-head">' +
          '<span class="lock-badge">' + lockIcon() + '4가지 입력 후 공개</span>' +
          '<strong>후보 ' + matches.length + '곳이 준비됐습니다</strong>' +
          '<p>희망 업종·지역·예산·연락처를 남기면 매칭 이유와 상세 요약이 바로 열립니다.</p>' +
        '</div>' +
        '<div class="teaser-rows">' + rows + '</div>' +
        (note ? '<p class="teaser-note">' + esc(note) + '</p>' : '') +
        '<button class="btn btn-gold teaser-cta" type="button" data-open-gate="match">AI 맞춤 매칭 결과 확인</button>' +
      '</div>';
  }

  /* 응답 뒤에는 사용자 질문이 아니라 '방금 온 답변과 다음 동작 버튼'이 보이도록 채팅 로그를 내립니다.
     (예전에는 마지막 질문 자리로 되돌려 답변·CTA가 로그 아래로 잘렸습니다)
     상단 고정 헤더에 가려지는 부분은 보이는 영역에서 제외합니다. */
  function visibleLogTop(log, logRect) {
    var top = logRect.top;
    var head = document.querySelector('.site-header');
    if (head) {
      var hs = window.getComputedStyle(head);
      if (hs.position === 'fixed' || hs.position === 'sticky') {
        top = Math.max(top, head.getBoundingClientRect().bottom);
      }
    }
    return top;
  }

  function scrollChatToAction(actionEl) {
    var log = $('#chatLog');
    if (!log) return;
    var target = actionEl || log.lastElementChild;
    if (!target) return;
    var lr = log.getBoundingClientRect();
    var tr = target.getBoundingClientRect();
    var viewTop = visibleLogTop(log, lr);
    var visH = lr.bottom - viewTop;
    if (visH < 80) visH = lr.height;   // 헤더에 다 가려진 예외 상황은 로그 높이 기준으로
    var hidden = Math.max(0, viewTop - lr.top);
    var top = tr.top - lr.top + log.scrollTop;
    var bottom = tr.bottom - lr.top + log.scrollTop;
    var pad = 10;
    if (bottom - top <= visH - pad) {
      /* 답변 블록이 보이는 영역에 다 들어오면 위쪽에 맞춘다 */
      log.scrollTop = Math.max(0, top - hidden - pad);
    } else {
      /* 길면 버튼이 있는 아래쪽이 보이도록 내린다 */
      log.scrollTop = Math.max(0, bottom - hidden - visH + pad);
    }
  }

  function respond(criteria) {
    var cond = conditionLabel(criteria);
    var res = matchListings(criteria);
    var ctaId = res.matches.length ? res.matches[0].listing.id : (state.listings[0] || {}).id;
    state.lastCriteria = criteria;
    state.lastMatches = res.matches.map(function (m) { return m.listing; });

    var regionMissing = (criteria.region && !regionHasStores(criteria.region)) ? criteria.region : '';

    var intro;
    if (regionMissing) {
      /* 등록 점포가 없는 지역을 물었을 때는 조용히 다른 지역 매물만 보여 주지 않고 먼저 밝힙니다. */
      intro = '<p>현재 <b>' + esc(regionMissing) + '</b>에 공개 등록된 점포가 없습니다. ' +
        '조건을 남겨 주시면 비공개 매물 입고 시 먼저 안내드리며, 참고용으로 조건이 비슷한 다른 지역 점포를 함께 보여 드립니다.</p>';
    } else if (!cond) {
      intro = '<p>조건을 조금 더 알려주시면 딱 맞는 후보를 골라 드릴 수 있어요. 우선 <b>등록된 점포</b> 중에서 조건을 넓게 봤을 때 비교적 무난한 두 곳을 골랐습니다.</p>';
    } else if (res.loose) {
      intro = '<p>말씀하신 <b>' + esc(cond) + '</b> 조건에 정확히 맞는 점포는 아직 등록되어 있지 않습니다. 대신 조건에 가까운 순서로 <b>' + res.matches.length + '곳</b>을 추렸습니다.</p>';
    } else {
      intro = '<p>말씀하신 <b>' + esc(cond) + '</b> 조건으로 등록된 점포를 비교했어요. 조건에 가까운 후보 <b>' + res.matches.length + '곳</b>입니다.</p>';
    }
    if (criteria.operation) {
      intro += '<p class="op-note">점포마다 운영 형태를 따로 표시하지는 않습니다. 대신 <b>매출 규모 · 인건비 비중 · 매장 규모</b>를 보고 말씀하신 운영 계획이 통할 점포를 골라, 아래 카드에 판단 이유를 적었습니다.</p>';
    }

    // 잠금 안내: 매칭 결과 상세는 4가지 입력 후에 공개됩니다.
    if (!hasLead() && res.matches.length) {
      addMessage(intro);
      var teaserMsg = addMessage(teaserHTML(res.matches, regionMissing
        ? regionMissing + '에는 공개 등록 점포가 없어, 조건이 비슷한 다른 지역 후보를 참고용으로 보여 드립니다.'
        : ''), 'bot', 'msg-wide');
      addMessage(
        '<p>희망 업종·지역·예산·연락처 4가지를 남기시면 매칭 이유와 상세 요약이 바로 열립니다. 한 번 입력하면 이 브라우저에서는 다시 묻지 않습니다.</p>' +
        '<div class="msg-cta">' +
          '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담 010-2885-5553</a>' +
        '</div>'
      );
      bindChatActions();
      scrollChatToAction(teaserMsg.querySelector('.teaser') || teaserMsg);
      return;
    }

    addMessage(intro);
    if (res.matches.length) {
      addMessage(res.matches.map(function (m) { return miniCardHTML(m); }).join(''));
      addMessage(
        '<p>세부 수익 구조와 실제 위치는 여기에서 공개하지 않습니다. 표시된 수치는 점주 제시 자료 기준의 값이고, 인력 운영과 배달 비중에 따라 실제 수익은 달라집니다.</p>' +
        '<div class="msg-cta">' +
          '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담 010-2885-5553</a>' +
          '<button class="btn btn-gold" type="button" data-open-request="' + esc(ctaId) + '">1:1 상담 요청</button>' +
        '</div>'
      );
    } else {
      addMessage(
        '<p>지금은 조건에 맞는 등록 점포가 없습니다. 어떤 조건까지 조정 가능한지 알려주시면 후보를 다시 정리해 드릴게요.</p>' +
        '<div class="msg-cta"><a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담 010-2885-5553</a></div>'
      );
    }
    bindChatActions();
    scrollChatToAction();
  }

  function bindChatActions() {
    var log = $('#chatLog');
    $all('[data-open-gate]', log).forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        openGate('form', {
          pending: { type: 'match', criteria: state.lastCriteria },
          context: { source: 'matching', criteria: state.lastCriteria, stores: state.lastMatches || [] }
        });
      });
    });
    $all('[data-open]', log).forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-open');
        var L = state.listings.filter(function (x) { return x.id === id; })[0];
        if (L) openModal(L, 'detail');
      });
    });
    $all('[data-open-request]', log).forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-open-request');
        var L = state.listings.filter(function (x) { return x.id === id; })[0];
        if (L) openModal(L, 'form');
      });
    });
  }

  function submitConcierge(rawText) {
    if (chatBusy) return;
    chatBusy = true;

    var parsed = parseInput(rawText);
    var criteria = {
      region: parsed.region || state.chips.region,
      budget: parsed.budget || state.chips.budget,
      operation: parsed.operation || '',
      category: parsed.category,
      tokens: parsed.tokens
    };

    var cond = conditionLabel(criteria);
    var userLine = cond || rawText.trim();
    if (!userLine) {
      toast('지역·예산을 고르거나 "서울 2억대 카페"처럼 문장으로 적어 주세요.');
      chatBusy = false;
      return;
    }
    addMessage('<p>' + esc(userLine) + '</p>', 'user');

    var typing = addTyping();
    var delay = 550 + Math.random() * 450;
    setTimeout(function () {
      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      respond(criteria);
      chatBusy = false;
    }, delay);
  }

  function initConcierge() {
    var form = $('#conciergeForm');
    var input = $('#conciergeInput');

    $all('.chips').forEach(function (group) {
      var key = group.getAttribute('data-group');
      group.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        var value = chip.getAttribute('data-value');
        var already = chip.getAttribute('aria-pressed') === 'true';
        $all('.chip', group).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        if (already) {
          state.chips[key] = '';
        } else {
          chip.setAttribute('aria-pressed', 'true');
          state.chips[key] = value || '';
        }
      });
    });

    $all('.example').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-example') || '';
        if (input) input.value = text;
        // 예시 문장은 입력값으로만 쓰고, 칩 선택은 초기화합니다.
        $all('.chips .chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        state.chips = { region: '', budget: '' };
        submitConcierge(text);
      });
    });

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = input ? input.value : '';
        submitConcierge(text);
        if (input) input.value = '';
      });
    }
  }

  /* ---------------- 내 조건 매장 찾기 바로가기 ---------------- */
  function initAiJump() {
    var links = $all('[data-jump-concierge]');
    if (!links.length) return;
    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        var section = $('#concierge');
        var input = $('#conciergeInput');
        if (!section) return;
        e.preventDefault();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.replaceState) history.replaceState(null, '', '#concierge');
        if (!input) return;
        /* 스크롤이 끝난 뒤 입력창에 커서를 둔다. 모바일 키보드가 같이 올라온다. */
        window.setTimeout(function () {
          try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); }
        }, 520);
      });
    });
  }

  /* ---------------- misc ---------------- */
  function initHeader() {
    var toggle = $('.nav-toggle');
    var nav = $('#mainNav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    $all('a', nav).forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function initModalGlobal() {
    modal = $('#modal');
    if (!modal) return;

    $all('[data-close-modal]', modal).forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', function (e) {
      if (gateEl && !gateEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeGate(); return; }
        if (e.key === 'Tab') {
          var gFocus = $all('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', gateEl)
            .filter(function (el) { return el.offsetParent !== null; });
          if (!gFocus.length) return;
          var gFirst = gFocus[0];
          var gLast = gFocus[gFocus.length - 1];
          if (e.shiftKey && document.activeElement === gFirst) { e.preventDefault(); gLast.focus(); }
          else if (!e.shiftKey && document.activeElement === gLast) { e.preventDefault(); gFirst.focus(); }
        }
        return;
      }
      var cmEl = $('#compareModal');
      if (cmEl && !cmEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeCompare(); return; }
        return;
      }
      var smEl = $('#sellModal');
      if (smEl && !smEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeSell(); return; }
        return;
      }
      if (e.key === 'Escape' && modal && !modal.hidden) closeModal();
      if (e.key === 'Tab' && modal && !modal.hidden) {
        var focusables = $all('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
          .filter(function (el) { return el.offsetParent !== null; });
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function initKakao() {
    $all('[data-copy-kakao]').forEach(function (btn) {
      btn.addEventListener('click', copyKakao);
    });
  }

  /* ---------------- 링크로 들어온 물건 바로 열기 ----------------
     텔레그램 알림의 링크(?id=AP-005 · ?id=ap-005 · #AP-005)를 누르면
     목록에서 그 물건을 찾아 상세 창을 바로 보여 줍니다. */
  function requestedListingFromUrl() {
    var raw = '';
    try {
      var q = new URLSearchParams(location.search || '');
      raw = q.get('id') || q.get('code') || '';
    } catch (e) { raw = ''; }
    if (!raw) {
      var h = String(location.hash || '').replace(/^#!?\/?/, '');
      if (/^(?:ap-?)?[0-9]{1,4}$/i.test(h)) {
        raw = h;
      } else {
        var m = h.match(/(?:^|[&?])id=([A-Za-z0-9%\-]+)/);
        if (m) {
          try { raw = decodeURIComponent(m[1]); } catch (e2) { raw = m[1]; }
        }
      }
    }
    raw = String(raw || '').trim();
    if (!raw) return null;
    var want = normalizeCode(raw);
    var wantLower = raw.toLowerCase();
    return state.listings.filter(function (L) {
      if (want && codeOf(L) === want) return true;
      if (L.id && String(L.id).toLowerCase() === wantLower) return true;
      if (L.code && String(L.code).toLowerCase() === wantLower) return true;
      return false;
    })[0] || null;
  }

  function openListingFromUrl() {
    var L = requestedListingFromUrl();
    if (!L) return false;
    if (L.status === 'closed' || L.visible === false) return false;
    openModal(L, 'detail');
    return true;
  }

  /* ---------------- PWA · 홈 화면 앱 추가 ----------------
     - 서비스워커 등록: 재방문 시 빠르게 열리고, 오프라인에서도 마지막 화면이 뜹니다.
     - 안드로이드·크롬: beforeinstallprompt 를 잡아 두었다가 '앱 설치' 버튼으로 띄웁니다.
     - 아이폰 사파리: 설치 API가 없어 '공유 → 홈 화면에 추가' 안내로 대신합니다.
     - 이미 앱으로 열려 있거나(standalone) 최근에 닫았으면 배너를 띄우지 않습니다.
     ------------------------------------------------------ */
  var PWA_DISMISS_KEY = 'apPartnerPwaDismissed';
  var PWA_DISMISS_DAYS = 120;
  var pwaDeferredPrompt = null;
  var pwaBanner = null;

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) { /* 무시 */ }
    return !!(window.navigator && window.navigator.standalone === true);
  }

  function isIosDevice() {
    var ua = String(navigator.userAgent || '');
    var ios = /iPad|iPhone|iPod/.test(ua);
    if (!ios && /Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ios = true; /* iPadOS */
    return ios;
  }

  function isIosSafari() {
    var ua = String(navigator.userAgent || '');
    if (!isIosDevice()) return false;
    /* 크롬·파이어폭스·엣지·네이버·카카오 등 인앱 브라우저는 홈 화면 추가 메뉴가 다릅니다. */
    return !/CriOS|FxiOS|EdgiOS|Whale|NAVER|KAKAO|DaumApps|Instagram|FBAN|FBAV/i.test(ua);
  }

  function pwaDismissed() {
    try {
      var t = Number(localStorage.getItem(PWA_DISMISS_KEY) || 0);
      return t > 0 && (Date.now() - t) < PWA_DISMISS_DAYS * 86400000;
    } catch (e) { return false; }
  }

  function rememberPwaDismiss() {
    try { localStorage.setItem(PWA_DISMISS_KEY, String(Date.now())); } catch (e) { /* 무시 */ }
  }

  function showPwaBanner(mode) {
    if (!pwaBanner || isStandalone() || pwaDismissed()) return;
    var cta = $('#pwaInstallBtn');
    var note = $('#pwaBannerNote');
    if (mode === 'ios') {
      if (cta) cta.textContent = '추가 방법';
      if (note) note.textContent = '아이폰은 공유 버튼으로 홈 화면에 추가할 수 있어요.';
    }
    pwaBanner.hidden = false;
    document.body.classList.add('pwa-on');
    /* 다음 프레임에 show 를 붙여야 아래에서 올라오는 효과가 살아납니다. */
    window.requestAnimationFrame(function () { pwaBanner.classList.add('show'); });
  }

  function hidePwaBanner(remember) {
    if (remember) rememberPwaDismiss();
    if (!pwaBanner) return;
    pwaBanner.classList.remove('show');
    document.body.classList.remove('pwa-on');
    setTimeout(function () {
      if (pwaBanner && !pwaBanner.classList.contains('show')) pwaBanner.hidden = true;
    }, 320);
  }

  /* 설치 이벤트는 DOM 준비 전에 올 수도 있어, 스크립트가 실행되는 즉시 잡아 둡니다. */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    pwaDeferredPrompt = e;
    showPwaBanner('android');
  });

  window.addEventListener('appinstalled', function () {
    pwaDeferredPrompt = null;
    hidePwaBanner(true);
    toast('홈 화면에 추가되었습니다. 앱 아이콘으로 바로 열 수 있어요.');
  });

  function initPwa() {
    pwaBanner = $('#pwaBanner');

    if (pwaBanner) {
      var closeBtn = $('#pwaBannerClose');
      if (closeBtn) closeBtn.addEventListener('click', function () { hidePwaBanner(true); });

      var cta = $('#pwaInstallBtn');
      if (cta) cta.addEventListener('click', function () {
        if (pwaDeferredPrompt) {
          var prompt = pwaDeferredPrompt;
          pwaDeferredPrompt = null;
          try { prompt.prompt(); } catch (e) { /* 무시 */ }
          var done = function () { hidePwaBanner(true); };
          if (prompt.userChoice && prompt.userChoice.then) prompt.userChoice.then(done, done);
          else done();
          return;
        }
        /* 설치 창을 띄울 수 없는 환경: 직접 추가하는 방법을 안내합니다. */
        var note = $('#pwaBannerNote');
        if (note) note.textContent = isIosDevice()
          ? '사파리 아래 공유(□↑) 버튼 → “홈 화면에 추가”를 눌러 주세요.'
          : '브라우저 오른쪽 위 ⋮ 메뉴 → “앱 설치” 또는 “홈 화면에 추가”를 눌러 주세요.';
        cta.textContent = '확인';
      });
    }

    /* 페이지를 여는 도중 이미 beforeinstallprompt 가 잡혔다면 바로 배너를 띄웁니다. */
    if (pwaDeferredPrompt) showPwaBanner('android');

    /* 설치 API가 없는 아이폰 사파리에서는 잠시 뒤 조용히 안내 배너를 띄웁니다. */
    if (!isStandalone() && isIosSafari()) {
      setTimeout(function () {
        if (!pwaDeferredPrompt) showPwaBanner('ios');
      }, 3200);
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* 등록 실패는 조용히 무시 */ });
      });
    }
  }

  /* ---------------- 빠른 조건 칩 · 지역별 현황 ----------------
     2026-11-28 추가: 히어로 아래 빠른 조건 칩과 시·도별 점포 건수 보드.
     둘 다 같은 state.filters 를 고치므로 목록·지역 선택·예산 선택과 항상 같이 움직입니다. */
  var REGION_ORDER = ['서울', '경기', '인천', '대전', '충남', '충북', '강원', '경북', '경남', '전북', '광주', '부산', '세종', '울산', '제주'];

  function syncQuickChips() {
    var f = state.filters;
    $all('#quickChips .quick-chip').forEach(function (chip) {
      var on = false;
      if (chip.hasAttribute('data-quick-budget')) on = f.budget === chip.getAttribute('data-quick-budget');
      else if (chip.hasAttribute('data-quick-profit')) on = String(f.profitMin) === chip.getAttribute('data-quick-profit');
      else if (chip.hasAttribute('data-quick-metro')) on = !!f.metro;
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var budget = $('#filterBudget');
    if (budget) budget.value = f.budget || '';
    var region = $('#filterRegion');
    if (region) region.value = f.region || '';
    syncRegionBoard();
  }

  function syncRegionBoard() {
    $all('#regionGrid [data-region]').forEach(function (card) {
      var r = card.getAttribute('data-region') || '';
      var on = r ? (state.filters.region === r) : (!state.filters.region && !state.filters.metro);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderRegionBoard() {
    var grid = $('#regionGrid');
    if (!grid) return;
    var counts = {};
    var total = 0;
    state.listings.forEach(function (L) {
      if (L.visible === false || L.status === 'closed') return;
      var r = L.region || '기타';
      counts[r] = (counts[r] || 0) + 1;
      total++;
    });
    var keys = Object.keys(counts).sort(function (a, b) {
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b);
    });
    var html = '<button class="region-card" type="button" data-region="" aria-pressed="false">' +
      '<span class="rc-name">전체</span><span class="rc-count">' + total + '<em>곳</em></span></button>';
    html += keys.map(function (r) {
      return '<button class="region-card" type="button" data-region="' + esc(r) + '" aria-pressed="false">' +
        '<span class="rc-name">' + esc(r) + '</span><span class="rc-count">' + counts[r] + '<em>곳</em></span></button>';
    }).join('');
    grid.innerHTML = html;
    syncRegionBoard();
  }

  function initQuickChips() {
    var wrap = $('#quickChips');
    if (!wrap) return;
    wrap.addEventListener('click', function (e) {
      var chip = e.target.closest('.quick-chip');
      if (!chip) return;
      var f = state.filters;
      var b = chip.getAttribute('data-quick-budget');
      var p = chip.getAttribute('data-quick-profit');
      var m = chip.getAttribute('data-quick-metro');
      if (b !== null) f.budget = (f.budget === b) ? '' : b;
      else if (p !== null) f.profitMin = (Number(f.profitMin) === Number(p)) ? 0 : Number(p);
      else if (m !== null) { f.metro = !f.metro; if (f.metro) f.region = ''; }
      renderListings();
      var target = $('#listings');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function initRegionBoard() {
    var grid = $('#regionGrid');
    if (!grid) return;
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('[data-region]');
      if (!card) return;
      var r = card.getAttribute('data-region') || '';
      state.filters.region = r;
      if (r) state.filters.metro = false;
      renderListings();
      var list = $('#listingGrid');
      if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------------- 하단 상담 폼 (매장 인수 / 내 매장 매각) ----------------
     인수는 기존 4항목 게이트와 같은 type:'lead' 페이로드,
     매각은 기존 양도 의뢰와 같은 type:'sell_request' 페이로드를 그대로 보냅니다.
     (Apps Script · 텔레그램 · 관리자 손님 DB/양도 의뢰 탭과 호환) */
  var applyState = { mode: 'buy' };

  function setApplyMode(mode) {
    var m = mode === 'sell' ? 'sell' : 'buy';
    applyState.mode = m;
    $all('.apply-tab').forEach(function (t) {
      var on = t.getAttribute('data-apply-mode') === m;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $all('#applyForm .apply-panel').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== m;
    });
    var submit = $('#applySubmit');
    if (submit) submit.textContent = m === 'sell' ? '양도 접수하기' : '상담 접수하기';
    var err = $('#applyError');
    if (err) err.hidden = true;
  }

  function goApply(mode) {
    setApplyMode(mode);
    var target = $('#apply');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () {
      var first = mode === 'sell' ? $('#applySellBrand') : $('#applyCategory');
      if (first && first.focus) { try { first.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
    }, 360);
  }

  function applyReceiptHTML(payload, mode) {
    var rows;
    if (mode === 'sell') {
      var rentTotal = (Number(payload.rent_manwon) || 0) + (Number(payload.maintenance_manwon) || 0);
      rows = [
        ['이름', payload.owner_name],
        ['브랜드 / 지역', (payload.brand || '') + ' · ' + (payload.area || '')],
        ['월 매출', manwonLabel(payload.monthly_sales_manwon)],
        ['점포 예치금', manwonLabel(payload.deposit_manwon)],
        ['월 임차료 · 관리비', manwonLabel(rentTotal)],
        ['희망 시설·영업권', manwonLabel(payload.premium_manwon)],
        ['연락처', payload.contact.phone]
      ];
    } else {
      rows = [
        ['희망 업종', payload.criteria.industry || '전체'],
        ['희망 지역', payload.criteria.region || '전체'],
        ['초기 인수 예산', payload.criteria.budget || '미지정'],
        ['연락처', payload.contact.phone]
      ];
    }
    var extra = mode === 'sell' && payload.detail_count
      ? '<p class="apply-receipt-extra">실평수·층·순수익·인건비·재료비·공과금 등 세부 항목 ' + payload.detail_count + '개도 함께 접수됐습니다.</p>'
      : '';
    return '<div class="receipt">' +
      '<div class="receipt-icon" aria-hidden="true">' + checkIcon() + '</div>' +
      '<h3>' + (mode === 'sell' ? '양도 접수가 완료됐습니다' : '상담 접수가 완료됐습니다') + '</h3>' +
      '<p class="no">접수번호 <b>' + esc(displayReceiptNo(payload.request_id || payload.lead_id)) + '</b></p>' +
      '<div class="receipt-summary">' + rows.map(function (r) {
        return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
      }).join('') + '</div>' + extra +
      '<div class="receipt-note"><b>다음 단계</b><br />접수 내용은 담당자에게 바로 전달되었습니다. 김현율 팀장이 확인 후 남겨주신 번호로 연락드립니다.</div>' +
      '<div class="form-actions">' +
        '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담</a>' +
        '<button class="btn btn-quiet" type="button" data-apply-restart>새로 접수하기</button>' +
      '</div>' +
      '</div>';
  }

  /* 숫자 입력칸: 빈 칸은 null, 숫자가 아니면 NaN */
  function applyNum(id) {
    var el = $('#' + id);
    if (!el) return null;
    var raw = String(el.value == null ? '' : el.value).trim();
    if (raw === '') return null;
    var n = Number(raw.replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  function applyText(id) {
    var el = $('#' + id);
    return el ? String(el.value || '').trim() : '';
  }

  function onApplySubmit(e) {
    e.preventDefault();
    var mode = applyState.mode;
    var phoneEl = $('#applyPhone');
    var phone = formatPhone(phoneEl ? phoneEl.value : '');
    if (phoneEl) phoneEl.value = phone;
    var consent = $('#applyConsent');
    var err = $('#applyError');
    var problem = '';
    var brand = '';
    var area = '';

    if (mode === 'sell') {
      brand = applyText('applySellBrand');
      area = applyText('applySellArea');
      if (applyText('applySellName').length < 1) problem = '이름을 입력해 주세요.';
      else if (brand.length < 2) problem = '브랜드나 업종을 입력해 주세요.';
      else if (area.length < 2) problem = '지역과 지점명을 입력해 주세요. (예: 서울 마포구 ○○점)';
      else if (applyNum('applySellPyeong') === null) problem = '실평수를 숫자로 입력해 주세요.';
      else if (!applyText('applySellFloor')) problem = '층수를 입력해 주세요. (예: 1층)';
      else if (applyNum('applySellSales') === null) problem = '월 매출을 만 원 단위로 입력해 주세요.';
      else if (applyNum('applySellDeposit') === null) problem = '점포 예치금을 입력해 주세요. (없으면 0)';
      else if (applyNum('applySellRent') === null) problem = '월 임차료를 입력해 주세요. (없으면 0)';
      else if (applyNum('applySellMaintenance') === null) problem = '관리비를 입력해 주세요. (없으면 0)';
      else if (applyNum('applySellPremium') === null) problem = '희망 시설·영업권 금액을 입력해 주세요. (없으면 0)';
      else if (applyNum('applySellProfit') === null) problem = '월 순수익을 입력해 주세요. (없으면 0)';
      else if (applyNum('applySellLabor') === null) problem = '인건비를 입력해 주세요. (없으면 0)';
      else if (applyNum('applySellMaterial') === null) problem = '재료비 비율(%)을 입력해 주세요. (없으면 0)';
      else if (!(applyNum('applySellMaterial') >= 0 && applyNum('applySellMaterial') <= 100)) problem = '재료비 비율은 0~100 사이로 입력해 주세요.';
      else if (applyNum('applySellUtility') === null) problem = '공과금을 입력해 주세요. (없으면 0)';
    }
    if (!problem && !/^01[016789]-?[0-9]{3,4}-?[0-9]{4}$/.test(phone)) problem = '연락처를 정확히 입력해 주세요. (예: 010-1234-5678)';
    if (!problem && (!consent || !consent.checked)) problem = '연락처 수집·이용에 동의해 주세요.';

    if (problem) {
      if (err) { err.textContent = problem; err.hidden = false; }
      return;
    }
    if (err) err.hidden = true;

    var now = new Date();
    var payload;

    if (mode === 'sell') {
      var owner = applyText('applySellName');
      var pyeong = applyNum('applySellPyeong');
      var floor = applyText('applySellFloor');
      var sales = applyNum('applySellSales');
      var deposit = applyNum('applySellDeposit');
      var rent = applyNum('applySellRent');
      var maintenance = applyNum('applySellMaintenance');
      var premium = applyNum('applySellPremium');
      var profit = applyNum('applySellProfit');
      var labor = applyNum('applySellLabor');
      var material = applyNum('applySellMaterial');
      var utility = applyNum('applySellUtility');
      var delivery = applyNum('applySellDelivery') || 0;
      var etcCost = applyNum('applySellEtc') || 0;
      var openYm = applyText('applySellOpenYm');
      var reason = applyText('applySellReason');
      var when = applyText('applySellWhen');
      var note = applyText('applySellNote').slice(0, 300);
      var rentTotal = (rent || 0) + (maintenance || 0);

      /* 물건표 순서대로 한 줄씩 — 텔레그램·시트에 그대로 옮겨 쓸 수 있게 */
      var detail = [];
      var line = function (label, value) {
        if (value !== '' && value !== null && value !== undefined) detail.push('· ' + label + ': ' + value);
      };
      line('이름', owner);
      line('브랜드 / 지역', brand + ' · ' + area);
      line('실평수', pyeong + '평');
      line('층수', floor);
      line('월 매출', manwonLabel(sales));
      line('점포 예치금', manwonLabel(deposit));
      line('월 임차료', manwonLabel(rent));
      line('관리비', manwonLabel(maintenance));
      line('희망 시설·영업권', manwonLabel(premium));
      line('월 순수익', manwonLabel(profit));
      line('인건비', manwonLabel(labor));
      line('재료비', material + '%');
      line('공과금', manwonLabel(utility));
      line('배달비', manwonLabel(delivery));
      line('기타비용', manwonLabel(etcCost));
      line('오픈연월', openYm);
      line('양도 사유', reason);
      line('희망 양도 시기', when);
      line('시설 · 운영 특이사항', note);
      var detailText = detail.join('\n');
      var messageLine = detail.map(function (s) { return s.replace(/^· /, ''); }).join(' | ');

      payload = {
        type: 'sell_request',
        source: 'sell',
        form_version: 'sell-request-v2',
        request_id: 'SELL-' + leadStamp(now) + '-' + String(Math.floor(Math.random() * 9000) + 1000),
        submitted_at: now.toISOString(),
        owner_name: owner,
        name: owner,
        brand: brand,
        region: area,
        area: area,
        phone: phone,
        monthly_sales: '월 ' + manwonLabel(sales),
        key_money: '시설·영업권 ' + manwonLabel(premium) + ' / 예치금 ' + manwonLabel(deposit) + ' / 월 ' + manwonLabel(rentTotal),
        monthly_sales_manwon: Math.round(sales),
        premium_manwon: Math.round(premium),
        deposit_manwon: Math.round(deposit),
        rent_manwon: Math.round(rent),
        maintenance_manwon: Math.round(maintenance),
        profit_manwon: Math.round(profit),
        labor_manwon: Math.round(labor),
        material_pct: material,
        utility_manwon: Math.round(utility),
        delivery_manwon: Math.round(delivery),
        etc_manwon: Math.round(etcCost),
        store_pyeong: Math.round(pyeong),
        store_floor: floor,
        open_ym: openYm,
        sell_reason: reason,
        sell_when: when,
        facility_note: note,
        message: messageLine,
        memo: note,
        detail_text: detailText,
        detail_count: detail.length,
        page_location: 'home_apply',
        contact: { phone: phone, consent: true, consent_at: now.toISOString() },
        page: location.href
      };
      try {
        var list = safeParse(localStorage.getItem(SELL_KEY));
        if (!(list instanceof Array)) list = [];
        list.unshift(payload);
        localStorage.setItem(SELL_KEY, JSON.stringify(list.slice(0, 200)));
      } catch (e2) { /* 무시 */ }
    } else {
      var cat = (($('#applyCategory') || {}).value) || '';
      var region = (($('#applyRegion') || {}).value) || '';
      var band = (($('#applyBudget') || {}).value) || '';
      var brandText = (($('#applyBrand') || {}).value || '').trim();
      payload = buildLeadPayload({
        category: cat ? [cat] : [],
        brand: brandText,
        area: region ? [region] : [],
        budget: band ? bandLabel(band) : '',
        phone: phone
      }, { source: 'site' });
      recordLeadEntry(payload);
    }

    sendLead(payload);
    var form = $('#applyForm');
    var done = $('#applyDone');
    if (form) form.hidden = true;
    if (done) {
      done.innerHTML = applyReceiptHTML(payload, mode);
      done.hidden = false;
      $all('[data-apply-restart]', done).forEach(function (b) {
        b.addEventListener('click', function () {
          done.hidden = true;
          done.innerHTML = '';
          if (form) form.hidden = false;
          var first = mode === 'sell' ? $('#applySellBrand') : $('#applyCategory');
          if (first && first.focus) { try { first.focus(); } catch (e) { /* 무시 */ } }
        });
      });
    }
    toast(mode === 'sell' ? '양도 접수가 완료되었습니다. 담당자가 확인합니다.' : '상담 접수가 완료되었습니다. 담당자가 확인합니다.');
  }

  function initApplyForm() {
    $all('[data-apply-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-apply-mode');
        /* 폼 안의 탭은 페이지만 움직이지 않고 모드만 바꿉니다. */
        if (btn.closest('.apply-card')) { setApplyMode(mode); return; }
        goApply(mode);
      });
    });
    var form = $('#applyForm');
    if (!form) return;
    form.addEventListener('submit', onApplySubmit);
    /* 한 번 안내한 오류는 고치는 즉시 내립니다(오래된 오류 문구가 남지 않게). */
    form.addEventListener('input', function () {
      var err = $('#applyError');
      if (err && !err.hidden) err.hidden = true;
    });
    form.addEventListener('change', function () {
      var err = $('#applyError');
      if (err && !err.hidden) err.hidden = true;
    });
    var phone = $('#applyPhone');
    if (phone) {
      phone.addEventListener('input', function () {
        var atEnd = phone.selectionStart === phone.value.length;
        phone.value = formatPhone(phone.value);
        if (atEnd) { try { phone.setSelectionRange(phone.value.length, phone.value.length); } catch (e) { /* 무시 */ } }
      });
    }
    setApplyMode('buy');
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initHeader();
    initModalGlobal();
    initGateGlobal();
    initLeadStatus();
    initCompare();
    initSell();
    updateLeadStatus();
    initKakao();
    initConcierge();
    initAiJump();
    initListingFilters();
    initQuickChips();
    initRegionBoard();
    initApplyForm();
    initPwa();

    loadListings().then(function (result) {
      state.listings = result.listings;
      state.usingFallback = result.local;
      loadCompare();
      renderCompareBar();
      if (result.local) {
        var notice = document.createElement('p');
        notice.className = 'sample-notice-fallback';
        notice.style.cssText = 'margin:-8px 0 18px;font-size:12px;color:#8A6D3B;';
        notice.textContent = '지금은 파일로 직접 열려 예비 데이터를 보여드리고 있습니다. 로컬 서버나 배포 환경에서는 data/listings.json 내용이 그대로 반영됩니다.';
        var anchor = $('.listing-caption') || $('.filter-bar');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(notice, anchor.nextSibling);
      }
      renderListings();
      renderRegionBoard();
      /* 텔레그램 링크로 들어온 경우 해당 물건 상세 창을 바로 연다. */
      openListingFromUrl();
    });

    window.addEventListener('hashchange', function () { openListingFromUrl(); });
  });
})();
