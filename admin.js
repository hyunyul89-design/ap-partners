/* ==========================================================================
   AP PARTNERS · 에이피파트너 — 관리자 시안 (site/admin.html)
   - 로그인: 시안용 비밀번호(ap2026) → sessionStorage 유지
   - 점포 관리: 등록 · 수정 · 거래완료(비노출) · 삭제 → localStorage 'apPartnerCatalog'
     (index.html 이 이 목록을 우선 사용하므로 저장 즉시 사이트에 반영)
   - 손님 DB: index.html 4항목 게이트가 'apPartnerLeads' 에 쌓은 DB → 상태 변경 · CSV 다운로드
   ========================================================================== */
(function () {
  'use strict';

  var ADMIN_PW = 'ap2026';
  var AUTH_KEY = 'apAdminAuth';
  var CATALOG_KEY = 'apPartnerCatalog';
  var LEAD_ALL_KEY = 'apPartnerLeads';
  var LEAD_ONE_KEY = 'apPartnerLead';
  var LEAD_STATUS_KEY = 'apPartnerLeadStatus';
  var SELL_KEY = 'apPartnerSellRequests';
  var TG_KEY = 'apTelegramConfig';

  var state = {
    listings: [],
    managed: false,
    leads: [],
    leadStatus: {},
    leadFilter: 'all',
    sell: [],
    tg: null,
    editingId: null,
    bulk: null
  };

  /* ---------------- utils ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function readStore(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function writeStore(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } }

  function num(id) {
    var el = $(id);
    if (!el) return 0;
    var v = parseFloat(String(el.value || '').replace(/[^0-9.]/g, ''));
    return isNaN(v) ? 0 : v;
  }
  function val(id) { var el = $(id); return el ? String(el.value || '').trim() : ''; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* 만 원 단위 → '2억 1,000만 원' */
  function wonLabel(manwon) {
    var m = Math.round(manwon || 0);
    if (m <= 0) return '0만 원';
    if (m >= 10000) {
      var eok = Math.floor(m / 10000);
      var rest = m % 10000;
      return eok + '억' + (rest ? ' ' + comma(rest) + '만' : '') + ' 원';
    }
    return comma(m) + '만 원';
  }

  /* 만 원 금액 범위 → '480~560만 원' */
  function wonRange(a, b) {
    a = Math.round(a || 0);
    b = Math.round(b || 0);
    if (!a && !b) return '';
    if (!b) b = a;
    var lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo === hi) return wonLabel(lo);
    if (hi < 10000) return comma(lo) + '~' + comma(hi) + '만 원';
    return wonLabel(lo) + '~' + wonLabel(hi);
  }

  /* 매출 대비 비중(%) 문자열 */
  function pctRange(a, b) {
    var lo = Math.round((Number(a) || 0) * 10) / 10;
    var hi = Math.round((Number(b == null ? a : b)) * 10) / 10;
    return lo === hi ? String(lo) : lo + '~' + hi;
  }

  /* ---------------- 매장 규모 (층수 · 평수) ----------------
     입력은 층수·평수 두 칸으로 나누고, 저장·표시는 '1층 · 13평' 한 줄로 한다. */
  var SPEC_EMPTY = '상담 시 안내';
  var NOTE_EMPTY = '상담 시 상권 설명';

  function normalizeFloor(v) {
    var s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
    if (!s) return '';
    if (/^[0-9]+$/.test(s)) return s + '층';
    return s;
  }

  function normalizePyeong(v) {
    var n = String(v == null ? '' : v).replace(/[^0-9.]/g, '');
    if (!n) return '';
    var num = parseFloat(n);
    if (isNaN(num)) return '';
    return String(num).replace(/\.0$/, '');
  }

  function composeSpec(floor, pyeong) {
    var f = normalizeFloor(floor);
    var p = normalizePyeong(pyeong);
    return [f, p ? p + '평' : ''].filter(Boolean).join(' · ');
  }

  /* '1층 · 12평 · 테이크아웃 중심' 같은 기존 문자열에서 층수·평수·나머지를 나눈다. */
  function specParts(L) {
    L = L || {};
    var floor = normalizeFloor(L.store_floor);
    var pyeong = normalizePyeong(L.store_pyeong);
    var extras = [];
    var raw = String(L.store_spec || '').trim();
    if (raw && raw !== SPEC_EMPTY) {
      raw.split('·').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (seg) {
        var hasFloor = /층/.test(seg);
        var hasPyeong = /평/.test(seg);
        if (hasFloor && !hasPyeong) {
          if (!floor) floor = normalizeFloor(seg);
          return;
        }
        if (hasPyeong && !hasFloor) {
          if (!pyeong) pyeong = normalizePyeong(seg);
          return;
        }
        extras.push(seg);
      });
    }
    return { floor: floor, pyeong: pyeong, extras: extras };
  }

  function updateSpecPreview() {
    var out = $('#fSpecPreview');
    if (!out) return;
    var spec = composeSpec(val('#fFloor'), val('#fPyeong'));
    out.textContent = spec ? '→ ' + spec : '층수 · 평수 순서로 입력 (예: 1층 · 13평)';
  }

  function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }

  /* ISO(UTC) → KST 'YYYY-MM-DD HH:MM' */
  function kst(iso, shortStyle) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var t = new Date(d.getTime() + 9 * 3600 * 1000);
    var md = pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
    var hm = pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes());
    return shortStyle ? (md + ' ' + hm) : (t.getUTCFullYear() + '-' + md + ' ' + hm);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }

  /* ---------------- auth ---------------- */
  function isAuthed() {
    try { return sessionStorage.getItem(AUTH_KEY) === '1'; } catch (e) { return false; }
  }
  function setAuthed(on) {
    try { on ? sessionStorage.setItem(AUTH_KEY, '1') : sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* 무시 */ }
  }

  function showLogin() {
    $('#adminLogin').hidden = false;
    $('#adminApp').hidden = true;
    $('#logoutBtn').hidden = true;
    var pw = $('#adminPw');
    if (pw) pw.value = '';
  }

  function enterApp() {
    $('#adminLogin').hidden = true;
    $('#adminApp').hidden = false;
    $('#logoutBtn').hidden = false;
    loadData().then(function () {
      loadSell();
      loadTelegram();
      renderStats();
      renderStores();
      renderLeads();
      renderSell();
    });
  }

  function initLogin() {
    var form = $('#loginForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = val('#adminPw');
      var err = $('#loginError');
      if (pw !== ADMIN_PW) {
        if (err) { err.textContent = '비밀번호가 맞지 않습니다. 시안용 비밀번호는 ap2026 입니다.'; err.hidden = false; }
        return;
      }
      if (err) err.hidden = true;
      setAuthed(true);
      enterApp();
      toast('관리자 화면을 열었습니다.');
    });
    var logout = $('#logoutBtn');
    if (logout) logout.addEventListener('click', function () {
      setAuthed(false);
      if ($('#bulkPanel')) closeBulk();
      showLogin();
      toast('로그아웃했습니다.');
    });
  }

  /* ---------------- data ---------------- */
  function loadData() {
    var cat = safeParse(readStore(CATALOG_KEY));
    if (cat && cat.listings instanceof Array) {
      state.listings = cat.listings;
      state.managed = true;
    } else {
      return fetch('data/listings.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (json) { state.listings = (json && json.listings) || []; state.managed = false; })
        .catch(function () { state.listings = []; state.managed = false; });
    }
    return Promise.resolve();
  }

  function persist() {
    writeStore(CATALOG_KEY, JSON.stringify({
      updated_at: new Date().toISOString(),
      version: 'admin-1',
      listings: state.listings
    }));
    state.managed = true;
    var note = $('#catalogNote');
    if (note) note.hidden = true;
  }

  /* ---------------- stats / tabs ---------------- */
  function liveCount() {
    return state.listings.filter(function (L) { return L.visible !== false && L.status !== 'closed'; }).length;
  }

  function renderStats() {
    $('#statTotal').innerHTML = state.listings.length + '<small>곳</small>';
    $('#statLive').innerHTML = liveCount() + '<small>곳</small>';
    $('#statLeads').innerHTML = state.leads.length + '<small>건</small>';
    var newCnt = state.leads.filter(function (l) { return (state.leadStatus[l.lead_id] || 'new') === 'new'; }).length;
    $('#statNew').innerHTML = newCnt + '<small>건</small>';
    $('#statSell').innerHTML = state.sell.length + '<small>건</small>';
    $('#tabStoreCount').textContent = String(state.listings.length);
    $('#tabLeadCount').textContent = String(state.leads.length);
    $('#tabSellCount').textContent = String(state.sell.length);
    var note = $('#catalogNote');
    if (note) note.hidden = state.managed;
  }

  function initTabs() {
    var tabs = [$('#tabStores'), $('#tabLeads'), $('#tabSell'), $('#tabNotify')];
    var panels = [$('#panelStores'), $('#panelLeads'), $('#panelSell'), $('#panelNotify')];
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t, j) {
          t.setAttribute('aria-selected', i === j ? 'true' : 'false');
          panels[j].hidden = i !== j;
        });
      });
    });
  }

  /* ---------------- 점포 폼 ---------------- */
  function openForm(L) {
    state.editingId = L ? L.id : null;
    $('#storeForm').hidden = false;
    $('#storeFormTitle').textContent = L ? '점포 수정' : '새 점포 등록';

    if (!L) {
      $('#fRegion').value = '서울';
      $('#fCategory').value = '카페';
      $('#fPrivate').value = 'N';
      ['#fDistrict', '#fBrand', '#fNote', '#fFloor', '#fPyeong', '#fDeposit', '#fPremium',
        '#fSales', '#fProfit', '#fMat', '#fLabor', '#fFixed', '#fEtc', '#fCheckNote', '#fPoints']
        .forEach(function (id) { var el = $(id); if (el) el.value = ''; });
      $('#fMat').value = '34';
      $('#fLabor').value = '520';
      $('#fFixed').value = '180';
      $('#fEtc').value = '115';
    } else {
      $('#fRegion').value = ['서울', '경기', '인천'].indexOf(L.region) !== -1 ? L.region : '기타';
      $('#fCategory').value = ['카페', '디저트', '음식점', '치킨'].indexOf(L.category) !== -1 ? L.category : '기타';
      $('#fPrivate').value = L.private_only ? 'Y' : 'N';
      $('#fDistrict').value = L.district || '';
      $('#fBrand').value = L.brand || '';
      /* 매장 규모: 층수·평수 칸에 나눠 넣고, 기존 문자열의 나머지 설명은 한줄평으로 옮긴다. */
      var sp = specParts(L);
      $('#fFloor').value = sp.floor || '';
      $('#fPyeong').value = sp.pyeong || '';
      var note = String(L.area_note || '').trim();
      if (note === NOTE_EMPTY) note = '';
      var extrasText = sp.extras.join(' · ');
      if (extrasText) note = note ? (note + ' · ' + extrasText) : extrasText;
      $('#fNote').value = note;
      var items = (L.initial_cost && L.initial_cost.items) || [];
      var dep = items[0] ? amountRange(items[0].value) : null;
      var prem = items[1] ? amountRange(items[1].value) : null;
      $('#fDeposit').value = dep ? Math.round(dep[0]) : '';
      $('#fPremium').value = prem ? Math.round(prem[1] || prem[0]) : '';
      $('#fSales').value = (L.monthly_sales && L.monthly_sales.avg_manwon) || '';
      $('#fProfit').value = profitValue(L);
      var byLabel = {};
      (L.expenses || []).forEach(function (ex) { byLabel[expLabel(ex)] = ex; });
      var salesAvg = (L.monthly_sales && L.monthly_sales.avg_manwon) || 0;
      setExp('#fMat', byLabel['재료비'], 'pct', salesAvg);
      setExp('#fLabor', byLabel['인건비'], 'manwon', salesAvg);
      setExp('#fFixed', byLabel['매장 고정비'], 'manwon', salesAvg);
      setExp('#fEtc', byLabel['기타잡비'], 'manwon', salesAvg);
      $('#fCheckNote').value = L.check_note || '';
      $('#fPoints').value = (L.points || []).join('\n');
    }

    updateTotals();
    updateSpecPreview();
    var form = $('#storeForm');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#fDistrict').focus({ preventScroll: true });
    var err = $('#storeError');
    if (err) err.hidden = true;
  }

  function digits(s) {
    var m = String(s || '').replace(/[^0-9]/g, '');
    return m;
  }

  function expLabel(ex) {
    var label = String((ex && ex.label) || '').trim();
    var alias = { '배달·기타': '기타잡비', '배달·본사 비용': '기타잡비', '기타': '기타잡비' };
    return alias[label] || label;
  }

  /* 지출 항목 값 → 입력칸 채우기. 재료비는 %, 나머지는 만 원 금액.
     예전 데이터가 범위(480~560)면 평균치를 하나 넣는다. */
  function setExp(id, ex, unit, sales) {
    var el = $(id);
    if (!el) return;
    if (!ex) { el.value = ''; return; }
    if (unit === 'pct') {
      var pct = null;
      if (ex.pct instanceof Array) {
        pct = [Number(ex.pct[0]) || 0, Number(ex.pct[1] != null ? ex.pct[1] : ex.pct[0]) || 0];
      } else if (ex.amount && sales) {
        var amtPct = amountRange(ex.amount);
        if (amtPct) pct = [amtPct[0] / sales * 100, (amtPct[1] || amtPct[0]) / sales * 100];
      }
      el.value = pct ? (Math.round((pct[0] + pct[1]) / 2 * 10) / 10) : '';
      return;
    }
    var range = amountRange(ex.amount || ex.range);
    if (!range && ex.pct && sales) range = [sales * ex.pct[0] / 100, sales * (ex.pct[1] || ex.pct[0]) / 100];
    if (!range) { el.value = ''; return; }
    el.value = Math.round((range[0] + (range[1] || range[0])) / 2);
  }

  /* 예상 월 수익 → 입력칸 값(평균). 예전 범위 데이터는 두 값의 평균을 쓴다. */
  function profitValue(L) {
    var p = (L && L.profit) || {};
    var avg = Number(p.avg_manwon);
    if (avg > 0) return Math.round(avg);
    var vals = (String(p.label || '').match(/[0-9][0-9,]*(?:\.[0-9]+)?/g) || [])
      .map(function (s) { return parseFloat(s.replace(/,/g, '')); })
      .filter(function (n) { return !isNaN(n) && n > 0; });
    if (!vals.length) return '';
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
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

  function closeForm() {
    $('#storeForm').hidden = true;
    state.editingId = null;
  }

  function updateTotals() {
    var total = num('#fDeposit') + num('#fPremium');
    $('#fTotal').textContent = wonLabel(total);
    var sales = num('#fSales');

    /* 재료비: % → 월 금액 */
    var matOut = $('#fMatWon');
    if (matOut) {
      var ma = num('#fMat');
      matOut.textContent = (sales && ma)
        ? ('약 ' + wonLabel(sales * ma / 100))
        : '금액 자동 계산';
    }

    /* 인건비·매장 고정비·기타잡비: 만 원 → 매출 대비 % */
    [['#fLabor', '#fLaborWon'], ['#fFixed', '#fFixedWon'], ['#fEtc', '#fEtcWon']]
      .forEach(function (row) {
        var a = num(row[0]);
        var out = $(row[1]);
        if (!out) return;
        if (!sales || !a) { out.textContent = '매출 대비 비중 자동 계산'; return; }
        out.textContent = '매출의 ' + pctRange(a / sales * 100) + '%';
      });

    /* 예상 월 수익: 매출 대비 순수익 비중 */
    var profitOut = $('#fProfitShare');
    if (profitOut) {
      var p = num('#fProfit');
      profitOut.textContent = (sales && p)
        ? ('매출의 ' + pctRange(p / sales * 100) + '% · 순수익률')
        : '매출 대비 순수익률 자동 계산';
    }
  }

  function initForm() {
    $('#btnNewStore').addEventListener('click', function () { openForm(null); });
    $all('[data-cancel-store]').forEach(function (b) { b.addEventListener('click', closeForm); });
    ['#fDeposit', '#fPremium', '#fSales', '#fProfit', '#fMat', '#fLabor', '#fFixed', '#fEtc']
      .forEach(function (id) {
        var el = $(id);
        if (el) el.addEventListener('input', updateTotals);
      });
    ['#fFloor', '#fPyeong'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', updateSpecPreview);
    });
    $('#storeForm').addEventListener('submit', onSaveStore);
  }

  function onSaveStore(e) {
    e.preventDefault();
    var region = val('#fRegion');
    var district = val('#fDistrict');
    var brand = val('#fBrand');
    var floor = normalizeFloor(val('#fFloor'));
    var pyeong = normalizePyeong(val('#fPyeong'));
    var storeSpec = composeSpec(floor, pyeong);
    var note = val('#fNote');
    var sales = num('#fSales');
    var deposit = num('#fDeposit');
    var premium = num('#fPremium');
    var pMin = num('#fProfit');
    var err = $('#storeError');

    var problem = '';
    if (!district) problem = '지역구·상권을 입력해 주세요.';
    else if (!brand) problem = '브랜드·유형을 입력해 주세요.';
    else if (!sales) problem = '월 평균 매출을 입력해 주세요.';
    else if (!deposit && !premium) problem = '점포 예치금이나 권리금 중 하나는 입력해 주세요.';
    else if (!pMin) problem = '예상 월 수익을 입력해 주세요.';
    if (problem) {
      if (err) { err.textContent = problem; err.hidden = false; }
      return;
    }
    if (err) err.hidden = true;

    var total = deposit + premium;
    var expDefs = [
      ['재료비', num('#fMat'), 'pct'],
      ['인건비', num('#fLabor'), 'manwon'],
      ['매장 고정비', num('#fFixed'), 'manwon'],
      ['기타잡비', num('#fEtc'), 'manwon']
    ];
    var expenses = expDefs.filter(function (d) { return d[1] > 0; }).map(function (d) {
      var v = d[1];
      if (d[2] === 'pct') {
        return {
          label: d[0],
          unit: 'pct',
          pct: [v, v],
          range: sales ? wonRange(sales * v / 100, sales * v / 100) : '상담 시 안내',
          share: '매출의 ' + pctRange(v) + '%'
        };
      }
      return {
        label: d[0],
        unit: 'manwon',
        amount: [v, v],
        range: wonRange(v, v),
        share: sales ? '매출의 ' + pctRange(v / sales * 100) + '%' : ''
      };
    });

    var points = val('#fPoints').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var existing = state.editingId ? findListing(state.editingId) : null;

    var listing = {
      id: existing ? existing.id : 'ap-' + Date.now().toString(36),
      status: existing ? (existing.status === 'closed' ? 'closed' : (existing.status || 'active')) : 'active',
      visible: existing ? existing.visible !== false : true,
      region: region,
      district: district,
      area: region + ' ' + district,
      area_note: note || NOTE_EMPTY,
      category: val('#fCategory'),
      brand: brand,
      brand_note: (existing && existing.brand_note) ? existing.brand_note : '직접 등록',
      store_spec: storeSpec || SPEC_EMPTY,
      store_floor: floor,
      store_pyeong: pyeong ? Number(pyeong) : '',
      initial_cost: {
        total_manwon: total,
        label: wonLabel(total),
        items: [
          { label: '점포 예치금', value: wonLabel(deposit) },
          { label: '권리금·시설', value: wonLabel(premium) }
        ]
      },
      monthly_sales: {
        avg_manwon: sales,
        label: '월 평균 ' + wonLabel(sales),
        range: ''
      },
      profit: {
        label: '월 약 ' + comma(pMin) + '만 원',
        avg_manwon: Math.round(pMin),
        note: '점주 제시 자료 기준'
      },
      expenses: expenses,
      points: points,
      check_note: val('#fCheckNote'),
      keywords: [],
      private_deals: existing && existing.private_deals ? existing.private_deals : [],
      private_only: val('#fPrivate') === 'Y'
    };

    if (existing) {
      state.listings = state.listings.map(function (L) { return L.id === existing.id ? listing : L; });
    } else {
      state.listings = [listing].concat(state.listings);
    }
    persist();
    closeForm();
    renderStats();
    renderStores();
    toast(existing ? '점포를 수정했습니다. 사이트 목록에 반영됩니다.' : '새 점포를 등록했습니다. 사이트 목록에 반영됩니다.');
  }

  function findListing(id) {
    return state.listings.filter(function (L) { return L.id === id; })[0] || null;
  }

  /* ---------------- 엑셀(CSV) 일괄 등록 ---------------- */
  var BULK_MAX_BYTES = 5 * 1024 * 1024;
  var BULK_MAX_ROWS = 300;
  var CSV_CATEGORIES = ['카페', '디저트', '음식점', '치킨', '기타'];
  var REGION_ALIAS = {
    '서울': '서울', '서울시': '서울', '서울특별시': '서울',
    '경기': '경기', '경기도': '경기',
    '인천': '인천', '인천시': '인천', '인천광역시': '인천'
  };

  /* 양식 열 순서 · 별칭 · 필수 여부
     예상수익은 평균치 한 열이다. 예전 양식의 최소·최대 두 열(template:false)이 오면 평균을 쓴다. */
  var CSV_COLS = [
    { key: 'area', label: '지역', required: true, aliases: ['지역명', '상권'] },
    { key: 'category', label: '업종', required: true, aliases: ['카테고리'] },
    { key: 'brand', label: '브랜드', required: true,
      aliases: ['유형/브랜드', '브랜드/유형', '유형·브랜드', '브랜드·유형', '유형/브랜드명', '브랜드명'] },
    { key: 'floor', label: '층수', required: false, aliases: ['층', '층수(예: 1층)', '매장층수', '매장 층수'] },
    { key: 'pyeong', label: '평수(평)', required: false, aliases: ['평수', '면적(평)', '평'] },
    { key: 'deposit', label: '점포예치금(만원)', required: true, aliases: ['점포예치금', '점포 예치금(만원)', '예치금(만원)'] },
    { key: 'premium', label: '권리금(만원)', required: true, aliases: ['권리금', '권리금·시설(만원)', '시설·영업권(만원)'] },
    { key: 'sales', label: '월평균매출(만원)', required: true, aliases: ['월평균매출', '월 평균 매출(만원)', '월매출(만원)', '월매출'] },
    { key: 'profit', label: '예상수익(만원)', required: false,
      aliases: ['예상수익', '예상 수익(만원)', '예상수익금액(만원)', '예상월수익(만원)', '예상 월 수익(만원)',
        '예상순수익(만원)', '예상순수익', '예상순수익금액(만원)'] },
    { key: 'mat', label: '재료비비율(%)', required: false, aliases: ['재료비비율', '재료비(%)', '재료비'] },
    { key: 'labor', label: '인건비(만원)', required: false, aliases: ['인건비비율', '인건비비율(%)', '인건비(%)', '인건비', '인건비금액(만원)'] },
    { key: 'fixed', label: '고정비(만원)', required: false, aliases: ['고정비비율', '고정비비율(%)', '고정비(%)', '고정비', '매장고정비(만원)', '매장고정비비율(%)'] },
    { key: 'etc', label: '기타잡비(만원)', required: false, aliases: ['기타비율', '기타비율(%)', '기타(%)', '기타잡비', '기타', '기타잡비(만원)'] },
    { key: 'note', label: '특징한줄평', required: false,
      aliases: ['한줄특징', '한 줄 특징', '한줄 특징', '특징', '특징·한줄평', '특징 한줄평'] },
    { key: 'private', label: '비공개전용(Y/N)', required: false, aliases: ['비공개전용', '비공개 전용'] },
    /* 예전 양식 호환용 (양식 파일에는 넣지 않는다) */
    { key: 'profit_min', label: '예상수익최소(만원)', required: false, template: false,
      aliases: ['예상수익최소', '예상수익 최소(만원)', '예상순수익최소(만원)', '예상수익최소금액(만원)'] },
    { key: 'profit_max', label: '예상수익최대(만원)', required: false, template: false,
      aliases: ['예상수익최대', '예상수익 최대(만원)', '예상순수익최대(만원)', '예상수익최대금액(만원)'] }
  ];

  var TEMPLATE_COLS = CSV_COLS.filter(function (c) { return c.template !== false; });

  var TEMPLATE_ROWS = [
    ['서울 마포구', '카페', '메가커피', '1층', '13', '1000', '20000', '3200', '1250', '34', '520', '180', '115',
      '대학가 인접 상권 · 평일 08:00~19:30 영업', 'N'],
    ['경기 성남시 분당구', '디저트', '설빙', '1층', '15', '1500', '15000', '2600', '900', '36', '620', '370', '520',
      '주차 2대 · 매일 09:00~01:30 영업', 'Y']
  ];

  function csvField(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function saveText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function downloadTemplate() {
    var lines = [TEMPLATE_COLS.map(function (c) { return csvField(c.label); }).join(',')];
    TEMPLATE_ROWS.forEach(function (r) { lines.push(r.map(csvField).join(',')); });
    saveText('ap-partner-listings-template.csv', '\ufeff' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8;');
    toast('샘플 양식(CSV)을 내려받았습니다. 층수·평수는 나눠 적고, 예상수익·지출은 평균치 하나만 적으면 됩니다.');
  }

  function normHeader(s) {
    return String(s == null ? '' : s)
      .replace(/^\ufeff/, '')
      .replace(/（/g, '(').replace(/）/g, ')')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function findHeaderIndex(headerCells, col, used) {
    var names = [col.label].concat(col.aliases || []).map(normHeader);
    for (var i = 0; i < headerCells.length; i++) {
      if (used[i]) continue;
      if (names.indexOf(normHeader(headerCells[i])) !== -1) return i;
    }
    return -1;
  }

  /* 따움표 · 콤마 · 줄바꿈을 지키는 CSV 파서 (RFC 4180) */
  function parseCsvRows(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cell = '', inQuotes = false;
    var line = 1, rowLine = 1, i = 0;
    while (i < text.length) {
      var ch = text.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        if (ch === '\n') line++;
        cell += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(cell); cell = '';
        rows.push({ line: rowLine, cells: row });
        row = []; line++; rowLine = line; i++;
        continue;
      }
      cell += ch; i++;
    }
    row.push(cell);
    rows.push({ line: rowLine, cells: row });
    return rows;
  }

  function decodeCsvBuffer(buf) {
    var bytes = new Uint8Array(buf);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { text: new TextDecoder('utf-8').decode(buf), encoding: 'UTF-8 (BOM)' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { text: new TextDecoder('utf-16le').decode(buf), encoding: 'UTF-16 (BOM)' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return { text: new TextDecoder('utf-16be').decode(buf), encoding: 'UTF-16 (BOM)' };
    }
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' };
    } catch (e) {
      try {
        return { text: new TextDecoder('euc-kr').decode(buf), encoding: 'EUC-KR' };
      } catch (e2) { /* 다음 방식 */ }
    }
    return { text: new TextDecoder('utf-8').decode(buf), encoding: 'UTF-8' };
  }

  function csvNumber(raw) {
    var s = String(raw == null ? '' : raw).replace(/[\s,]/g, '');
    if (!s) return null;
    s = s.replace(/원$/, '').replace(/%$/, '');
    var eok = s.match(/^([0-9]+(?:\.[0-9]+)?)억(?:([0-9]+(?:\.[0-9]+)?)만?)?$/);
    if (eok) return parseFloat(eok[1]) * 10000 + (eok[2] ? parseFloat(eok[2]) : 0);
    s = s.replace(/만$/, '');
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }

  function readAmount(raw, label, out) {
    var v = csvNumber(raw);
    if (v !== null && isNaN(v)) {
      out.errors.push(label + ' "' + raw + '"을(를) 숫자로 읽지 못했습니다.');
      return 0;
    }
    return v == null ? null : v;
  }

  function readPct(raw, label, out) {
    var v = csvNumber(raw);
    if (v === null) return 0;
    if (isNaN(v) || v < 0 || v > 100) {
      out.errors.push(label + '은(는) 0~100 사이 숫자로 적어 주세요. (입력: ' + raw + ')');
      return 0;
    }
    return v;
  }

  /* '34~(33') 또는 '34~36' 같은 칸을 숫자 목록으로 나눈다 (범위는 평균을 쓴다). */
  function splitNums(raw) {
    var got = { vals: [], bad: false, empty: true };
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return got;
    got.empty = false;
    s.split('~').forEach(function (p) {
      var part = String(p).trim();
      if (!part) return;
      var v = csvNumber(part);
      if (v === null || isNaN(v)) { got.bad = true; return; }
      got.vals.push(v);
    });
    return got;
  }

  function avgOf(vals) {
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    return Math.round(sum / vals.length * 10) / 10;
  }

  /* 평균 금액(만 원). '480~560'처럼 범위가 오면 두 값의 평균을 쓴다. */
  function readAvgAmount(raw, label, out, convert) {
    var got = splitNums(raw);
    if (got.empty) return null;
    if (got.bad || !got.vals.length) {
      out.errors.push(label + ' "' + raw + '"을(를) 숫자로 읽지 못했습니다.');
      return null;
    }
    if (convert) got.vals = got.vals.map(convert);
    var avg = avgOf(got.vals);
    if (got.vals.length > 1) {
      out.notes.push(label + ' "' + String(raw).trim() + '" 범위를 평균 ' + comma(avg) + '만 원으로 등록합니다.');
    }
    return avg;
  }

  /* 평균 비율(%). 0~100 밖이면 오류. */
  function readAvgPct(raw, label, out) {
    var got = splitNums(raw);
    if (got.empty) return null;
    if (got.bad || !got.vals.length || got.vals.some(function (v) { return v < 0 || v > 100; })) {
      out.errors.push(label + '은(는) 0~100 사이 숫자로 적어 주세요. (입력: ' + raw + ')');
      return null;
    }
    var avg = avgOf(got.vals);
    if (got.vals.length > 1) {
      out.notes.push(label + ' "' + String(raw).trim() + '" 범위를 평균 ' + avg + '%로 등록합니다.');
    }
    return avg;
  }

  function buildBulkRow(cells, map, lineNo) {
    var out = {
      line: lineNo, ok: false, errors: [], notes: [], listing: null,
      view: { area: '', category: '', brand: '', spec: '', cost: '', sales: '', profit: '' }
    };
    function get(key) {
      var idx = map[key];
      if (idx == null || idx < 0) return '';
      return String(cells[idx] == null ? '' : cells[idx]).trim();
    }

    /* 지역 → 지역 · 지역구 */
    var areaRaw = get('area').replace(/\s+/g, ' ').trim();
    out.view.area = areaRaw;
    var region = '', district = '', area = '';
    if (!areaRaw) {
      out.errors.push('지역이 비어 있습니다. 예: 서울 마포구');
    } else {
      var parts = areaRaw.split(' ');
      if (parts.length === 1) {
        /* '서울마포구'처럼 붙여 쓴 경우 지역명 경계에서 나눈다 */
        var keys = Object.keys(REGION_ALIAS).sort(function (a, b) { return b.length - a.length; });
        for (var ki = 0; ki < keys.length; ki++) {
          if (areaRaw.indexOf(keys[ki]) === 0 && areaRaw.length > keys[ki].length) {
            parts = [keys[ki], areaRaw.slice(keys[ki].length)];
            break;
          }
        }
      }
      var known = REGION_ALIAS[parts[0]];
      if (known) {
        region = known;
        district = parts.slice(1).join(' ');
        if (!district) out.errors.push('지역구를 함께 적어 주세요. 예: ' + region + ' 마포구');
        else area = region + ' ' + district;
      } else {
        region = '기타';
        district = areaRaw;
        area = areaRaw;
        out.notes.push('지역 "' + areaRaw + '"은(는) 서울·경기·인천이 아니라 기타로 분류됩니다.');
      }
    }

    /* 업종 */
    var catRaw = get('category');
    out.view.category = catRaw;
    var category = '';
    if (!catRaw) out.errors.push('업종이 비어 있습니다. (카페·디저트·음식점·치킨·기타)');
    else if (CSV_CATEGORIES.indexOf(catRaw) !== -1) category = catRaw;
    else {
      category = '기타';
      out.notes.push('업종 "' + catRaw + '"은(는) 목록에 없어 기타로 등록합니다.');
    }

    /* 브랜드 */
    var brand = get('brand');
    out.view.brand = brand;
    if (!brand) out.errors.push('브랜드가 비어 있습니다.');

    /* 매장 규모: 층수 + 평수 → '1층 · 13평' */
    var floorRaw = get('floor');
    var pyeongRaw = get('pyeong');
    var floor = normalizeFloor(floorRaw);
    var pyeong = normalizePyeong(pyeongRaw);
    if (pyeongRaw && !pyeong) {
      out.notes.push('평수 "' + pyeongRaw + '"를 숫자로 읽지 못해 매장 규모에서 뺐습니다.');
    }
    var spec = composeSpec(floor, pyeong);
    out.view.spec = spec || '-';

    /* 금액 */
    var deposit = readAmount(get('deposit'), '점포예치금', out) || 0;
    var premium = readAmount(get('premium'), '권리금', out) || 0;
    if (!(deposit > 0 || premium > 0)) out.errors.push('점포예치금이나 권리금 중 하나는 0보다 크게 적어 주세요.');

    var sales = readAmount(get('sales'), '월평균매출', out) || 0;
    if (!(sales > 0)) out.errors.push('월평균매출을 0보다 크게 적어 주세요.');

    /* 예상수익: 평균치 한 열. 예전 양식의 최소·최대 두 열이나 '1,100~1,400' 범위도 평균으로 받는다. */
    var profitRaw = get('profit');
    var pAvg = readAvgAmount(profitRaw, '예상수익', out);
    if (pAvg === null) {
      if (profitRaw) {
        pAvg = 0;  /* 숫자로 읽지 못한 오류는 이미 기록됨 */
      } else {
        var pMin = readAmount(get('profit_min'), '예상수익최소', out);
        var pMax = readAmount(get('profit_max'), '예상수익최대', out);
        if (pMin === null && pMax === null) {
          out.errors.push('예상수익을 적어 주세요. (만 원 단위)');
          pAvg = 0;
        } else {
          if (pMin === null) { pMin = pMax; out.notes.push('예상수익최소가 비어 있어 최대값으로 채웠습니다.'); }
          if (pMax === null) { pMax = pMin; out.notes.push('예상수익최대가 비어 있어 최소값으로 채웠습니다.'); }
          if (pMax < pMin) { var tp = pMin; pMin = pMax; pMax = tp; out.notes.push('예상수익 최소·최대가 뒤바뀌어 순서를 바꿨습니다.'); }
          pAvg = Math.round((pMin + pMax) / 2);
          if (pMin !== pMax) {
            out.notes.push('예상수익 최소·최대 ' + comma(pMin) + '~' + comma(pMax) + '의 평균 ' + comma(pAvg) + '만 원으로 등록합니다.');
          }
        }
      }
    }
    if (!(pAvg > 0)) out.errors.push('예상수익은 0보다 크게 적어 주세요.');

    /* 지출: 재료비는 매출 대비 %, 인건비·매장 고정비·기타잡비는 만 원 금액 (평균치 하나) */
    var matPct = readAvgPct(get('mat'), '재료비비율', out);
    var expenses = [];
    if (matPct !== null) {
      expenses.push({
        label: '재료비',
        unit: 'pct',
        pct: [matPct, matPct],
        range: wonRange(sales * matPct / 100, sales * matPct / 100),
        share: '매출의 ' + pctRange(matPct) + '%'
      });
    }
    [['인건비', 'labor'], ['매장 고정비', 'fixed'], ['기타잡비', 'etc']].forEach(function (d) {
      var legacyPct = map[d[1] + '__pct'] && sales;  /* 예전 '인건비비율(%)' 같은 열 */
      var v = readAvgAmount(get(d[1]), d[0], out, legacyPct ? function (p) { return sales * p / 100; } : null);
      if (v === null || !v) return;
      expenses.push({
        label: d[0],
        unit: 'manwon',
        amount: [v, v],
        range: wonRange(v, v),
        share: sales ? '매출의 ' + pctRange(v / sales * 100) + '%' : ''
      });
    });

    /* 비공개전용 */
    var pvRaw = get('private').replace(/\s+/g, '');
    var pv = pvRaw.toUpperCase();
    var privateOnly = false;
    if (pvRaw) {
      if (['Y', 'YES', 'TRUE', '1', '예', '비공개', '비공개전용'].indexOf(pv) !== -1) privateOnly = true;
      else if (['N', 'NO', 'FALSE', '0', '아니오', '아니요', '공개'].indexOf(pv) !== -1) privateOnly = false;
      else out.errors.push('비공개전용은 Y 또는 N으로 적어 주세요. (입력: ' + pvRaw + ')');
    }

    var areaNote = get('note') || '상담 시 상권 설명';

    out.view.cost = (deposit || premium) ? wonLabel(deposit + premium) : '-';
    out.view.sales = sales > 0 ? wonLabel(sales) : '-';
    out.view.profit = pAvg > 0 ? comma(pAvg) : '-';
    out.view.area = area || areaRaw;

    if (!out.errors.length) {
      out.ok = true;
      out.listing = {
        status: 'active',
        visible: true,
        region: region,
        district: district,
        area: area,
        area_note: areaNote,
        category: category,
        brand: brand,
        brand_note: 'CSV 일괄 등록',
        store_spec: spec || SPEC_EMPTY,
        store_floor: floor,
        store_pyeong: pyeong ? Number(pyeong) : '',
        initial_cost: {
          total_manwon: deposit + premium,
          label: wonLabel(deposit + premium),
          items: [
            { label: '점포 예치금', value: wonLabel(deposit) },
            { label: '권리금·시설', value: wonLabel(premium) }
          ]
        },
        monthly_sales: {
          avg_manwon: sales,
          label: '월 평균 ' + wonLabel(sales),
          range: ''
        },
        profit: {
          label: '월 약 ' + comma(pAvg) + '만 원',
          avg_manwon: Math.round(pAvg),
          note: '점주 제시 자료 기준'
        },
        expenses: expenses,
        points: [],
        check_note: '상세 매출·지출 원자료와 정확한 위치는 상담에서 안내합니다.',
        keywords: [],
        private_deals: [],
        private_only: privateOnly
      };
    }
    return out;
  }

  function showBulkError(msg) {
    var el = $('#bulkError');
    if (el) { el.textContent = msg; el.hidden = false; }
  }
  function clearBulkError() {
    var el = $('#bulkError');
    if (el) { el.textContent = ''; el.hidden = true; }
  }

  function resetBulk() {
    state.bulk = null;
    var result = $('#bulkResult'); if (result) result.hidden = true;
    var body = $('#bulkRows'); if (body) body.innerHTML = '';
    clearBulkError();
    var btn = $('#btnBulkCommit');
    if (btn) { btn.disabled = true; btn.textContent = '일괄 등록하기'; }
    var info = $('#bulkFileInfo'); if (info) info.textContent = '';
    var legacy = $('#bulkLegacy'); if (legacy) { legacy.hidden = true; legacy.textContent = ''; }
    var file = $('#bulkFile'); if (file) file.value = '';
    var summary = $('#bulkTotalRows'); if (summary) summary.textContent = '0';
  }

  function openBulk() {
    $('#bulkPanel').hidden = false;
    $('#btnCsvBulk').setAttribute('aria-expanded', 'true');
    $('#bulkPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#bulkDrop').focus({ preventScroll: true });
  }

  function closeBulk() {
    $('#bulkPanel').hidden = true;
    $('#btnCsvBulk').setAttribute('aria-expanded', 'false');
    resetBulk();
  }

  function handleCsvFile(file) {
    clearBulkError();
    if (!file) return;
    var nameOk = /\.csv$/i.test(file.name || '');
    var typeOk = /csv|excel|text\/plain/i.test(file.type || '');
    if (/\.(xlsx|xls)$/i.test(file.name || '')) {
      showBulkError('엑셀 파일(.xlsx·.xls)은 올릴 수 없습니다. 엑셀에서 "CSV UTF-8(쉼표로 분리)"로 저장한 뒤 올려 주세요.');
      return;
    }
    if (!nameOk && !typeOk) {
      showBulkError('CSV 파일만 올릴 수 있습니다. 엑셀 파일(.xlsx)은 "CSV UTF-8(쉼표로 분리)"로 저장한 뒤 올려 주세요.');
      return;
    }
    if (file.size > BULK_MAX_BYTES) {
      showBulkError('파일이 너무 큽니다. 5MB 이하 CSV만 올릴 수 있습니다.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        applyBulkParsed(decodeCsvBuffer(reader.result), file.name);
      } catch (e) {
        showBulkError('CSV를 읽는 중 문제가 생겼습니다. 파일을 다시 확인해 주세요.');
      }
    };
    reader.onerror = function () {
      showBulkError('파일을 읽지 못했습니다. 다시 시도해 주세요.');
    };
    reader.readAsArrayBuffer(file);
  }

  function applyBulkParsed(decoded, fileName) {
    var text = decoded.text || '';
    if (!text.trim()) { showBulkError('파일이 비어 있습니다.'); return; }

    var parsed = parseCsvRows(text).filter(function (r) {
      return r.cells.some(function (c) { return String(c).trim() !== ''; });
    });
    if (!parsed.length) { showBulkError('파일에 내용이 없습니다.'); return; }

    var header = parsed[0];
    var dataRows = parsed.slice(1);
    if (!dataRows.length) { showBulkError('열 이름 아래에 점포 행이 없습니다.'); return; }
    if (dataRows.length > BULK_MAX_ROWS) {
      showBulkError('한 번에 최대 ' + BULK_MAX_ROWS + '행까지 등록할 수 있습니다. (현재 ' + dataRows.length + '행) 파일을 나눠 주세요.');
      return;
    }

    var map = {}, used = {}, missing = [];
    CSV_COLS.forEach(function (col) {
      var idx = findHeaderIndex(header.cells, col, used);
      map[col.key] = idx;
      if (idx >= 0) {
        used[idx] = true;
        /* 예전 양식처럼 열 이름이 '%'·'비율'이면 그 값을 비율로 읽어 금액으로 환산한다 */
        map[col.key + '__pct'] = /%|비율/.test(String(header.cells[idx] == null ? '' : header.cells[idx]));
      } else if (col.required) missing.push(col.label);
    });
    if (missing.length) {
      showBulkError('필수 열이 없습니다: ' + missing.join(', ') + '. 샘플 양식(CSV)을 내려받아 열 이름을 맞춰 주세요.');
      return;
    }

    /* 예전 양식의 '운영방식' 열은 받지 않는다. 파일에 남아 있으면 무시하고 한 번 안내한다. */
    var legacyOp = header.cells.some(function (h) {
      return normHeader(h).indexOf('운영') === 0;
    });
    var legacyEl = $('#bulkLegacy');
    if (legacyEl) {
      legacyEl.hidden = !legacyOp;
      legacyEl.textContent = legacyOp
        ? '이 파일의 "운영방식" 열은 이제 쓰지 않습니다. 그 열은 비운 채(또는 그대로 둔 채) 등록하면 무시되고, 나머지 열 값만 저장됩니다.'
        : '';
    }

    var rows = dataRows.map(function (r, i) { return buildBulkRow(r.cells, map, i + 2); });
    var seen = {};
    rows.forEach(function (row) {
      if (!row.ok || !row.listing) return;
      var key = row.listing.area + '|' + row.listing.brand;
      if (seen[key]) row.notes.push('같은 파일 ' + seen[key] + '행과 지역·브랜드가 같습니다.');
      else seen[key] = row.line;
      var dupExisting = state.listings.some(function (L) {
        return L.area === row.listing.area && L.brand === row.listing.brand;
      });
      if (dupExisting) row.notes.push('이미 등록된 점포와 지역·브랜드가 같습니다.');
    });

    state.bulk = { fileName: fileName, encoding: decoded.encoding, rows: rows };
    renderBulkPreview();
  }

  function renderBulkPreview() {
    var bulk = state.bulk;
    if (!bulk) return;
    var okRows = bulk.rows.filter(function (r) { return r.ok; });
    var badCount = bulk.rows.length - okRows.length;

    $('#bulkResult').hidden = false;
    $('#bulkTotalRows').textContent = String(bulk.rows.length);
    $('#bulkOkRows').textContent = String(okRows.length);
    $('#bulkErrRows').textContent = String(badCount);
    $('#bulkFileInfo').textContent = bulk.fileName + ' · ' + bulk.encoding + ' · ' + bulk.rows.length + '행';

    $('#bulkRows').innerHTML = bulk.rows.map(function (r) {
      var note;
      if (r.errors.length) {
        note = '<span class="bulk-note err">' + r.errors.map(esc).join('<br />') + '</span>';
      } else if (r.notes.length) {
        note = '<span class="bulk-note">' + r.notes.map(esc).join('<br />') + '</span>';
      } else {
        note = '<span class="bulk-note">-</span>';
      }
      return '' +
        '<tr class="' + (r.ok ? '' : 'is-bad') + '">' +
          '<td data-label="행" class="bulk-no">' + r.line + '</td>' +
          '<td data-label="상태"><span class="status-badge ' + (r.ok ? 'live' : 'error') + '">' + (r.ok ? '정상' : '오류') + '</span></td>' +
          '<td data-label="지역">' + esc(r.view.area || '-') + '</td>' +
          '<td data-label="업종">' + esc(r.view.category || '-') + '</td>' +
          '<td data-label="브랜드">' + esc(r.view.brand || '-') + '</td>' +
          '<td data-label="매장 규모">' + esc(r.view.spec || '-') + '</td>' +
          '<td data-label="초기 인수" class="num">' + esc(r.view.cost || '-') + '</td>' +
          '<td data-label="월 매출" class="num">' + esc(r.view.sales || '-') + '</td>' +
          '<td data-label="예상 수익(만원)" class="num">' + esc(r.view.profit || '-') + '</td>' +
          '<td data-label="확인">' + note + '</td>' +
        '</tr>';
    }).join('');

    var btn = $('#btnBulkCommit');
    btn.disabled = okRows.length === 0;
    btn.textContent = okRows.length ? '일괄 등록하기 (' + okRows.length + '곳)' : '일괄 등록하기';
  }

  function commitBulk() {
    if (!state.bulk) return;
    var okRows = state.bulk.rows.filter(function (r) { return r.ok && r.listing; });
    if (!okRows.length) {
      showBulkError('등록할 수 있는 행이 없습니다. 오류 행을 고쳐 다시 올려 주세요.');
      return;
    }
    var stamp = Date.now().toString(36);
    var added = okRows.map(function (r, i) {
      var L = {};
      for (var k in r.listing) {
        if (Object.prototype.hasOwnProperty.call(r.listing, k)) L[k] = r.listing[k];
      }
      L.id = 'ap-' + stamp + '-' + pad2(i + 1);
      return L;
    });
    state.listings = added.concat(state.listings);
    persist();
    renderStats();
    renderStores();
    closeBulk();
    toast(added.length + '곳을 일괄 등록했습니다. 사이트 점포 목록에 바로 반영됩니다.');
  }

  function initBulk() {
    var openBtn = $('#btnCsvBulk');
    if (!openBtn) return;
    openBtn.addEventListener('click', openBulk);
    $('#btnBulkClose').addEventListener('click', closeBulk);
    $('#btnCsvTemplate').addEventListener('click', downloadTemplate);

    var drop = $('#bulkDrop');
    var input = $('#bulkFile');
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      drop.addEventListener(ev, function () { drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('is-over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleCsvFile(f);
    });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (f) handleCsvFile(f);
      input.value = '';
    });
    document.addEventListener('dragover', function (e) {
      if (!$('#bulkPanel').hidden) e.preventDefault();
    });
    document.addEventListener('drop', function (e) {
      if (!$('#bulkPanel').hidden) e.preventDefault();
    });

    $('#btnBulkCommit').addEventListener('click', commitBulk);
    $('#btnBulkReset').addEventListener('click', function () { resetBulk(); input.click(); });
  }

  /* ---------------- 점포 목록 ---------------- */
  function statusBadge(L) {
    if (L.status === 'closed' || L.visible === false) return '<span class="status-badge closed">거래완료 · 비노출</span>';
    if (L.status === 'sample') return '<span class="status-badge sample">샘플 · 노출 중</span>';
    return '<span class="status-badge live">노출 중</span>';
  }

  function renderStores() {
    var body = $('#storeRows');
    if (!body) return;
    body.innerHTML = state.listings.map(function (L) {
      var closed = L.status === 'closed' || L.visible === false;
      return '' +
        '<tr class="admin-row' + (closed ? ' is-closed' : '') + '" data-id="' + esc(L.id) + '">' +
          '<td data-label="점포"><div class="cell-main"><b>' + esc(L.area) + '</b>' +
            '<span>' + esc(L.brand) + ' · ' + esc(L.area_note) + '</span></div></td>' +
          '<td data-label="업종">' + esc(L.category) + '</td>' +
          '<td data-label="초기 인수" class="num">' + esc(L.initial_cost.label) + '</td>' +
          '<td data-label="월 매출" class="num">' + esc(L.monthly_sales.label.replace('월 평균 ', '')) + '</td>' +
          '<td data-label="상태">' + statusBadge(L) +
            (L.private_only ? ' <span class="status-badge sample">비공개전용</span>' : '') + '</td>' +
          '<td data-label="관리"><div class="row-actions">' +
            '<button type="button" class="gold" data-edit="' + esc(L.id) + '">수정</button>' +
            '<button type="button" data-toggle="' + esc(L.id) + '">' + (closed ? '노출 재개' : '거래완료') + '</button>' +
            '<button type="button" class="danger" data-del="' + esc(L.id) + '">삭제</button>' +
          '</div></td>' +
        '</tr>';
    }).join('');

    $all('[data-edit]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        var L = findListing(b.getAttribute('data-edit'));
        if (L) openForm(L);
      });
    });
    $all('[data-toggle]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        var L = findListing(b.getAttribute('data-toggle'));
        if (!L) return;
        if (L.status === 'closed' || L.visible === false) {
          L.status = L.status_prev || 'live';
          L.visible = true;
          delete L.status_prev;
          toast('거래완료를 해제했습니다. 사이트에 다시 노출됩니다.');
        } else {
          L.status_prev = L.status;
          L.status = 'closed';
          L.visible = false;
          toast('거래완료로 돌렸습니다. 사이트 목록에서 감춰집니다.');
        }
        persist();
        renderStats();
        renderStores();
      });
    });
    $all('[data-del]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-del');
        var L = findListing(id);
        if (!L) return;
        if (!window.confirm('"' + L.area + ' ' + L.brand + '" 점포를 목록에서 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.')) return;
        state.listings = state.listings.filter(function (x) { return x.id !== id; });
        persist();
        renderStats();
        renderStores();
        toast('점포를 삭제했습니다.');
      });
    });
  }

  /* ---------------- 손님 DB ---------------- */
  function loadLeads() {
    var all = safeParse(readStore(LEAD_ALL_KEY));
    if (!(all instanceof Array)) all = [];
    var one = safeParse(readStore(LEAD_ONE_KEY));
    if (one && one.contact && one.contact.phone) {
      var dup = all.some(function (x) { return x && x.lead_id === one.lead_id; });
      if (!dup) all = [one].concat(all);
    }
    all = all.filter(function (x) { return x && x.contact && x.contact.phone; });
    all.sort(function (a, b) { return String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')); });
    var map = safeParse(readStore(LEAD_STATUS_KEY));
    state.leadStatus = (map && typeof map === 'object') ? map : {};
    state.leads = all;
  }

  function saveLeadStatus() {
    writeStore(LEAD_STATUS_KEY, JSON.stringify(state.leadStatus));
  }

  function leadStatusOf(L) { return state.leadStatus[L.lead_id] || 'new'; }

  /* stores 항목은 문자열('지역 브랜드')과 객체({area, brand}) 둘 다 올 수 있습니다. */
  function storeNameOf(s) {
    if (!s) return '';
    if (typeof s === 'string') return s;
    return ((s.area || '') + ' ' + (s.brand || '')).trim();
  }

  function renderLeads() {
    loadLeads();
    var body = $('#leadRows');
    var empty = $('#leadEmpty');
    var wrap = $('#leadTableWrap');
    if (!body) return;

    var counts = { all: state.leads.length, new: 0, done: 0 };
    state.leads.forEach(function (L) {
      var s = leadStatusOf(L);
      counts[s === 'done' ? 'done' : 'new'] += 1;
    });
    $all('#leadFilters .chip').forEach(function (chip) {
      var key = chip.getAttribute('data-filter');
      chip.setAttribute('aria-pressed', state.leadFilter === key ? 'true' : 'false');
      var b = chip.querySelector('b');
      if (b) b.textContent = String(counts[key] || 0);
    });

    var list = state.leads.filter(function (L) {
      if (state.leadFilter === 'all') return true;
      return leadStatusOf(L) === state.leadFilter;
    });

    if (!state.leads.length) {
      wrap.hidden = true;
      empty.hidden = false;
      renderStats();
      return;
    }
    wrap.hidden = false;
    empty.hidden = list.length !== 0 ? true : false;
    if (!list.length) empty.hidden = false;

    body.innerHTML = list.map(function (L) {
      var c = L.criteria || {};
      var brandText = [(c.category || []).join(', '), c.brand_text].filter(Boolean).join(' · ') || '-';
      var sourceLabel = L.source === 'detail' ? '상세 보기'
        : L.source === 'matching' ? 'AI 매칭'
        : L.source === 'compare' ? '비교 상담' : '사이트';
      var storeLine = L.store ? (L.store.area + ' · ' + L.store.brand)
        : (L.stores && L.stores.length ? L.stores.map(storeNameOf).join(' / ') : '');
      var st = leadStatusOf(L);
      return '' +
        '<tr data-lead="' + esc(L.lead_id) + '">' +
          '<td data-label="접수"><div class="cell-main"><b>' + esc(kst(L.submitted_at, true)) + '</b>' +
            '<span class="lead-detail-sub">' + esc(L.lead_id) + '</span></div></td>' +
          '<td data-label="업종·브랜드"><div class="cell-main"><b>' + esc(brandText) + '</b>' +
            (storeLine ? '<span>' + esc(storeLine) + '</span>' : '') + '</div></td>' +
          '<td data-label="지역">' + esc((c.area || []).join(', ') || '-') + '</td>' +
          '<td data-label="예산">' + esc(c.budget || '-') + '</td>' +
          '<td data-label="연락처" class="phone">' + esc(L.contact.phone) + '</td>' +
          '<td data-label="유입">' + esc(sourceLabel) + '</td>' +
          '<td data-label="상태"><select data-status="' + esc(L.lead_id) + '" class="' + (st === 'done' ? 'done' : '') + '">' +
            '<option value="new"' + (st !== 'done' ? ' selected' : '') + '>신규</option>' +
            '<option value="done"' + (st === 'done' ? ' selected' : '') + '>상담완료</option>' +
          '</select></td>' +
        '</tr>';
    }).join('');

    $all('[data-status]', body).forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = sel.getAttribute('data-status');
        state.leadStatus[id] = sel.value;
        sel.classList.toggle('done', sel.value === 'done');
        saveLeadStatus();
        renderStats();
        renderLeads();
        toast(sel.value === 'done' ? '상담완료로 표시했습니다.' : '신규로 되돌렸습니다.');
      });
    });

    renderStats();
  }

  function initLeadFilters() {
    $all('#leadFilters .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.leadFilter = chip.getAttribute('data-filter') || 'all';
        renderLeads();
      });
    });
    var csv = $('#btnCsv');
    if (csv) csv.addEventListener('click', downloadCsv);
  }

  /* ---------------- 양도 의뢰 ---------------- */
  function loadSell() {
    var list = safeParse(readStore(SELL_KEY));
    state.sell = (list instanceof Array) ? list.filter(function (x) {
      return x && x.contact && x.contact.phone;
    }) : [];
    state.sell.sort(function (a, b) { return String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')); });
  }

  function renderSell() {
    var body = $('#sellRows');
    if (!body) return;
    var wrap = $('#sellTableWrap');
    var empty = $('#sellEmpty');
    if (!state.sell.length) {
      if (wrap) wrap.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    if (wrap) wrap.hidden = false;
    if (empty) empty.hidden = true;
    body.innerHTML = state.sell.map(function (R) {
      return '' +
        '<tr>' +
          '<td data-label="접수"><div class="cell-main"><b>' + esc(kst(R.submitted_at, true)) + '</b>' +
            '<span class="lead-detail-sub">' + esc(R.request_id) + '</span></div></td>' +
          '<td data-label="브랜드"><div class="cell-main"><b>' + esc(R.brand) + '</b>' +
            '<span>' + esc(kst(R.submitted_at)) + '</span></div></td>' +
          '<td data-label="지역">' + esc(R.area) + '</td>' +
          '<td data-label="월 매출" class="num">' + wonLabel(R.monthly_sales_manwon) + '</td>' +
          '<td data-label="희망 권리금" class="num">' + wonLabel(R.premium_manwon) + '</td>' +
          '<td data-label="연락처" class="phone">' + esc(R.contact.phone) + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------------- 텔레그램 알림 설정 ---------------- */
  function loadTelegram() {
    var cfg = safeParse(readStore(TG_KEY));
    state.tg = (cfg && typeof cfg === 'object') ? cfg : null;
    var token = $('#tgToken');
    var chat = $('#tgChat');
    var events = $('#tgEvents');
    var status = $('#tgStatus');
    if (token) token.value = (state.tg && state.tg.bot_token) || '';
    if (chat) chat.value = (state.tg && state.tg.chat_id) || '';
    if (events && state.tg && state.tg.events) events.value = state.tg.events;
    var ready = !!(state.tg && state.tg.bot_token && state.tg.chat_id);
    if (status) {
      status.textContent = ready ? '연결 준비됨' : '미설정';
      status.className = 'status-badge ' + (ready ? 'live' : 'closed');
    }
    renderTgPreview();
  }

  function renderTgPreview() {
    var pre = $('#tgPreview');
    if (!pre) return;
    pre.textContent = '[에이피파트너] 새 손님 DB\n'
      + '· 접수: 2026-11-25 04:52\n'
      + '· 유입: AI 맞춤 매칭\n'
      + '· 업종·브랜드: 카페 · 메가커피\n'
      + '· 지역·예산: 서울 / 2억대\n'
      + '· 연락처: 010-1234-5678\n'
      + '\n'
      + '[에이피파트너] 양도 의뢰\n'
      + '· 접수: 2026-11-25 05:10\n'
      + '· 매장: 메가커피 · 서울 종로구\n'
      + '· 월 매출: 3,200만 원\n'
      + '· 희망 권리금: 2억 원\n'
      + '· 연락처: 010-5555-6666';
  }

  function initTelegram() {
    var form = $('#tgForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var token = val('#tgToken').trim();
      var chat = val('#tgChat').trim();
      var err = $('#tgError');
      var res = $('#tgResult');
      if (err) err.hidden = true;
      if (res) { res.hidden = true; res.textContent = ''; }
      if (!/^[0-9]{5,}:[A-Za-z0-9_-]{10,}$/.test(token)) {
        if (err) { err.textContent = 'Bot Token 형식이 맞지 않습니다. 예: 123456789:AAH...'; err.hidden = false; }
        return;
      }
      if (!chat) {
        if (err) { err.textContent = 'Chat ID를 입력해 주세요.'; err.hidden = false; }
        return;
      }
      state.tg = {
        bot_token: token,
        chat_id: chat,
        events: val('#tgEvents') || 'all',
        updated_at: new Date().toISOString()
      };
      writeStore(TG_KEY, JSON.stringify(state.tg));
      loadTelegram();
      toast('텔레그램 알림 설정을 저장했습니다.');
    });

    var test = $('#tgTest');
    if (test) test.addEventListener('click', function () {
      var token = val('#tgToken').trim();
      var chat = val('#tgChat').trim();
      var err = $('#tgError');
      var res = $('#tgResult');
      if (err) err.hidden = true;
      if (!token || !chat) {
        if (err) { err.textContent = 'Bot Token과 Chat ID를 먼저 입력해 주세요.'; err.hidden = false; }
        return;
      }
      if (res) { res.hidden = false; res.textContent = '테스트 메시지를 보내는 중…'; }
      fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text: '[에이피파트너] 관리자 알림 테스트입니다.\n4항목 손님 DB·양도 의뢰가 접수되면 이 채팅으로 알림이 옵니다.'
        })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; });
      }).then(function (o) {
        if (o.ok && o.body && o.body.ok) {
          if (res) res.textContent = '테스트 메시지를 전송했습니다. 텔레그램 앱에서 확인해 주세요.';
          toast('텔레그램 테스트 전송 완료');
        } else {
          if (res) res.textContent = '전송 실패 · ' + ((o.body && o.body.description) || '토큰과 Chat ID를 확인해 주세요.');
        }
      }).catch(function () {
        if (res) res.textContent = '전송 실패 · 네트워크 또는 브라우저 정책으로 막혔습니다. 배포 후에는 서버에서 전송하도록 연결하세요.';
      });
    });

    var clear = $('#tgClear');
    if (clear) clear.addEventListener('click', function () {
      try { localStorage.removeItem(TG_KEY); } catch (e) { /* 무시 */ }
      state.tg = null;
      loadTelegram();
      toast('텔레그램 설정을 삭제했습니다.');
    });
  }

  function initSellActions() {
    var btn = $('#btnSellCsv');
    if (btn) btn.addEventListener('click', function () {
      loadSell();
      if (!state.sell.length) { toast('내려받을 양도 의뢰가 아직 없습니다.'); return; }
      var head = ['접수번호', '접수일시(KST)', '브랜드', '지역', '월 매출(만원)', '희망 권리금(만원)', '연락처', '동의', '페이지'];
      var rows = state.sell.map(function (R) {
        return [
          R.request_id, kst(R.submitted_at), R.brand, R.area,
          R.monthly_sales_manwon, R.premium_manwon,
          R.contact && R.contact.phone ? R.contact.phone : '',
          R.contact && R.contact.consent ? 'Y' : 'N',
          R.page || ''
        ].map(csvCell).join(',');
      });
      saveCsv('ap-sell-requests-' + todayStamp() + '.csv', head, rows);
      toast(state.sell.length + '건을 CSV로 내려받았습니다.');
    });
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function downloadCsv() {
    loadLeads();
    if (!state.leads.length) {
      toast('내려받을 손님 DB가 아직 없습니다.');
      return;
    }
    var head = ['접수번호', '접수일시(KST)', '유입', '점포', '업종·브랜드', '희망지역', '가용예산', '연락처', '동의', '상태', '페이지'];
    var rows = state.leads.map(function (L) {
      var c = L.criteria || {};
      return [
        L.lead_id,
        kst(L.submitted_at),
        L.source === 'detail' ? '상세 보기 잠금 해제'
          : L.source === 'matching' ? 'AI 맞춤 매칭'
          : L.source === 'compare' ? '비교 상담 신청' : '사이트',
        L.store ? (L.store.area + ' ' + L.store.brand)
          : (L.stores && L.stores.length ? L.stores.map(storeNameOf).join(' / ') : ''),
        [(c.category || []).join(' / '), c.brand_text].filter(Boolean).join(' · '),
        (c.area || []).join(' / '),
        c.budget || '',
        L.contact && L.contact.phone ? L.contact.phone : '',
        L.contact && L.contact.consent ? 'Y' : 'N',
        leadStatusOf(L) === 'done' ? '상담완료' : '신규',
        L.page || ''
      ].map(csvCell).join(',');
    });
    saveCsv('ap-leads-' + todayStamp() + '.csv', head, rows);
    toast(state.leads.length + '건을 CSV로 내려받았습니다.');
  }

  function todayStamp() {
    var now = new Date();
    return String(now.getFullYear()) + pad2(now.getMonth() + 1) + pad2(now.getDate());
  }

  function saveCsv(filename, head, rows) {
    var csv = '\ufeff' + head.map(csvCell).join(',') + '\r\n' + rows.join('\r\n') + '\r\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initLogin();
    initTabs();
    initForm();
    initBulk();
    initLeadFilters();
    initSellActions();
    initTelegram();
    if (isAuthed()) enterApp();
    else showLogin();
  });
})();
