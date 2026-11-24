/* ==========================================================================
   AP PARTNERS · 에이피파트너 — 1차 시안 스크립트
   - 점포 데이터: data/listings.sample.json (이 파일만 수정하면 목록에 자동 반영)
   - AI 컨시어지: 브라우저 안에서 조건을 해석하는 규칙 기반 매칭 (외부 API 없음)
   ========================================================================== */
(function () {
  'use strict';

  var PHONE_TEL = 'tel:010-2885-5553';
  var PHONE_SMS = 'sms:01028855553';
  var KAKAO_ID = 'hyunyul89';

  /* ---------------------------------------------------------------------
     4항목 손님 DB · 2단계 잠금 해제 (Lead Gate)
     - 1단계: 점포 목록·검색·필터는 연락처 없이 바로 열람
     - 2단계: '맞춤 매칭 결과' 또는 '상세 지출·비공개 매물'을 누를 때
       ① 업종/브랜드 ② 지역 ③ 예산 ④ 연락처(동의) 4항목 입력
     - 입력값은 JSON 페이로드로 localStorage / sessionStorage 에 저장되고,
       LEAD_ENDPOINT 를 채우면 그대로 전송(구글 시트 · 이메일 · 웹훅)됩니다.
     --------------------------------------------------------------------- */
  var LEAD_ENDPOINT = '';                    // 예: https://script.google.com/macros/s/xxxx/exec
  var LEAD_STORAGE_KEY = 'apPartnerLead';
  var LEAD_SESSION_KEY = 'apPartnerLeadSession';
  var LEAD_QUEUE_KEY = 'apPartnerLeadQueue';
  var LEAD_ALL_KEY = 'apPartnerLeads';          // 관리자 페이지 '손님 DB' 탭이 읽는 전체 목록

  var LEAD_CATEGORY_CHIPS = ['카페', '디저트', '음식점', '치킨', '기타'];
  var LEAD_AREA_CHIPS = ['서울', '경기', '인천', '기타'];
  var LEAD_BUDGET_CHIPS = ['1억 미만', '1억대', '2억대', '3억 이상'];

  var gateEl = null;
  var gateOpen = false;
  var gateReturnFocus = null;
  var gateFormState = { category: [], area: [], budget: '', brand: '' };

  /* ---------------------------------------------------------------------
     예비 데이터: data/listings.sample.json 을 fetch 할 수 없을 때만 사용됩니다.
     (index.html 을 파일로 직접 열면 브라우저가 fetch 를 막습니다.)
     실제 데이터 관리는 JSON 한 곳에서 하세요. 배포 후에는 항상 JSON 을 읽습니다.
     --------------------------------------------------------------------- */
  var FALLBACK = [
    {
      "id": "ap-sample-01",
      "status": "sample",
      "region": "서울",
      "district": "마포구",
      "area": "서울 마포구",
      "area_note": "대학가 인접 상권 · 테이크아웃 중심 · 평일 08:00~19:30 영업",
      "category": "카페",
      "brand": "커피 프랜차이즈",
      "brand_note": "국내 대형 브랜드",
      "store_spec": "1층 · 12평",
      "store_floor": "1층",
      "store_pyeong": 12,
      "initial_cost": {
        "total_manwon": 21000,
        "label": "2억 1,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "1,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2억 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 3200,
        "label": "월 평균 3,200만 원"
      },
      "profit": {
        "label": "월 약 1,250만 원",
        "avg_manwon": 1250,
        "note": "점주 제시 자료 기준"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            34.0,
            34.0
          ],
          "range": "1,088만 원",
          "share": "매출의 34%"
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            520,
            520
          ],
          "range": "520만 원",
          "share": "매출의 16.2%"
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            180,
            180
          ],
          "range": "180만 원",
          "share": "매출의 5.6%"
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            115,
            115
          ],
          "range": "115만 원",
          "share": "매출의 3.6%"
        }
      ],
      "points": [
        "학기·방학 인력 운영 매뉴얼이 정리되어 있습니다",
        "2인 테이블 4개와 키오스크 1대 구성",
        "계약 기간 2년, 매장 고정비 변동이 적은 편입니다"
      ],
      "check_note": "방학 4개월은 매출이 학기 평균의 37% 수준까지 내려갑니다. 학기·방학 인력 계획을 함께 확인하세요.",
      "keywords": [
        "대학가",
        "테이크아웃",
        "키오스크",
        "학기",
        "방학"
      ],
      "private_deals": [
        {
          "label": "같은 상권 비공개 매물",
          "detail": "1층 10평 카페 · 인수 조건 조율 중 (목록 미공개)"
        }
      ],
      "visible": true
    },
    {
      "id": "ap-sample-02",
      "status": "sample",
      "region": "경기",
      "district": "성남시 분당구",
      "area": "경기 성남시 분당구",
      "area_note": "주차 가능한 단지 상권 · 주차 2대 · 매일 09:00~01:30 (16시간 반 영업)",
      "category": "디저트",
      "brand": "디저트 카페",
      "brand_note": "자체 브랜드",
      "store_spec": "1층 · 14평",
      "store_floor": "1층",
      "store_pyeong": 14,
      "initial_cost": {
        "total_manwon": 6300,
        "label": "6,300만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "3,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2,500만 원"
          },
          {
            "label": "본사 비용",
            "value": "800만 원 (예치금 500 + 교육 300)"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 3470,
        "label": "월 평균 3,470만 원"
      },
      "profit": {
        "label": "월 약 725만 원",
        "avg_manwon": 725,
        "note": "점주 제시 자료 기준"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            35.5,
            35.5
          ],
          "range": "1,232만 원",
          "share": "매출의 35.5%"
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
            370,
            370
          ],
          "range": "370만 원",
          "share": "매출의 10.7%"
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            520,
            520
          ],
          "range": "520만 원",
          "share": "매출의 15%"
        }
      ],
      "points": [
        "16시간 영업을 3인 파트타임으로 돌리는 구조입니다",
        "배달 비중 60%, 단가 방어가 가능한 메뉴 구성",
        "본사 예치금 500만 원은 계약 종료 시 돌려받습니다"
      ],
      "check_note": "최근 3개월 매출이 직전 3개월보다 8.7% 낮습니다. 배달 수수료 정책을 함께 확인하세요.",
      "keywords": [
        "주차",
        "배달",
        "16시간",
        "파트타임",
        "단지"
      ],
      "private_deals": [
        {
          "label": "본사 재계약 조건",
          "detail": "2027년 3월 재계약 · 예치금 500만 원 유지 조건"
        }
      ],
      "visible": true
    },
    {
      "id": "ap-sample-03",
      "status": "sample",
      "region": "인천",
      "district": "부평구",
      "area": "인천 부평구",
      "area_note": "주거 밀집 배달 상권 · 홀 8테이블 · 매일 16:00~02:00 영업",
      "category": "음식점",
      "brand": "치킨 프랜차이즈",
      "brand_note": "중견 브랜드",
      "store_spec": "1층 · 15평",
      "store_floor": "1층",
      "store_pyeong": 15,
      "initial_cost": {
        "total_manwon": 18000,
        "label": "1억 8,000만 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "2,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "1억 6,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 2450,
        "label": "월 평균 2,450만 원"
      },
      "profit": {
        "label": "월 약 625만 원",
        "avg_manwon": 625,
        "note": "점주 제시 자료 기준"
      },
      "expenses": [
        {
          "label": "재료비",
          "unit": "pct",
          "pct": [
            38.5,
            38.5
          ],
          "range": "943만 원",
          "share": "매출의 38.5%"
        },
        {
          "label": "인건비",
          "unit": "manwon",
          "amount": [
            405,
            405
          ],
          "range": "405만 원",
          "share": "매출의 16.5%"
        },
        {
          "label": "매장 고정비",
          "unit": "manwon",
          "amount": [
            160,
            160
          ],
          "range": "160만 원",
          "share": "매출의 6.5%"
        },
        {
          "label": "기타잡비",
          "unit": "manwon",
          "amount": [
            315,
            315
          ],
          "range": "315만 원",
          "share": "매출의 12.9%"
        }
      ],
      "points": [
        "배달 65%, 홀 비중이 낮아 인력 운영이 단순합니다",
        "주방 2인 로테이션, 점주는 발주와 관리 중심",
        "주차 2대, 저녁 피크 회전 3회 수준"
      ],
      "check_note": "배달 수수료와 광고비가 매출의 12~13%를 차지합니다. 배달 비중 조절이 수익의 핵심입니다.",
      "keywords": [
        "배달",
        "주거",
        "주차",
        "저녁",
        "피크"
      ],
      "private_deals": [
        {
          "label": "야간 전용 비공개 매물",
          "detail": "동일 상권 2층 · 주방 설비 포함 (목록 미공개)"
        }
      ],
      "visible": true
    },
    {
      "id": "ap-sample-04",
      "status": "sample",
      "region": "경기",
      "district": "수원시 영통구",
      "area": "경기 수원시 영통구",
      "area_note": "신축 오피스 배후 상권 · 테이크아웃·배달 중심 · 매일 08:00~21:30 영업",
      "category": "카페",
      "brand": "저가 커피 프랜차이즈",
      "brand_note": "국내 대형 브랜드",
      "store_spec": "1층 · 11평",
      "store_floor": "1층",
      "store_pyeong": 11,
      "initial_cost": {
        "total_manwon": 30000,
        "label": "3억 원",
        "items": [
          {
            "label": "점포 예치금",
            "value": "3,000만 원"
          },
          {
            "label": "시설·영업권",
            "value": "2억 7,000만 원"
          }
        ]
      },
      "monthly_sales": {
        "avg_manwon": 7750,
        "label": "월 평균 7,750만 원"
      },
      "profit": {
        "label": "월 약 1,925만 원",
        "avg_manwon": 1925,
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
            1750,
            1750
          ],
          "range": "1,750만 원",
          "share": "매출의 22.6%"
        }
      ],
      "points": [
        "매니저 운영으로 점주 개입을 줄인 구조입니다",
        "배달 62%, 단가 방어형 메뉴 구성",
        "최근 3년 매출이 꾸준히 올라온 매장입니다"
      ],
      "check_note": "매출 규모가 큰 만큼 재료비와 배달 수수료의 절대 금액도 큽니다. 원자료 확인이 필요합니다.",
      "keywords": [
        "매니저",
        "배달",
        "오피스",
        "주거"
      ],
      "private_deals": [
        {
          "label": "매니저 근속 조건",
          "detail": "현 매니저 2년 근속 · 인수 후 3개월 인수인계"
        }
      ],
      "visible": true
    }
  ];

  var state = {
    listings: [],
    filters: { q: '', region: '', category: '', budget: '' },
    chips: { region: '', budget: '' },
    lastFocus: null,
    currentListing: null,
    modalView: 'detail',
    usingFallback: false,
    lead: null,
    gatePending: null,
    gateContext: null,
    lastCriteria: null,
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

  function saveLead(payload) {
    state.lead = payload;
    try { localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(payload)); } catch (e) { /* 저장 불가 환경 무시 */ }
    try { sessionStorage.setItem(LEAD_SESSION_KEY, JSON.stringify(payload)); } catch (e2) { /* 무시 */ }
    try {
      var all = safeParse(localStorage.getItem(LEAD_ALL_KEY));
      if (!(all instanceof Array)) all = [];
      all = all.filter(function (x) { return x && x.lead_id !== payload.lead_id; });
      all.unshift(payload);
      localStorage.setItem(LEAD_ALL_KEY, JSON.stringify(all.slice(0, 300)));
    } catch (e3) { /* 무시 */ }
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

  function leadCriteriaText(c) {
    if (!c) return '';
    var parts = [];
    if ((c.category || []).length) parts.push(c.category.join('/'));
    if (c.brand_text) parts.push(c.brand_text);
    if ((c.area || []).length) parts.push(c.area.join('/'));
    if (c.budget) parts.push(c.budget);
    return parts.join(' · ');
  }

  function buildLeadPayload(form, ctx) {
    var now = new Date();
    var crit = {
      category: (form.category || []).slice(),
      brand_text: (form.brand || '').trim(),
      area: (form.area || []).slice(),
      budget: form.budget || ''
    };
    var payload = {
      form_version: 'lead-gate-v1',
      lead_id: leadId(),
      submitted_at: now.toISOString(),
      source: (ctx && ctx.source) || 'site',
      store: ctx && ctx.store
        ? { id: ctx.store.id, area: ctx.store.area, brand: ctx.store.brand, category: ctx.store.category }
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
      payload.stores = ctx.stores.map(function (L) {
        return { id: L.id, area: L.area, brand: L.brand, initial_cost: L.initial_cost.label };
      });
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

  /* 구글 시트(Apps Script) · Formspree · 자체 웹훅 모두 JSON POST 로 받습니다. */
  function sendLead(payload) {
    if (!LEAD_ENDPOINT) { queueLead(payload); return Promise.resolve({ sent: false, reason: 'no-endpoint' }); }
    return fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { sent: true };
    }).catch(function (err) {
      queueLead(payload);
      return { sent: false, reason: String((err && err.message) || err) };
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
      line.textContent = text;
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
      ? esc(ctx.store.area + ' · ' + ctx.store.brand) + '의 상세 지출 구성과 비공개 매물을 확인합니다.'
      : (ctx && ctx.source === 'compare' && ctx.stores && ctx.stores.length)
        ? '선택한 점포 ' + ctx.stores.length + '곳의 비교 상담을 준비합니다.'
        : '조건에 맞는 후보의 매칭 이유와 상세 내용을 바로 확인합니다.';
    return '' +
      '<div class="gate-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>STEP 2 · 4-FIELD ACCESS</p>' +
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
              '<span><b>(필수)</b> 상담 안내를 위한 휴대폰 번호 수집·이용에 동의합니다. 번호는 상담 목적으로만 사용하며, 이 시안에서는 이 브라우저에만 저장됩니다.</span></label>' +
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
      rows.push(['비교 점포', payload.stores.map(function (s) { return s.area + ' ' + s.brand; }).join(' / ')]);
    }
    return rows.map(function (r) {
      return '<div><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>';
    }).join('');
  }

  function gateSuccessHTML(payload, isView) {
    var json = JSON.stringify(payload, null, 2);
    var sourceLabel = payload.source === 'detail' ? '상세 보기 잠금 해제'
      : payload.source === 'matching' ? '맞춤 매칭 잠금 해제'
      : payload.source === 'compare' ? '비교 상담 신청' : '4항목 접수';
    return '' +
      '<div class="gate-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>' + (isView ? 'LEAD DB · SAVED' : 'UNLOCKED') + '</p>' +
        '<h3 id="gateTitle">' + (isView ? '저장된 4항목 DB' : '잠금이 해제됐습니다') + '</h3>' +
        '<p>' + (isView
          ? '이 브라우저에 저장된 4항목 입력값과 전송용 JSON 페이로드입니다.'
          : '이제 매칭 이유 · 상세 지출 · 비공개 매물을 바로 확인하실 수 있습니다.') + '</p>' +
      '</div>' +
      '<div class="gate-body">' +
        '<div class="gate-receipt">' +
          '<div class="gate-receipt-head">' +
            '<span class="receipt-icon">' + checkIcon() + '</span>' +
            '<div><strong>접수번호 ' + esc(payload.lead_id) + '</strong><span>' + esc(sourceLabel) + '</span></div>' +
          '</div>' +
          '<div class="receipt-summary">' + gateSummaryRows(payload) + '</div>' +
        '</div>' +
        '<div class="payload-box">' +
          '<div class="payload-head"><strong>4항목 DB · JSON 페이로드</strong>' +
            '<button type="button" class="btn btn-quiet btn-xs" data-copy-payload>JSON 복사</button></div>' +
          '<pre class="payload" id="leadPayload">' + esc(json) + '</pre>' +
          '<p class="payload-note">이 JSON 그대로 구글 시트 · 이메일 · 웹훅으로 보낼 수 있습니다. 지금은 브라우저에 저장되고 전송 대기열에 함께 쌓입니다. (전송 주소: <code>app.js</code>의 <code>LEAD_ENDPOINT</code>)</p>' +
        '</div>' +
        '<div class="gate-actions">' +
          (isView
            ? '<button type="button" class="btn btn-navy btn-lg" data-close-gate>닫기</button>'
            : '<button type="button" class="btn btn-gold btn-lg" data-gate-continue>확인하고 이어서 보기</button>') +
          '<button type="button" class="btn btn-quiet" data-gate-restart>다시 입력</button>' +
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

    saveLead(payload);
    sendLead(payload);
    renderGate(gateSuccessHTML(payload, false));
    bindGateBody();
    var panel = $('.gate-panel', gateEl);
    if (panel) panel.scrollTop = 0;
    refreshOpenModal();
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

    var copyBtn = $('[data-copy-payload]', body);
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var pre = $('#leadPayload', body);
        copyText(pre ? pre.textContent : '').then(function () {
          toast('4항목 DB JSON을 복사했습니다.');
        }).catch(function () {
          toast('복사가 막혀 있습니다. 페이로드를 직접 선택해 주세요.');
        });
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

    var cont = $('[data-gate-continue]', body);
    if (cont) {
      cont.addEventListener('click', function () {
        var pending = state.gatePending;
        state.gatePending = null;
        closeGate();
        if (pending && pending.type === 'match' && pending.criteria) {
          respond(pending.criteria);
        } else if (pending && pending.type === 'detail') {
          refreshOpenModal();
          toast('잠금이 해제되었습니다. 상세 지출과 비공개 매물을 확인하세요.');
        } else if (pending && pending.type === 'compare') {
          openCompareReceipt(pending.stores || []);
        }
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
    $all('#leadStatus [data-view-lead]').forEach(function (btn) {
      btn.addEventListener('click', function () { openGate('view'); });
    });
    $all('#leadStatus [data-reset-lead]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearLead();
        toast('4항목 입력을 초기화했습니다. 상세 내용이 다시 잠깁니다.');
      });
    });
  }

  /* ---------------- data ---------------- */
  /* 예상 순수익은 평균치 한 값으로 다룬다. 범위가 아닌 한 값짜리 표기에는 '약'을 붙여 평균임을 드러낸다
     (관리자·CSV에서 평균치 하나로 등록한 매물도, 예전 범위 표기 매물도 같은 방식으로 표시된다). */
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

  function normalize(list) {
    return (list || []).map(function (L) {
      L.keywords = L.keywords || [];
      L.points = L.points || [];
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
    return fetch('data/listings.sample.json', { cache: 'no-store' })
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
        return '<span class="compare-chip">' + esc(L.district || L.area) + ' · ' + esc(L.brand) +
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
      return '<th scope="col"><span class="cmp-area">' + esc(L.area) + '</span><b>' + esc(L.brand) + '</b>' +
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
    var names = stores.map(function (L) { return L.area + ' ' + L.brand; });
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
              return '<div><span>' + esc(L.area) + '</span><b>' + esc(L.brand) + ' · ' + esc(L.initial_cost.label) + '</b></div>';
            }).join('') +
            (lead && lead.contact ? '<div><span>연락처</span><b>' + esc(lead.contact.phone) + '</b></div>' : '') +
          '</div>' +
          '<div class="receipt-note"><b>다음 단계</b><br />김현율 팀장이 남겨주신 번호로 연락해 선택한 ' + stores.length + '곳의 실사 일정과 비교 자료를 정리해 드립니다. 시안에서는 실제 전송 없이 이 브라우저에만 저장됩니다.</div>' +
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
            '<span><b>(필수)</b> 양도 상담을 위한 연락처 수집·이용에 동의합니다. 번호는 상담 목적으로만 사용하며, 이 시안에서는 이 브라우저에만 저장됩니다.</span></label>' +
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
        '<p>접수번호 <b style="color:#E7D6B0">' + esc(payload.request_id) + '</b></p>' +
      '</div>' +
      '<div class="modal-content">' +
        '<div class="receipt">' +
          '<div class="receipt-icon" aria-hidden="true">' + checkIcon() + '</div>' +
          '<h4>' + esc(payload.brand) + ' · ' + esc(payload.area) + '</h4>' +
          '<p class="no">' + esc(payload.request_id) + '</p>' +
          '<div class="receipt-summary">' +
            '<div><span>브랜드 / 업종</span><b>' + esc(payload.brand) + '</b></div>' +
            '<div><span>지역</span><b>' + esc(payload.area) + '</b></div>' +
            '<div><span>월 평균 매출</span><b>' + manwonLabel(payload.monthly_sales_manwon) + '</b></div>' +
            '<div><span>희망 권리금</span><b>' + manwonLabel(payload.premium_manwon) + '</b></div>' +
            '<div><span>연락처</span><b>' + esc(payload.contact.phone) + '</b></div>' +
          '</div>' +
          '<div class="receipt-note"><b>다음 단계</b><br />김현율 팀장이 남겨주신 번호로 연락해 매출·지출 원자료와 권리금 근거를 함께 확인합니다. 시안에서는 실제 전송 없이 이 브라우저에만 저장됩니다.</div>' +
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
      form_version: 'sell-request-v1',
      request_id: 'SELL-' + leadStamp(now) + '-' + String(Math.floor(Math.random() * 9000) + 1000),
      submitted_at: now.toISOString(),
      brand: brand.trim(),
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
    return [
      L.area, L.area_note, L.category, L.brand, L.brand_note, L.store_spec,
      (L.keywords || []).join(' '), L.district
    ].join(' ').toLowerCase();
  }

  function filteredListings() {
    var f = state.filters;
    var q = f.q.trim().toLowerCase();
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
    var band = budgetBand(L.initial_cost.total_manwon);
    var tags = (L.keywords || []).slice(0, 2).map(function (k) {
      return '<span class="tag">' + esc(k) + '</span>';
    }).join('');
    return '' +
      '<article class="listing-card" role="button" tabindex="0" data-id="' + esc(L.id) + '" ' +
        'aria-label="' + esc(L.area + ' ' + L.brand + ' 상세 보기') + '">' +
        '<div class="card-visual">' +
          '<span class="card-monogram" aria-hidden="true">' + esc(shortName(L.district)) + '</span>' +
          '<div class="card-region">' +
            '<span>' + esc(L.region.toUpperCase()) + ' · ' + esc(L.category) + '</span>' +
            '<strong>' + esc(L.area) + '</strong>' +
          '</div>' +
          '<div class="card-badges">' +
            '<span class="badge-sample' + (isSample(L) ? '' : ' live') + '">' + (isSample(L) ? 'SAMPLE' : '등록') + '</span>' +
            (L.private_only ? '<span class="badge-private">비공개전용</span>' : '') +
            '<span class="badge-cat">' + esc(bandLabel(band)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + esc(L.brand) + ' <span style="font-weight:500;color:#6C7688;font-size:13px">· ' + esc(L.brand_note) + '</span></h3>' +
          '<p class="card-note">' + esc(storeLineText(L)) + '</p>' +
          '<div class="card-figures">' +
            '<div><span>초기 인수 비용</span><b class="gold">' + esc(L.initial_cost.label) + '</b></div>' +
            '<div><span>월 평균 매출</span><b>' + esc(L.monthly_sales.label.replace('월 평균 ', '')) + '</b></div>' +
            '<div><span>예상 순수익</span><b>' + esc(L.profit.label.replace('월 ', '')) + '</b></div>' +
          '</div>' +
          (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
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
    if (region) region.addEventListener('change', function () { state.filters.region = region.value; renderListings(); });
    if (category) category.addEventListener('change', function () { state.filters.category = category.value; renderListings(); });
    if (budget) budget.addEventListener('change', function () { state.filters.budget = budget.value; renderListings(); });
    if (reset) {
      reset.addEventListener('click', function () {
        state.filters = { q: '', region: '', category: '', budget: '' };
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
      (deals ? '<section class="modal-section"><h4>비공개 매물</h4><div class="private-list">' + deals + '</div></section>' : '');
  }

  function modalDetailHTML(L) {
    var band = budgetBand(L.initial_cost.total_manwon);
    var unlocked = hasLead();
    var lead = unlocked ? readLead() : null;
    var leadLine = lead ? leadCriteriaText(lead.criteria) : '';

    return '' +
      '<div class="modal-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>STORE DETAIL' + (isSample(L) ? ' · SAMPLE' : '') + '</p>' +
        '<h3 id="modalTitle">' + esc(L.area) + ' · ' + esc(L.brand) + '</h3>' +
        '<p>' + esc(storeLineText(L)) + '</p>' +
        '<div class="modal-hero-tags">' +
          '<span class="gold">' + (isSample(L) ? '가상 샘플' : '등록 매물') + '</span>' +
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
              (leadLine ? '<span>' + esc(leadLine) + '</span>' : '') + '</div>' +
            detailSectionsHTML(L)
          : '<div class="detail-lock">' +
              '<div class="detail-lock-blur" aria-hidden="true" inert>' + detailSectionsHTML(L) + '</div>' +
              '<div class="detail-lock-overlay">' +
                '<span class="lock-badge">' + lockIcon() + '2단계 잠금</span>' +
                '<strong>상세 지출과 비공개 매물은<br />4항목 입력 후 열립니다</strong>' +
                '<p>희망 업종·지역·예산·연락처를 한 번만 남기시면 항목별 지출 금액과 비율, 확인 포인트, 같은 상권의 비공개 매물까지 바로 보실 수 있습니다.</p>' +
                '<button class="btn btn-gold btn-lg" type="button" data-open-gate="detail">상세 지출·비공개 매물 더 보기</button>' +
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
        '<p class="modal-sample-line">' + (isSample(L)
          ? '이 점포는 사이트 구조를 보여드리기 위한 가상 샘플이며 실제 점포가 아닙니다. (' + esc(bandLabel(band)) + ' 구간)'
          : '등록 매물 · 표시 수치는 점주 제시 자료 기준입니다. (' + esc(bandLabel(band)) + ' 구간)') + '</p>' +
      '</div>';
  }

  function modalFormHTML(L) {
    return '' +
      '<div class="modal-hero">' +
        '<p class="eyebrow"><span class="eyebrow-line"></span>REQUEST DETAILS</p>' +
        '<h3 id="modalTitle">상세 자료 요청</h3>' +
        '<p>' + esc(L.area) + ' · ' + esc(L.brand) + ' · ' + esc(L.initial_cost.label) + '</p>' +
        '<div class="modal-hero-tags"><span class="gold">가상 샘플</span><span>' + esc(L.category) + '</span></div>' +
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
            '<span>상담을 위한 이름·연락처 수집 및 이용에 동의합니다. (시안 버전에서는 입력 내용이 이 브라우저에만 저장됩니다.)</span></label>' +
          '<p class="form-error" id="formError" hidden></p>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-quiet" data-back="' + esc(L.id) + '">이전</button>' +
            '<button type="submit" class="btn btn-gold">상담 요청 보내기</button>' +
          '</div>' +
        '</form>' +
      '</div>';
  }

  function receiptHTML(L, data) {
    var no = 'AP-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 9000) + 1000);
    var bodyLines = [
      '[에이피파트너 상담 요청]',
      '점포: ' + L.area + ' ' + L.brand + ' (샘플)',
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
          '<p class="no">' + esc(L.area) + ' · ' + esc(L.brand) + '</p>' +
          '<div class="receipt-summary">' +
            '<div><span>점포</span><b>' + esc(L.area) + ' ' + esc(L.brand) + ' (샘플)</b></div>' +
            '<div><span>연락처</span><b>' + esc(data.phone) + '</b></div>' +
            '<div><span>희망 예산</span><b>' + esc(data.budget || '미선택') + '</b></div>' +
            '<div><span>상담 희망</span><b>' + esc(data.when || '언제든 괜찮습니다') + '</b></div>' +
          '</div>' +
          '<div class="receipt-note">' +
            '<b>1차 시안 안내</b><br />지금은 실제로 전송되지 않고 입력 내용이 이 브라우저에만 저장됩니다. ' +
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

        var data = { name: name, phone: phone, budget: budget, when: when, message: message, listing: L.id, at: new Date().toISOString() };
        try {
          var saved = JSON.parse(localStorage.getItem('apPartnerRequests') || '[]');
          saved.push(data);
          localStorage.setItem('apPartnerRequests', JSON.stringify(saved));
        } catch (e) { /* 저장 실패는 무시 */ }

        $('#modalBody').innerHTML = receiptHTML(L, data);
        $('.modal-panel', modal).scrollTop = 0;
        bindModalBody();
      });
    }
  }

  /* ---------------- AI concierge ---------------- */
  var chatBusy = false;
  var lastUserEl = null;

  function addMessage(html, kind, extraClass) {
    var log = $('#chatLog');
    var el = document.createElement('div');
    el.className = 'msg ' + (kind === 'user' ? 'msg-user' : 'msg-bot') + (extraClass ? ' ' + extraClass : '');
    el.innerHTML = html;
    log.appendChild(el);
    if (kind === 'user') lastUserEl = el;
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

  function parseInput(text) {
    var out = { region: '', budget: '', category: '', tokens: [] };
    var t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t) return out;

    if (/서울|마포|강남|종로|영등포|관악|금천|송파|홍대/.test(t)) out.region = '서울';
    else if (/경기|성남|분당|수원|용인|부천|안양|일산|위례/.test(t)) out.region = '경기';
    else if (/인천|부평|송도|계양/.test(t)) out.region = '인천';

    if (/3\s*억/.test(t)) out.budget = '3억 이상';
    else if (/1\s*억\s*미만|[5-9]\s*천|오천|육천|칠천/.test(t)) out.budget = '1억 미만';
    else if (/2\s*억/.test(t)) out.budget = '2억대';
    else if (/1\s*억/.test(t)) out.budget = '1억대';

    out.operation = operationIntentOf(t);

    if (/디저트|케이크|빵|베이커리|마카롱/.test(t)) out.category = '디저트';
    else if (/치킨|식당|음식|분식|고기|국밥|주점|술집/.test(t)) out.category = '음식점';
    else if (/카페|커피/.test(t)) out.category = '카페';

    var stop = /^(서울|경기|인천|마포|강남|종로|성남|분당|수원|부평|억|억대|만원|카페|커피|디저트|음식점|치킨|오토|반오토|직접|운영|매장|점포|있는|하고|싶어요|싶습니다|해주세요|추천|찾아|보여|주세요|그리고|정도|이상|미만)$/;
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
    var title = masked ? (L.region + ' · ●●') : (L.area + ' · ' + L.brand);
    var reason = masked
      ? L.category
      : (m.reasons.join(' / ') || L.area_note);
    function fig(label, value) {
      return '<div><span>' + label + '</span><b>' + (masked ? '●●●' : esc(value)) + '</b></div>';
    }
    return '' +
      '<div class="mini-list">' +
        '<button type="button" class="mini-card' + (masked ? ' is-masked' : '') + '"' +
          (masked ? ' tabindex="-1" aria-hidden="true"' : ' data-open="' + esc(L.id) + '"') + '>' +
          '<div class="mini-top">' +
            '<strong>' + esc(title) + '</strong>' +
            '<span class="mini-tag">' + (masked ? 'LOCKED' : 'MATCH') + '</span>' +
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

  function teaserHTML(matches) {
    var rows = matches.map(function (m) {
      var L = m.listing;
      return '' +
        '<div class="teaser-row">' +
          '<span class="tr-lock" aria-hidden="true">' + lockIcon() + '</span>' +
          '<div class="tr-main">' +
            '<strong>' + esc(L.region + ' · ●●') + '</strong>' +
            '<span>' + esc(L.category) + ' · 초기 인수 ●●●</span>' +
          '</div>' +
          '<span class="tr-fig" aria-hidden="true">●●●</span>' +
        '</div>';
    }).join('');

    return '' +
      '<div class="teaser">' +
        '<div class="teaser-head">' +
          '<span class="lock-badge">' + lockIcon() + '2단계 · 4항목 입력 후 공개</span>' +
          '<strong>후보 ' + matches.length + '곳이 준비됐습니다</strong>' +
          '<p>희망 업종·지역·예산·연락처를 남기면 매칭 이유와 상세 요약이 바로 열립니다.</p>' +
        '</div>' +
        '<div class="teaser-rows">' + rows + '</div>' +
        '<button class="btn btn-gold teaser-cta" type="button" data-open-gate="match">AI 맞춤 매칭 결과 확인</button>' +
      '</div>';
  }

  function scrollToLastUser() {
    var log = $('#chatLog');
    if (lastUserEl && log && log.scrollHeight > log.clientHeight) {
      log.scrollTop = Math.max(0, lastUserEl.offsetTop - 2);
    }
  }

  function respond(criteria) {
    var cond = conditionLabel(criteria);
    var res = matchListings(criteria);
    var ctaId = res.matches.length ? res.matches[0].listing.id : (state.listings[0] || {}).id;
    state.lastCriteria = criteria;

    var intro;
    if (!cond) {
      intro = '<p>조건을 조금 더 알려주시면 딱 맞는 후보를 골라 드릴 수 있어요. 우선 <b>샘플 점포</b> 중에서 조건을 넓게 봤을 때 비교적 무난한 두 곳을 골랐습니다.</p>';
    } else if (res.loose) {
      intro = '<p>말씀하신 <b>' + esc(cond) + '</b> 조건에 정확히 맞는 점포는 아직 샘플에 없습니다. 대신 조건에 가까운 순서로 <b>' + res.matches.length + '곳</b>을 추렸습니다.</p>';
    } else {
      intro = '<p>말씀하신 <b>' + esc(cond) + '</b> 조건으로 샘플 점포를 비교했어요. 조건에 가까운 후보 <b>' + res.matches.length + '곳</b>입니다.</p>';
    }
    if (criteria.operation) {
      intro += '<p class="op-note">점포마다 운영 형태를 따로 표시하지는 않습니다. 대신 <b>매출 규모 · 인건비 비중 · 매장 규모</b>를 보고 말씀하신 운영 계획이 통할 점포를 골라, 아래 카드에 판단 이유를 적었습니다.</p>';
    }

    // 2단계 잠금: 매칭 결과는 4항목 입력 후에 공개됩니다.
    if (!hasLead() && res.matches.length) {
      addMessage(intro);
      addMessage(teaserHTML(res.matches), 'bot', 'msg-wide');
      addMessage(
        '<p>희망 업종·지역·예산·연락처 4가지를 남기시면 매칭 이유와 상세 요약이 바로 열립니다. 한 번 입력하면 이 브라우저에서는 다시 묻지 않습니다.</p>' +
        '<div class="msg-cta">' +
          '<a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담 010-2885-5553</a>' +
        '</div>'
      );
      bindChatActions();
      scrollToLastUser();
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
        '<p>지금은 조건에 맞는 샘플 점포가 없습니다. 어떤 조건까지 조정 가능한지 알려주시면 후보를 다시 정리해 드릴게요.</p>' +
        '<div class="msg-cta"><a class="btn btn-navy" href="' + PHONE_TEL + '">전화 상담 010-2885-5553</a></div>'
      );
    }
    bindChatActions();
    scrollToLastUser();
  }

  function bindChatActions() {
    var log = $('#chatLog');
    $all('[data-open-gate]', log).forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        openGate('form', {
          pending: { type: 'match', criteria: state.lastCriteria },
          context: { source: 'matching', criteria: state.lastCriteria }
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
    initListingFilters();

    loadListings().then(function (result) {
      state.listings = result.listings;
      state.usingFallback = result.local;
      loadCompare();
      renderCompareBar();
      if (result.local) {
        var notice = document.createElement('p');
        notice.className = 'sample-notice-fallback';
        notice.style.cssText = 'margin:-8px 0 18px;font-size:12px;color:#8A6D3B;';
        notice.textContent = '지금은 파일로 직접 열려 예비 데이터를 보여드리고 있습니다. 로컬 서버나 배포 환경에서는 data/listings.sample.json 내용이 그대로 반영됩니다.';
        var anchor = $('.sample-notice');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(notice, anchor.nextSibling);
      }
      renderListings();
    });
  });
})();
