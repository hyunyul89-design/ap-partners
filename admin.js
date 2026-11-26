/* ==========================================================================
   AP PARTNERS · 에이피파트너 — 관리자 (site/admin.html)
   - 로그인: 관리자 아이디 + 비밀번호(SHA-256 해시 검증) → sessionStorage 유지
   - 권한: master(최종관리자) / consultant(일반 컨설턴트) → 계정·권한 탭은 master 전용
   - 계정 관리: 최종관리자만 계정 추가·권한 변경·비밀번호 초기화/삭제 → localStorage 'apAdminAccounts'
   - 매장 관리: 카드 목록 · 비공개 지점명 배지 · 담당 컨설턴트 필터 → localStorage 'apPartnerCatalog'
     비공개 지점명은 관리자 전용 'apAdminBranches'에만 두고 손님 화면에는 내보내지 않습니다.
   - 손님 DB: index.html 4항목 게이트가 'apPartnerLeads' 에 쌓은 DB → 상태 변경 · CSV 다운로드
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 관리자 계정 · 비밀번호 ----------------
     공개 저장소 소스에 평문 비밀번호를 두지 않도록 SHA-256 해시로만 검증합니다.
     기본 최종관리자 1명(초기 비밀번호 = 기존 관리자 비밀번호)으로 시작하고,
     로그인 후 상단의 '내 비밀번호'에서 바로 바꿀 수 있습니다. */
  var ACCOUNTS_KEY = 'apAdminAccounts';
  var AUTH_KEY = 'apAdminAuth';
  var DEFAULT_ACCOUNT = {
    id: 'hyunyul89',
    name: '김현율',
    role: 'master',
    /* 초기 비밀번호의 SHA-256 해시 — 평문은 소스에 남기지 않습니다. */
    password_hash: '915956364fe3af76659b5f53bdfbedf3260f1c6d44729a0a31ec139eff18288b',
    created_at: '2026-11-26T00:00:00.000Z',
    must_change: true
  };

  /* ---------------- 관리자 전용 비공개 지점명 ----------------
     지점명은 손님 화면(index.html · app.js · data/listings.json)에 절대 넣지 않습니다.
     기본 12곳은 아래 seed 로만 두고, 등록·수정한 지점명은 이 브라우저의
     관리자 전용 저장소(apAdminBranches)에만 보관합니다. */
  var BRANCH_KEY = 'apAdminBranches';
  var BRANCH_SEED = {
    'AP-001': '상명대점',
    'AP-002': '위례점',
    'AP-003': '신림푸르지오점',
    'AP-004': '강서가양점',
    'AP-005': '반포점',
    'AP-006': '강동고덕역점',
    'AP-007': '인천신기사거리점',
    'AP-008': '일산문화광장점',
    'AP-009': '둔산타임월드점',
    'AP-010': '명일역점',
    'AP-011': '성정점',
    'AP-012': '평택성동초교점'
  };
  var DEFAULT_CONSULTANT_ID = 'hyunyul89';
  var CATALOG_KEY = 'apPartnerCatalog';
  var LEAD_ALL_KEY = 'apPartnerLeads';
  var LEAD_ONE_KEY = 'apPartnerLead';
  var LEAD_STATUS_KEY = 'apPartnerLeadStatus';
  var SELL_KEY = 'apPartnerSellRequests';
  var TG_KEY = 'apTelegramConfig';

  /* ---------------- 물건카드 (비공개 Google Drive) ----------------
     원본 이미지는 현율 님 구글 계정의 비공개 폴더(AP파트너_물건카드_비공개)에만 두고,
     관리자 화면은 LEAD_ENDPOINT(Apps Script)의 getCard / saveCard 로만 읽고 씁니다.
     공개 저장소(site/)에는 이미지를 올리지 않습니다. */
  var CARD_CONFIG_KEY = 'apPropertyCardConfig';
  var CARD_ENDPOINT_DEFAULT = 'https://script.google.com/macros/s/AKfycby46wERwxPPkkGeOXVO0zyerX4DWgua0tqBRbtgN3eh-aDJGLJ7ggNewUUY8sTl7EGHUA/exec';
  var CARD_SECRET_DEFAULT = 'apcard-2026';
  var CARD_FOLDER_LABEL = 'AP파트너_물건카드_비공개';
  var CARD_MAX_SIDE = 1600;
  var CARD_CACHE_MS = 60000;

  var state = {
    accounts: [],
    listings: [],
    managed: false,
    leads: [],
    leadStatus: {},
    leadFilter: 'all',
    sell: [],
    tg: null,
    editingId: null,
    bulk: null,
    tabIndex: 0,
    /* 매장 DB 필터 */
    storeFilters: { q: '', region: '', category: '', status: '', consultant: '' },
    /* 텔레그램 알림의 admin.html?id=AP-xxx 딥링크 */
    deepCode: '',
    /* 물건카드: 고유번호별 조회 결과 캐시 · 모달 상태 · 새 매장 폼에서 고른 이미지 */
    cards: {},
    card: { code: '', listingId: '', status: 'idle', dataUrl: '', updated: '', zoom: false, busy: false },
    formCard: null
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
  function removeStore(key) { try { localStorage.removeItem(key); } catch (e) { /* 무시 */ } }
  function readSession(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function writeSession(key, val) {
    try {
      if (val == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, val);
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- SHA-256 ----------------
     https 환경에서는 window.crypto.subtle 을 쓰고, 파일로 직접 열었을 때처럼
     crypto.subtle 이 없는 환경에서는 아래 순수 JS 구현으로 같은 해시를 만듭니다. */
  var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return out;
  }

  function sha256Fallback(text) {
    var bytes = utf8Bytes(String(text == null ? '' : text));
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 0x100000000);
    var lo = bitLen % 0x100000000;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] = ((bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]) | 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  function sha256Hex(text) {
    var msg = String(text == null ? '' : text);
    var subtle = (window.crypto && window.crypto.subtle) || null;
    if (subtle && typeof subtle.digest === 'function' && typeof TextEncoder !== 'undefined') {
      return subtle.digest('SHA-256', new TextEncoder().encode(msg))
        .then(function (buf) {
          var arr = new Uint8Array(buf);
          var out = '';
          for (var i = 0; i < arr.length; i++) out += ('0' + arr[i].toString(16)).slice(-2);
          return out;
        })
        .catch(function () { return sha256Fallback(msg); });
    }
    return Promise.resolve(sha256Fallback(msg));
  }

  /* ---------------- 관리자 계정 저장소 ----------------
     권한은 두 가지입니다.
       master     = 최종관리자 (계정·권한 관리까지 사용)
       consultant = 일반 컨설턴트 (매장 DB 관리만, 계정 관리는 막힘)
     예전에 저장된 '대표 관리자 / 팀원 관리자' 표기는 아래에서 새 권한으로 옮깁니다. */
  function normalizeRole(role) {
    var r = String(role == null ? '' : role).trim();
    if (r === 'master' || r === '최종관리자' || r === '대표 관리자' || r === '대표관리자') return 'master';
    return 'consultant';
  }

  function roleLabel(role) {
    return normalizeRole(role) === 'master' ? '최종관리자' : '컨설턴트';
  }

  function cloneAccount(a) {
    var id = String(a.id);
    var role = normalizeRole(a.role);
    var name = String(a.name || a.id);
    /* 예전 기본 계정 이름('김현율 팀장')은 표시명 '김현율'로 맞춥니다. */
    if (role === 'master' && id.toLowerCase() === DEFAULT_CONSULTANT_ID && /^김현율\s*(팀장|팀원|대표|관리자)?$/.test(name)) name = '김현율';
    return {
      id: id,
      name: name,
      role: role,
      password_hash: String(a.password_hash || '').toLowerCase(),
      created_at: a.created_at || '',
      password_changed_at: a.password_changed_at || '',
      must_change: a.must_change === true
    };
  }

  function readAccounts() {
    var raw = safeParse(readStore(ACCOUNTS_KEY));
    if (raw && raw.accounts instanceof Array) {
      var list = raw.accounts.filter(function (a) { return a && a.id && /^[0-9a-f]{64}$/i.test(String(a.password_hash || '')); })
        .map(cloneAccount);
      if (list.length) return list;
    }
    return [cloneAccount(DEFAULT_ACCOUNT)];
  }

  function writeAccounts(list) {
    state.accounts = list;
    var saved = writeStore(ACCOUNTS_KEY, JSON.stringify({
      version: 'admin-accounts-1',
      updated_at: new Date().toISOString(),
      accounts: list
    }));
    if (!saved) {
      /* 시크릿 모드·저장 공간 부족 등으로 저장되지 않은 경우, 저장된 것처럼 보이지 않게 알립니다. */
      showAccountMsg('브라우저 저장 공간을 쓸 수 없어 계정 변경이 저장되지 않았습니다. 시크릿 모드를 끄거나 저장 공간을 확인해 주세요.', true);
    }
    return saved;
  }

  function findAccount(id) {
    var key = String(id == null ? '' : id).trim().toLowerCase();
    if (!key) return null;
    var list = readAccounts();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id).toLowerCase() === key) return list[i];
    }
    return null;
  }

  function representativeCount(list) {
    return list.filter(function (a) { return normalizeRole(a.role) === 'master'; }).length;
  }

  function currentAccount() {
    var s = safeParse(readSession(AUTH_KEY));
    if (!s || !s.id) return null;
    var found = findAccount(s.id);
    if (found) return found;
    /* 계정 목록을 읽지 못한 경우에는 권한을 낮춰 잡습니다(최종관리자 UI가 열리지 않도록). */
    return { id: String(s.id), name: s.name || String(s.id), role: 'consultant', must_change: false };
  }

  /* 최종관리자 여부 — 계정·권한 관리 탭은 이 값이 참일 때만 열립니다. */
  function isMaster() {
    var a = currentAccount();
    return !!a && normalizeRole(a.role) === 'master';
  }

  /* 매장의 담당 컨설턴트. 예전 6곳처럼 지정이 없으면 기본 담당(김현율)으로 둡니다. */
  function consultantOf(L) {
    var id = String((L && L.consultant_id) || '').trim();
    if (id) {
      var acc = findAccount(id);
      return { id: id, name: String((L && L.consultant_name) || (acc && acc.name) || id) };
    }
    var def = findAccount(DEFAULT_CONSULTANT_ID);
    return { id: DEFAULT_CONSULTANT_ID, name: (def && def.name) || '김현율' };
  }

  function consultantLabel(name) {
    var n = String(name || '').trim();
    return n ? n + ' 컨설턴트' : '담당 미정';
  }

  /* ---------------- 비공개 지점명 (관리자 전용) ---------------- */
  function readBranches() {
    var raw = safeParse(readStore(BRANCH_KEY));
    return (raw && typeof raw === 'object' && !(raw instanceof Array)) ? raw : {};
  }

  function branchOf(L) {
    var code = codeOf(L);
    if (!code) return '';
    var map = readBranches();
    if (Object.prototype.hasOwnProperty.call(map, code)) return String(map[code] || '');
    return BRANCH_SEED[code] || '';
  }

  /* 빈 값으로 저장하면 seed 지점명도 감춥니다(지점명을 지우고 싶을 때). */
  function setBranch(code, name) {
    if (!code) return;
    var map = readBranches();
    map[code] = String(name == null ? '' : name).trim();
    writeStore(BRANCH_KEY, JSON.stringify(map));
  }

  /* 지점명 비교용 정규화 — 모든 공백을 지우고 대소문자를 무시합니다.
     '상명대점'과 '상명대 점'은 같은 지점명으로 봅니다. */
  function normBranch(name) {
    return String(name == null ? '' : name).replace(/\s+/g, '').toLowerCase();
  }

  /* 같은 담당 컨설턴트 안에서만 같은 비공개 지점명을 찾습니다.
     담당자가 다르면 각자의 DB로 보므로 중복이 아닙니다. */
  function findBranchListing(branchName, consultantId, excludeId) {
    var key = normBranch(branchName);
    if (!key) return null;
    var owner = String(consultantId == null ? '' : consultantId).trim();
    var found = state.listings.filter(function (L) {
      if (excludeId && L.id === excludeId) return false;
      if (normBranch(branchOf(L)) !== key) return false;
      return String(consultantOf(L).id || '').trim() === owner;
    })[0];
    return found || null;
  }

  /* 점포 데이터에 남기는 작성자 표기: '김현율 팀장 (hyunyul89)' */
  function authorLabel() {
    var a = currentAccount();
    return a ? (a.name + ' (' + a.id + ')') : '';
  }

  function tempPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = 'ap';
    for (var i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

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

  /* ---------------- 매물 고유번호 (AP-001 …) ----------------
     사이트 카드·비교·알림이 쓰는 공개 번호를 관리자에서도 같은 규칙으로 다룹니다. */
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

  function codeSeq() {
    var max = 0;
    state.listings.forEach(function (L) {
      var m = String(codeOf(L)).match(/([0-9]+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return max + 1;
  }

  function nextCode() { return normalizeCode('', codeSeq()); }

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
    var s = safeParse(readSession(AUTH_KEY));
    return !!(s && s.id);
  }
  function setAuthed(account) {
    if (account) {
      writeSession(AUTH_KEY, JSON.stringify({ id: account.id, name: account.name, role: account.role, at: new Date().toISOString() }));
    } else {
      writeSession(AUTH_KEY, null);
    }
  }

  /* ---------------- 이 기기에서 로그인 유지 (자동 로그인) ----------------
     체크박스가 켜져 있으면 세션을 sessionStorage 뿐 아니라 localStorage 에도 남겨,
     브라우저를 완전히 껐다 켜도 다시 로그인하지 않습니다.
     비밀번호 원문은 저장하지 않고, 계정의 비밀번호 해시로 만든 '세션 토큰'만 저장합니다.
     그래서 비밀번호가 바뀌거나 계정이 삭제되면 저장된 토큰이 맞지 않아 자동으로 풀립니다. */
  var REMEMBER_KEY = 'apAdminRememberSession';
  var REMEMBER_CHOICE_KEY = 'apAdminRememberChoice';
  var LAST_ID_KEY = 'apAdminLastId';
  var REMEMBER_SALT = 'ap-admin-remember-v1';
  var REMEMBER_DAYS = 30;

  function rememberTokenOf(account) {
    return sha256Hex(String(account.id).toLowerCase() + '|' + String(account.password_hash || '') + '|' + REMEMBER_SALT);
  }

  function readRemember() {
    var rec = safeParse(readStore(REMEMBER_KEY));
    if (!rec || !rec.id || !rec.token) return null;
    return rec;
  }

  function saveRemember(account) {
    if (!account) return Promise.resolve(false);
    return rememberTokenOf(account).then(function (token) {
      writeStore(REMEMBER_KEY, JSON.stringify({
        v: 1,
        id: account.id,
        name: account.name,
        role: normalizeRole(account.role),
        token: token,
        saved_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + REMEMBER_DAYS * 86400000).toISOString()
      }));
      writeStore(LAST_ID_KEY, account.id);
      return true;
    });
  }

  function clearRemember() {
    removeStore(REMEMBER_KEY);
  }

  function rememberFor(id) {
    var rec = readRemember();
    return !!rec && rec.id.toLowerCase() === String(id || '').toLowerCase();
  }

  /* 저장된 자동 로그인 정보를 확인해 세션을 다시 엽니다. 맞지 않으면 지우고 false. */
  function restoreRemember() {
    var rec = readRemember();
    if (!rec) return Promise.resolve(false);
    var expired = !!(rec.expires_at && Date.parse(rec.expires_at) < Date.now());
    var account = findAccount(rec.id);
    if (expired || !account) { clearRemember(); return Promise.resolve(false); }
    return rememberTokenOf(account).then(function (token) {
      if (token !== rec.token) { clearRemember(); return false; }
      writeSession(AUTH_KEY, JSON.stringify({
        id: account.id, name: account.name, role: account.role, at: new Date().toISOString(), remembered: true
      }));
      return true;
    });
  }

  function showLogin() {
    $('#adminLogin').hidden = false;
    $('#adminApp').hidden = true;
    $('#logoutBtn').hidden = true;
    var pwBtn = $('#myPwBtn');
    if (pwBtn) pwBtn.hidden = true;
    closePwModal();
    var who = $('#currentAdmin');
    if (who) { who.hidden = true; who.textContent = ''; }
    var pw = $('#adminPw');
    if (pw) pw.value = '';
    /* 마지막에 로그인한 아이디와 '로그인 유지' 선택을 그대로 채워 둡니다. */
    var lastId = readStore(LAST_ID_KEY);
    var idEl = $('#adminId');
    if (idEl && lastId && !idEl.value) idEl.value = lastId;
    var remember = $('#loginRemember');
    if (remember) {
      var choice = readStore(REMEMBER_CHOICE_KEY);
      remember.checked = choice === null || choice === undefined ? true : choice === '1';
    }
  }

  function renderHeaderUser(account) {
    var who = $('#currentAdmin');
    if (!who) return;
    if (!account) { who.hidden = true; who.textContent = ''; return; }
    who.hidden = false;
    var role = roleLabel(account.role);
    /* 좁은 화면에서는 아이디·역할(<em>)을 숨기고 이름만 보입니다. */
    who.innerHTML = '<b>' + esc(account.name) + '</b><em> · ' + esc(account.id) + ' · ' + esc(role) + '</em>';
    who.title = account.name + ' · ' + account.id + ' · ' + role;
  }

  function enterApp() {
    var account = currentAccount();
    if (!account) { showLogin(); return; }
    $('#adminLogin').hidden = true;
    $('#adminApp').hidden = false;
    $('#logoutBtn').hidden = false;
    var pwBtn = $('#myPwBtn');
    if (pwBtn) pwBtn.hidden = false;
    renderHeaderUser(account);
    applyRoleVisibility();
    selectTab(0);
    renderAccounts();
    loadData().then(function () {
      loadSell();
      loadTelegram();
      renderStats();
      renderStores();
      renderLeads();
      renderSell();
      if (state.deepCode) focusStoreByCode(state.deepCode);
    });
  }

  function initLogin() {
    var form = $('#loginForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = val('#adminId').trim();
      var pw = val('#adminPw');
      var err = $('#loginError');
      var btn = $('button[type="submit"]', form);
      function fail(msg) {
        if (btn) { btn.disabled = false; btn.textContent = '로그인'; }
        if (err) { err.textContent = msg; err.hidden = false; }
      }
      if (!id) { fail('아이디를 입력해 주세요.'); return; }
      if (!pw) { fail('비밀번호를 입력해 주세요.'); return; }
      if (err) err.hidden = true;
      var account = findAccount(id);
      if (!account) { fail('아이디 또는 비밀번호가 맞지 않습니다.'); return; }
      if (btn) { btn.disabled = true; btn.textContent = '확인 중…'; }
      sha256Hex(pw).then(function (hash) {
        if (hash.toLowerCase() !== account.password_hash) {
          fail('아이디 또는 비밀번호가 맞지 않습니다.');
          return;
        }
        if (btn) { btn.disabled = false; btn.textContent = '로그인';
        }
        if (err) err.hidden = true;
        writeStore(LAST_ID_KEY, account.id);
        var remember = $('#loginRemember');
        var keep = !!(remember && remember.checked);
        writeStore(REMEMBER_CHOICE_KEY, keep ? '1' : '0');
        setAuthed(account);
        if (keep) saveRemember(account); else clearRemember();
        enterApp();
        toast(account.name + '님, 관리자 화면을 열었습니다.');
        if (account.must_change) {
          toast('아직 최초 비밀번호입니다. 오른쪽 위 "내 비밀번호"에서 바로 바꿔 주세요.');
        }
      });
    });
    var logout = $('#logoutBtn');
    if (logout) logout.addEventListener('click', function () {
      setAuthed(null);
      clearRemember();
      if ($('#bulkPanel')) closeBulk();
      closePwModal();
      showLogin();
      toast('로그아웃했습니다.');
    });
  }

  /* ---------------- 계정 · 권한 패널 (최종관리자 전용) ---------------- */
  function showAccountMsg(msg, isError) {
    var el = $('#accountMsg');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('is-error', !!isError);
  }

  function renderAccounts() {
    /* 최종관리자가 아니면 계정 목록 자체를 그리지 않습니다. */
    if (!isMaster()) {
      var hiddenBody = $('#accountRows');
      if (hiddenBody) hiddenBody.innerHTML = '';
      var hiddenNotice = $('#pwNotice');
      if (hiddenNotice) { hiddenNotice.hidden = true; hiddenNotice.innerHTML = ''; }
      return;
    }
    var list = readAccounts();
    state.accounts = list;
    var me = currentAccount();
    var meKey = me ? me.id.toLowerCase() : '';
    var body = $('#accountRows');

    if (body) {
      var masters = representativeCount(list);
      body.innerHTML = list.map(function (a) {
        var isMe = a.id.toLowerCase() === meKey;
        var isMasterRow = normalizeRole(a.role) === 'master';
        var lastMaster = isMasterRow && masters <= 1;
        return '' +
          '<tr data-account="' + esc(a.id) + '">' +
            '<td data-label="아이디" class="code-cell">' + esc(a.id) +
              (isMe ? ' <span class="status-badge live">나</span>' : '') + '</td>' +
            '<td data-label="이름">' + esc(a.name) + '</td>' +
            '<td data-label="권한"><div class="role-cell">' +
              '<select class="role-select" data-role="' + esc(a.id) + '" aria-label="' + esc(a.name) + ' 계정 권한"' +
                (lastMaster ? ' disabled' : '') + '>' +
                '<option value="master"' + (isMasterRow ? ' selected' : '') + '>최종관리자</option>' +
                '<option value="consultant"' + (isMasterRow ? '' : ' selected') + '>컨설턴트</option>' +
              '</select>' +
              (a.must_change ? ' <span class="status-badge sample">초기 비밀번호</span>' : '') +
              (lastMaster ? ' <span class="status-badge closed">마지막 최종관리자</span>' : '') +
            '</div></td>' +
            '<td data-label="등록일">' + esc(a.created_at ? kst(a.created_at).slice(0, 10) : '-') + '</td>' +
            '<td data-label="관리"><div class="row-actions">' +
              '<button type="button" class="gold" data-reset="' + esc(a.id) + '">비밀번호 초기화</button>' +
              '<button type="button" class="danger" data-del-account="' + esc(a.id) + '">삭제</button>' +
            '</div></td>' +
          '</tr>';
      }).join('');

      $all('[data-reset]', body).forEach(function (b) {
        b.addEventListener('click', function () { resetAccountPassword(b.getAttribute('data-reset')); });
      });
      $all('[data-del-account]', body).forEach(function (b) {
        b.addEventListener('click', function () { deleteAccount(b.getAttribute('data-del-account')); });
      });
      $all('[data-role]', body).forEach(function (sel) {
        sel.addEventListener('change', function () { changeAccountRole(sel.getAttribute('data-role'), sel.value); });
      });
    }

    var who = $('#pwWho');
    if (who && me) who.textContent = me.name + ' · ' + me.id;

    var notice = $('#pwNotice');
    if (notice) {
      var pending = list.filter(function (a) { return a.must_change; });
      if (pending.length) {
        notice.hidden = false;
        notice.innerHTML = '<b>비밀번호 변경 안내</b> · ' + esc(pending.map(function (a) { return a.id; }).join(', ')) +
          ' 계정이 아직 최초·임시 비밀번호를 쓰고 있습니다. 본인이 오른쪽 위 <b>내 비밀번호</b>에서 새 비밀번호로 바꾸면 표시가 사라집니다.';
      } else {
        notice.hidden = true;
        notice.innerHTML = '';
      }
    }
  }

  /* 권한 변경 — 마지막 최종관리자는 컨설턴트로 낼릴 수 없습니다. */
  function changeAccountRole(id, role) {
    if (!isMaster()) { renderAccounts(); return; }
    var list = readAccounts();
    var acc = list.filter(function (a) { return a.id === id; })[0];
    if (!acc) { renderAccounts(); return; }
    var nextRole = normalizeRole(role);
    if (normalizeRole(acc.role) === nextRole) return;
    if (normalizeRole(acc.role) === 'master' && nextRole !== 'master' && representativeCount(list) <= 1) {
      showAccountMsg('마지막 최종관리자는 컨설턴트로 바꿀 수 없습니다. 다른 계정을 먼저 최종관리자로 지정해 주세요.', true);
      renderAccounts();
      return;
    }
    if (!window.confirm('"' + acc.name + ' (' + acc.id + ')" 계정의 권한을 ' + roleLabel(nextRole) + '(으)로 바꿀까요?')) {
      renderAccounts();
      return;
    }
    acc.role = nextRole;
    writeAccounts(list);
    renderAccounts();
    applyRoleVisibility();
    if (normalizeRole(nextRole) !== 'master' && currentAccount() && currentAccount().id === acc.id) {
      selectTab(0);
    }
    showAccountMsg(acc.name + ' (' + acc.id + ') 계정의 권한을 ' + roleLabel(nextRole) + '(으)로 바꿨습니다.');
    toast('계정 권한을 바꿨습니다.');
  }

  function resetAccountPassword(id) {
    if (!isMaster()) { showAccountMsg('팀원 계정 관리는 최종관리자만 할 수 있습니다.', true); return; }
    var acc = findAccount(id);
    if (!acc) return;
    if (!window.confirm('"' + acc.name + ' (' + acc.id + ')" 계정의 비밀번호를 새 임시 비밀번호로 초기화할까요?\n' +
      '화면에 나오는 임시 비밀번호를 본인에게 전달하고, 로그인 후 바꾸도록 안내하세요.')) return;
    var temp = tempPassword();
    sha256Hex(temp).then(function (hash) {
      var list = readAccounts().map(function (a) {
        if (a.id !== acc.id) return a;
        a.password_hash = hash;
        a.must_change = true;
        a.password_changed_at = new Date().toISOString();
        return a;
      });
      writeAccounts(list);
      renderAccounts();
      /* 임시 비밀번호로 바뀐 계정의 저장된 자동 로그인은 풀립니다. */
      if (rememberFor(acc.id)) clearRemember();
      showAccountMsg(acc.id + ' 계정의 임시 비밀번호는 "' + temp + '" 입니다. 본인에게 전달하고 첫 로그인 후 바꾸도록 안내하세요.');
      toast(acc.name + ' 계정의 비밀번호를 초기화했습니다.');
    });
  }

  function deleteAccount(id) {
    if (!isMaster()) { showAccountMsg('팀원 계정 관리는 최종관리자만 할 수 있습니다.', true); return; }
    var list = readAccounts();
    var acc = list.filter(function (a) { return a.id === id; })[0];
    if (!acc) return;
    var me = currentAccount();
    if (me && me.id.toLowerCase() === acc.id.toLowerCase()) {
      showAccountMsg('지금 로그인한 계정은 삭제할 수 없습니다. 다른 최종관리자로 로그인한 뒤 삭제해 주세요.', true);
      return;
    }
    if (normalizeRole(acc.role) === 'master' && representativeCount(list) <= 1) {
      showAccountMsg('마지막 최종관리자는 삭제할 수 없습니다. 먼저 다른 계정을 최종관리자로 바꾸거나 새 최종관리자를 추가해 주세요.', true);
      return;
    }
    if (!window.confirm('"' + acc.name + ' (' + acc.id + ')" 관리자 계정을 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.')) return;
    writeAccounts(list.filter(function (a) { return a.id !== acc.id; }));
    renderAccounts();
    if (rememberFor(acc.id)) clearRemember();
    showAccountMsg(acc.id + ' 계정을 삭제했습니다.');
    toast('관리자 계정을 삭제했습니다.');
  }

  /* ---------------- 내 비밀번호 변경 (모든 관리자 본인 계정) ----------------
     팀원 계정 관리 탭은 최종관리자만 보이므로, 컨설턴트도 쓸 수 있는
     비밀번호 변경은 헤더의 '내 비밀번호' 버튼으로 따로 뺐습니다. */
  function openPwModal() {
    var me = currentAccount();
    if (!me) { showLogin(); return; }
    var modal = $('#pwModal');
    if (!modal) return;
    var who = $('#pwWho');
    if (who) who.textContent = me.name + ' · ' + me.id + ' · ' + roleLabel(me.role);
    ['#pwCur', '#pwNew', '#pwNew2'].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
    var err = $('#pwError'); if (err) { err.hidden = true; err.textContent = ''; }
    var res = $('#pwResult'); if (res) { res.hidden = true; res.textContent = ''; }
    modal.hidden = false;
    var first = $('#pwCur');
    if (first) first.focus({ preventScroll: true });
  }

  function closePwModal() {
    var modal = $('#pwModal');
    if (modal) modal.hidden = true;
  }

  function initPwModal() {
    var open = $('#myPwBtn');
    if (open) open.addEventListener('click', openPwModal);
    $all('[data-close-pw]').forEach(function (b) { b.addEventListener('click', closePwModal); });
    document.addEventListener('keydown', function (e) {
      var modal = $('#pwModal');
      if (e.key === 'Escape' && modal && !modal.hidden) closePwModal();
    });

    var pwForm = $('#pwForm');
    if (!pwForm) return;
    pwForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#pwError');
      var res = $('#pwResult');
      if (err) err.hidden = true;
      if (res) { res.hidden = true; res.textContent = ''; }
      function fail(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
      var me = currentAccount();
      if (!me) { fail('로그인이 풀렸습니다. 다시 로그인해 주세요.'); return; }
      var cur = val('#pwCur');
      var nw = val('#pwNew');
      var nw2 = val('#pwNew2');
      if (!cur) { fail('현재 비밀번호를 입력해 주세요.'); return; }
      if (nw.length < 4) { fail('새 비밀번호는 4자 이상으로 정해 주세요.'); return; }
      if (nw !== nw2) { fail('새 비밀번호 확인이 일치하지 않습니다.'); return; }
      if (nw === cur) { fail('지금 쓰는 비밀번호와 다른 비밀번호로 바꿔 주세요.'); return; }
      sha256Hex(cur).then(function (curHash) {
        var list = readAccounts();
        var acc = list.filter(function (a) { return a.id.toLowerCase() === me.id.toLowerCase(); })[0];
        if (!acc || acc.password_hash !== curHash.toLowerCase()) {
          fail('현재 비밀번호가 맞지 않습니다.');
          return;
        }
        return sha256Hex(nw).then(function (newHash) {
          var updated = list.map(function (a) {
            if (a.id.toLowerCase() !== me.id.toLowerCase()) return a;
            a.password_hash = newHash;
            a.must_change = false;
            a.password_changed_at = new Date().toISOString();
            return a;
          });
          writeAccounts(updated);
          renderAccounts();
          /* 이 기기에서 자동 로그인 중이었다면 바뀐 비밀번호로 토큰을 다시 맞춥니다. */
          var meNow = findAccount(me.id);
          if (meNow && rememberFor(meNow.id)) saveRemember(meNow);
          pwForm.reset();
          toast('비밀번호를 바꿨습니다.');
          closePwModal();
        });
      });
    });
  }

  function initAccountsPanel() {
    var memberForm = $('#memberForm');
    if (memberForm) memberForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#memberError');
      var res = $('#memberResult');
      if (err) err.hidden = true;
      if (res) { res.hidden = true; res.textContent = ''; }
      function fail(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
      /* 계정 추가·권한 부여는 오직 최종관리자만 */
      if (!isMaster()) { fail('컨설턴트 계정 추가는 최종관리자만 할 수 있습니다.'); return; }
      var name = val('#mName');
      var id = val('#mId').toLowerCase();
      var role = normalizeRole(val('#mRole'));
      var pw = val('#mPw');
      var pw2 = val('#mPw2');
      if (name.length < 2) { fail('이름을 2자 이상 입력해 주세요. (예: 박지훈)'); return; }
      if (!/^[a-z0-9][a-z0-9._-]{2,19}$/.test(id)) { fail('아이디는 영문 소문자·숫자로 시작해 3~20자로 정해 주세요. (영문·숫자·._- 사용)'); return; }
      if (findAccount(id)) { fail('아이디 "' + id + '"는 이미 사용 중입니다.'); return; }
      if (pw.length < 4) { fail('비밀번호는 4자 이상으로 정해 주세요.'); return; }
      if (pw !== pw2) { fail('비밀번호 확인이 일치하지 않습니다.'); return; }
      sha256Hex(pw).then(function (hash) {
        var list = readAccounts();
        if (list.some(function (a) { return a.id.toLowerCase() === id; })) {
          fail('아이디 "' + id + '"는 이미 사용 중입니다.');
          return;
        }
        var nowIso = new Date().toISOString();
        list.push({
          id: id,
          name: name,
          role: role,
          password_hash: hash,
          created_at: nowIso,
          password_changed_at: nowIso,
          must_change: false
        });
        writeAccounts(list);
        renderAccounts();
        memberForm.reset();
        if (res) { res.hidden = false; res.textContent = name + ' (' + id + ') 계정을 ' + roleLabel(role) + '(으)로 추가했습니다. 같은 기기에서는 지금부터 이 아이디로 로그인할 수 있습니다.'; }
        toast(roleLabel(role) + ' 계정을 추가했습니다.');
      });
    });

    var exp = $('#btnAccountsExport');
    if (exp) exp.addEventListener('click', function () {
      if (!isMaster()) { showAccountMsg('계정 설정 내보내기는 최종관리자만 할 수 있습니다.', true); return; }
      var payload = {
        type: 'ap-admin-accounts',
        version: 'admin-accounts-1',
        site: 'ap-partners',
        exported_at: new Date().toISOString(),
        accounts: readAccounts()
      };
      saveText('ap-admin-accounts-' + todayStamp() + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8;');
      showAccountMsg('계정 ' + payload.accounts.length + '개를 JSON 파일로 내보냈습니다. 다른 기기에서 \'계정 설정 불러오기\'로 옮길 수 있습니다.');
      toast('계정 설정을 내보냈습니다.');
    });

    var imp = $('#btnAccountsImport');
    var file = $('#accountsFile');
    if (imp && file) {
      imp.addEventListener('click', function () { file.value = ''; file.click(); });
      file.addEventListener('change', function () {
        if (!isMaster()) { showAccountMsg('계정 설정 불러오기는 최종관리자만 할 수 있습니다.', true); file.value = ''; return; }
        var f = file.files && file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          var raw = safeParse(String(reader.result || ''));
          var incoming = raw && raw.accounts instanceof Array ? raw.accounts : (raw instanceof Array ? raw : null);
          if (!incoming) {
            showAccountMsg('불러올 수 없는 파일입니다. 이 화면에서 내보낸 계정 JSON 파일을 선택해 주세요.', true);
            return;
          }
          var valid = incoming.filter(function (a) {
            return a && a.id && /^[0-9a-f]{64}$/i.test(String(a.password_hash || ''));
          }).map(cloneAccount);
          if (!valid.length) { showAccountMsg('불러올 계정이 없는 파일입니다.', true); return; }
          if (!representativeCount(valid)) {
            showAccountMsg('최종관리자가 없는 계정 목록은 불러올 수 없습니다. 최종관리자가 포함된 파일을 선택해 주세요.', true);
            return;
          }
          if (!window.confirm('계정 ' + valid.length + '개를 불러옵니다.\n같은 아이디는 이 기기의 계정 정보(비밀번호 포함)를 덮어씁니다. 계속할까요?')) return;
          var list = readAccounts();
          valid.forEach(function (a) {
            var idx = -1;
            for (var i = 0; i < list.length; i++) {
              if (list[i].id.toLowerCase() === a.id.toLowerCase()) { idx = i; break; }
            }
            if (idx >= 0) list[idx] = a; else list.push(a);
          });
          writeAccounts(list);
          renderAccounts();
          showAccountMsg(valid.map(function (a) { return a.id; }).join(', ') + ' — ' + valid.length + '개 계정을 불러왔습니다.');
          toast('계정 설정을 불러왔습니다.');
        };
        reader.onerror = function () { showAccountMsg('파일을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.', true); };
        reader.readAsText(f, 'utf-8');
      });
    }
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

  /* ---------------- 탭 · 권한별 화면 ---------------- */
  var TABS = [
    { tab: '#tabStores', panel: '#panelStores' },
    { tab: '#tabLeads', panel: '#panelLeads' },
    { tab: '#tabSell', panel: '#panelSell' },
    { tab: '#tabAccounts', panel: '#panelAccounts', masterOnly: true },
    { tab: '#tabNotify', panel: '#panelNotify' }
  ];

  function selectTab(index) {
    var blocked = !!(TABS[index] && TABS[index].masterOnly && !isMaster());
    if (blocked) {
      toast('계정·권한 관리는 최종관리자만 사용할 수 있습니다.');
      index = 0;
    }
    TABS.forEach(function (t, j) {
      var tabEl = $(t.tab), panelEl = $(t.panel);
      if (!tabEl || !panelEl) return;
      var on = (j === index) && !(t.masterOnly && !isMaster());
      tabEl.setAttribute('aria-selected', on ? 'true' : 'false');
      panelEl.hidden = !on;
    });
    state.tabIndex = index;
    if (index === 3) renderAccounts();
    /* 매장 DB로 돌아올 때마다 담당 컨설턴트·필터 선택지를 최신 계정 기준으로 다시 그립니다. */
    if (index === 0) renderStores();
  }

  /* 최종관리자 전용 탭은 일반 컨설턴트 화면에서 아예 감춥니다. */
  function applyRoleVisibility() {
    var master = isMaster();
    TABS.forEach(function (t) {
      if (!t.masterOnly) return;
      var tabEl = $(t.tab), panelEl = $(t.panel);
      if (tabEl) tabEl.hidden = !master;
      if (!master && panelEl) panelEl.hidden = true;
    });
  }

  function initTabs() {
    TABS.forEach(function (t, i) {
      var tabEl = $(t.tab);
      if (!tabEl) return;
      tabEl.addEventListener('click', function () {
        if (t.masterOnly && !isMaster()) { toast('계정·권한 관리는 최종관리자만 사용할 수 있습니다.'); return; }
        selectTab(i);
      });
    });
  }

  /* ---------------- 점포 폼 ---------------- */
  function openForm(L) {
    state.editingId = L ? L.id : null;
    $('#storeForm').hidden = false;
    $('#storeFormTitle').textContent = L ? '매장 수정' : '새 매장 등록';

    if (!L) {
      $('#fRegion').value = '서울';
      $('#fCategory').value = '카페';
      $('#fPrivate').value = 'N';
      /* 자동으로 붙인 번호라는 표시 — 사용자가 직접 고친 번호와 구분해
         같은 담당자·같은 지점명 중복 체크를 할지 판단합니다. */
      $('#fCode').value = nextCode();
      $('#fCode').setAttribute('data-auto', '1');
      ['#fDistrict', '#fBrand', '#fNote', '#fFloor', '#fPyeong', '#fDeposit', '#fPremium',
        '#fSales', '#fProfit', '#fMat', '#fLabor', '#fFixed', '#fEtc', '#fCheckNote', '#fPoints']
        .forEach(function (id) { var el = $(id); if (el) el.value = ''; });
      $('#fMat').value = '34';
      $('#fLabor').value = '520';
      $('#fFixed').value = '180';
      $('#fEtc').value = '115';
    } else {
      $('#fRegion').value = ['서울', '경기', '인천', '대전', '충남'].indexOf(L.region) !== -1 ? L.region : '기타';
      $('#fCategory').value = ['카페', '디저트', '음식점', '패스트푸드', '치킨'].indexOf(L.category) !== -1 ? L.category : '기타';
      $('#fPrivate').value = L.private_only ? 'Y' : 'N';
      $('#fCode').value = codeOf(L);
      $('#fCode').removeAttribute('data-auto');
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
    renderConsultantField(L);
    clearFormCard();
    var branchInput = $('#fBranch');
    if (branchInput) branchInput.value = L ? branchOf(L) : '';
    updatePublicPreview();
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

  /* 담당 컨설턴트 선택칸 — 최종관리자는 모든 계정 중에서 고르고,
     일반 컨설턴트는 본인(수정 시에는 기존 담당)으로 고정됩니다. */
  function renderConsultantField(L) {
    var sel = $('#fConsultant');
    if (!sel) return;
    var me = currentAccount();
    if (isMaster()) {
      var opts = consultantOptions();
      sel.innerHTML = opts.map(function (o) {
        return '<option value="' + esc(o.id) + '">' + esc(consultantLabel(o.name)) + ' (' + esc(o.id) + ')</option>';
      }).join('');
      var want = L ? consultantOf(L).id : ((me && me.id) || DEFAULT_CONSULTANT_ID);
      sel.value = want;
      sel.disabled = false;
      return;
    }
    var owner = L ? consultantOf(L) : { id: (me && me.id) || '', name: (me && me.name) || '' };
    sel.innerHTML = '<option value="' + esc(owner.id) + '">' + esc(consultantLabel(owner.name)) + '</option>';
    sel.value = owner.id;
    sel.disabled = true;
  }

  /* 손님 화면에 실제로 보일 표기 미리보기 (지역 + 지역구·상권) */
  function updatePublicPreview() {
    var out = $('#fPublicPreview');
    if (!out) return;
    var text = [val('#fRegion'), val('#fDistrict')].filter(Boolean).join(' ');
    out.textContent = text || '지역구·상권을 입력하면 표시됩니다';
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
    clearFormCard();
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
    ['#fRegion', '#fDistrict'].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener('input', updatePublicPreview);
        el.addEventListener('change', updatePublicPreview);
      }
    });
    var codeInput = $('#fCode');
    if (codeInput) {
      codeInput.addEventListener('input', function () { codeInput.removeAttribute('data-auto'); });
    }
    $('#storeForm').addEventListener('submit', onSaveStore);
  }

  function onSaveStore(e) {
    e.preventDefault();
    var formCard = state.formCard;
    var existing = state.editingId ? findListing(state.editingId) : null;
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

    /* 고유번호: 비우면 다음 번호를 붙이고, 이미 쓰는 번호면 저장하지 않습니다. */
    var codeRaw = val('#fCode');
    var code = normalizeCode(codeRaw) || (existing ? codeOf(existing) : nextCode());
    var dupCode = state.listings.filter(function (L) {
      return (!existing || L.id !== existing.id) && codeOf(L) === code;
    })[0];

    if (dupCode) {
      if (err) {
        err.textContent = '고유번호 ' + code + '는 이미 "' + dupCode.area + ' ' + dupCode.brand + '" 점포가 쓰고 있습니다. 다른 번호를 적거나 비워 두세요.';
        err.hidden = false;
      }
      return;
    }

    var meAcc = currentAccount();
    var owner = existing ? consultantOf(existing) : null;
    var consultantId = '';
    var consultantName = '';
    if (isMaster()) {
      var pickId = val('#fConsultant');
      var picked = pickId ? findAccount(pickId) : null;
      consultantId = (picked && picked.id) || pickId || ((meAcc && meAcc.id) || DEFAULT_CONSULTANT_ID);
      consultantName = (picked && picked.name) || (meAcc && meAcc.name) || '김현율';
    } else {
      /* 컨설턴트는 본인이 등록한 매장만 담당으로 잡히고, 남의 매장을 수정할 때는 담당을 그대로 둡니다. */
      consultantId = (owner && owner.id) || (meAcc && meAcc.id) || DEFAULT_CONSULTANT_ID;
      consultantName = (owner && owner.name) || (meAcc && meAcc.name) || '김현율';
    }

    /* 같은 담당 컨설턴트 + 같은 비공개 지점명이면 새 번호로 중복 등록하지 않고
       기존 AP-xxx 매장의 내용·수치만 업데이트합니다.
       고유번호를 직접 적은 경우(사용자가 새 번호를 일부러 지정)와 담당자가 다른 경우는 그대로 신규 등록합니다. */
    var branchText = val('#fBranch');
    var branchMatched = false;
    var codeField = $('#fCode');
    var codeTyped = !!(codeField && codeField.getAttribute('data-auto') !== '1' && String(codeField.value || '').trim());
    if (!existing && !codeTyped && normBranch(branchText)) {
      var sameBranch = findBranchListing(branchText, consultantId, null);
      if (sameBranch) {
        var closedNote = (sameBranch.status === 'closed' || sameBranch.visible === false) ? ' (지금은 거래완료·비노출 상태입니다)' : '';
        var askText = '이미 [' + codeOf(sameBranch) + ' · ' + branchOf(sameBranch) + '] 매장이 있습니다' + closedNote + '. 새 번호로 등록하지 않고 기존 매장을 최신 내용으로 업데이트할까요?';
        if (!window.confirm(askText)) {
          if (err) {
            err.textContent = '등록을 중단했습니다. 기존 ' + codeOf(sameBranch) + ' 매장을 업데이트하려면 다시 저장하고 확인을 눌러 주세요. 같은 지점명으로 새 번호를 따로 만들어야 하면 고유번호 칸에 원하는 번호를 직접 적어 주세요.';
            err.hidden = false;
          }
          return;
        }
        existing = sameBranch;
        branchMatched = true;
        owner = consultantOf(existing);
        code = codeOf(existing);
      }
    }

    /* 비공개 지점명은 관리자 전용 저장소에만 남깁니다. 고유번호가 바뀌면 새 번호로 옮깁니다. */
    setBranch(code, branchText);
    if (existing) {
      var prevCode = codeOf(existing);
      if (prevCode && prevCode !== code) setBranch(prevCode, '');
    }

    var listing = {
      id: existing ? existing.id : 'ap-' + Date.now().toString(36),
      code: code,
      status: existing ? (existing.status === 'closed' ? 'closed' : (existing.status || 'active')) : 'active',
      visible: existing ? existing.visible !== false : true,
      /* 담당 컨설턴트 — 등록한 사람, 또는 최종관리자가 고른 계정 */
      consultant_id: consultantId,
      consultant_name: consultantName,
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
      private_only: val('#fPrivate') === 'Y',
      /* 작성자 기록 — 누가 등록·수정했는지 남깁니다. */
      registered_by: existing ? (existing.registered_by || '') : authorLabel(),
      updated_by: authorLabel()
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
    if (branchMatched) {
      toast('이미 등록된 ' + code + ' 매장을 새 번호 없이 최신 내용으로 업데이트했습니다. 사이트 목록에 반영됩니다.');
    } else {
      toast(existing ? '매장을 수정했습니다. 사이트 목록에 반영됩니다.' : '새 매장을 등록했습니다. 사이트 목록에 반영됩니다.');
    }

    /* 폼에서 고른 물건카드는 매장 저장이 끝난 뒤 고유번호(AP-000)로 비공개 Drive에 올립니다. */
    if (formCard && formCard.dataUrl && code) {
      saveCardRemote(code, formCard.dataUrl).then(function (res) {
        if (res && res.ok) {
          var body = (res.body && res.body.ok) ? res.body : {};
          state.cards[code] = { ok: true, dataUrl: formCard.dataUrl, updated: body.updated || new Date().toISOString(), size: body.size || formCard.bytes || 0, ts: Date.now() };
          toast(code + ' 물건카드를 비공개 Drive에 저장했습니다.');
        } else {
          toast(code + ' 매장은 저장했지만 물건카드는 올리지 못했습니다. 카드의 [물건카드]에서 다시 시도해 주세요.');
        }
      });
    }
  }

  function findListing(id) {
    return state.listings.filter(function (L) { return L.id === id; })[0] || null;
  }

  /* ---------------- 엑셀(CSV) 일괄 등록 ---------------- */
  var BULK_MAX_BYTES = 5 * 1024 * 1024;
  var BULK_MAX_ROWS = 300;
  var CSV_CATEGORIES = ['카페', '디저트', '음식점', '패스트푸드', '치킨', '기타'];
  var REGION_ALIAS = {
    '서울': '서울', '서울시': '서울', '서울특별시': '서울',
    '경기': '경기', '경기도': '경기',
    '인천': '인천', '인천시': '인천', '인천광역시': '인천',
    '대전': '대전', '대전시': '대전', '대전광역시': '대전',
    '충남': '충남', '충청남도': '충남', '충청': '충남', '천안': '충남', '천안시': '충남'
  };

  /* 양식 열 순서 · 별칭 · 필수 여부
     예상수익은 평균치 한 열이다. 예전 양식의 최소·최대 두 열(template:false)이 오면 평균을 쓴다. */
  var CSV_COLS = [
    { key: 'code', label: '고유번호', required: false, aliases: ['코드', '번호', '고유 번호', 'no', 'No.', 'NO', 'AP번호', 'AP 번호'] },
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
    /* 관리자 전용 비공개 지점명 — 같은 담당 컨설턴트 안에서 기존 매장을 찾는 열쇠 (선택 열) */
    { key: 'branch', label: '비공개지점명', required: false,
      aliases: ['비공개 지점명', '지점명', '매장지점명', '매장 지점명', '비공개지점'] },
    /* 예전 양식 호환용 (양식 파일에는 넣지 않는다) */
    { key: 'profit_min', label: '예상수익최소(만원)', required: false, template: false,
      aliases: ['예상수익최소', '예상수익 최소(만원)', '예상순수익최소(만원)', '예상수익최소금액(만원)'] },
    { key: 'profit_max', label: '예상수익최대(만원)', required: false, template: false,
      aliases: ['예상수익최대', '예상수익 최대(만원)', '예상순수익최대(만원)', '예상수익최대금액(만원)'] }
  ];

  var TEMPLATE_COLS = CSV_COLS.filter(function (c) { return c.template !== false; });

  var TEMPLATE_ROWS = [
    ['AP-001', '서울 마포구', '카페', '메가커피', '1층', '13', '1000', '20000', '3200', '1250', '34', '520', '180', '115',
      '대학가 인접 상권 · 평일 08:00~19:30 영업', 'N', ''],
    ['AP-002', '경기 성남시 분당구', '디저트', '설빙', '1층', '15', '1500', '15000', '2600', '900', '36', '620', '370', '520',
      '주차 2대 · 매일 09:00~01:30 영업', 'Y', '']
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
      line: lineNo, ok: false, errors: [], notes: [], listing: null, branch: '', action: 'new', targetId: '',
      view: { code: '', area: '', category: '', brand: '', spec: '', cost: '', sales: '', profit: '' }
    };
    function get(key) {
      var idx = map[key];
      if (idx == null || idx < 0) return '';
      return String(cells[idx] == null ? '' : cells[idx]).trim();
    }

    /* 고유번호: 적혀 있으면 그 번호를, 비어 있으면 빈 번호 다음 번호를 쓴다(중복 검사는 파일 전체를 본 뒤 applyBulkParsed에서). */
    var codeRaw = get('code');
    var code = normalizeCode(codeRaw);
    if (codeRaw && !code) out.notes.push('고유번호 "' + codeRaw + '"를 번호로 읽지 못해 빈 번호 다음 번호로 붙입니다.');
    out.view.code = code || '';

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
        out.notes.push('지역 "' + areaRaw + '"은(는) 서울·경기·인천·대전·충남이 아니라 기타로 분류됩니다.');
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

    /* 비공개 지점명(관리자 전용) — 같은 담당 컨설턴트 안에서 기존 매장을 찾는 데 씁니다. */
    out.branch = get('branch').replace(/\s+/g, ' ').trim();

    out.view.cost = (deposit || premium) ? wonLabel(deposit + premium) : '-';
    out.view.sales = sales > 0 ? wonLabel(sales) : '-';
    out.view.profit = pAvg > 0 ? comma(pAvg) : '-';
    out.view.area = area || areaRaw;

    if (!out.errors.length) {
      out.ok = true;
      out.listing = {
        code: code,
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
    var plan = $('#bulkPlan'); if (plan) plan.textContent = '';
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
    var usedCodes = {};
    state.listings.forEach(function (L) { var c = codeOf(L); if (c) usedCodes[c] = true; });
    var seq = codeSeq();
    var bulkMe = currentAccount();
    var bulkOwnerId = (bulkMe && bulkMe.id) || DEFAULT_CONSULTANT_ID;
    /* 같은 파일 안에서 같은 지점명이 다시 나오면 앞 행이 등록·업데이트한 매장을 대상으로 삼습니다. */
    var fileBranch = {};
    rows.forEach(function (row) {
      if (!row.ok || !row.listing) return;
      row.action = 'new';
      row.targetId = '';
      var key = normBranch(row.branch);
      var target = key ? (fileBranch[key] || findBranchListing(row.branch, bulkOwnerId, null)) : null;
      if (target) {
        var targetCode = codeOf(target) || target.code || '';
        if (row.listing.code && row.listing.code !== targetCode) {
          row.notes.push('고유번호 ' + row.listing.code + ' 대신 기존 매장 번호 ' + targetCode + '로 업데이트합니다.');
        }
        row.notes.push('같은 담당자·같은 비공개 지점명(' + row.branch + ')의 기존 매장 ' + targetCode + '을(를) 새 번호 없이 업데이트합니다.');
        if (target.status === 'closed' || target.visible === false) {
          row.notes.push('기존 매장이 거래완료·비노출 상태입니다. 내용만 업데이트되고 사이트에는 보이지 않습니다.');
        }
        row.action = target.id ? 'update' : 'update-new';
        row.targetId = target.id || '';
        row.listing.code = targetCode;
        row.view.code = targetCode;
        if (target.id) usedCodes[targetCode] = true;
        fileBranch[key] = target;
        return;
      }
      var rowCode = row.listing.code;
      if (rowCode && usedCodes[rowCode]) {
        row.notes.push('고유번호 ' + rowCode + '는 이미 쓰고 있어 새 번호로 붙입니다.');
        rowCode = '';
      }
      if (!rowCode) {
        while (usedCodes[normalizeCode('', seq)]) seq++;
        rowCode = normalizeCode('', seq);
        seq++;
        if (!row.listing.code) row.notes.push('고유번호 ' + rowCode + '를 자동으로 붙였습니다.');
      }
      usedCodes[rowCode] = true;
      row.listing.code = rowCode;
      row.view.code = rowCode;
      if (key) fileBranch[key] = { id: '', code: rowCode };
    });
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

  /* CSV 결과 요약 문구 — '신규 N건 · 업데이트 M건' */
  function bulkPlanLabel(rows) {
    var okRows = rows.filter(function (r) { return r.ok; });
    var newCount = okRows.filter(function (r) { return r.action !== 'update' && r.action !== 'update-new'; }).length;
    var updCount = okRows.filter(function (r) { return r.action === 'update'; }).length;
    return { newCount: newCount, updCount: updCount, label: '신규 ' + newCount + '건 · 업데이트 ' + updCount + '건' };
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
    var plan = bulkPlanLabel(bulk.rows);
    var planEl = $('#bulkPlan');
    if (planEl) planEl.textContent = plan.label;

    $('#bulkRows').innerHTML = bulk.rows.map(function (r) {
      var note;
      if (r.errors.length) {
        note = '<span class="bulk-note err">' + r.errors.map(esc).join('<br />') + '</span>';
      } else if (r.notes.length) {
        note = '<span class="bulk-note">' + r.notes.map(esc).join('<br />') + '</span>';
      } else {
        note = '<span class="bulk-note">-</span>';
      }
      var badge = '<span class="status-badge error">오류</span>';
      if (r.ok) {
        if (r.action === 'update') badge = '<span class="status-badge sample">업데이트</span>';
        else if (r.action === 'update-new') badge = '<span class="status-badge sample">같은 파일 통합</span>';
        else badge = '<span class="status-badge live">신규</span>';
      }
      return '' +
        '<tr class="' + (r.ok ? '' : 'is-bad') + '">' +
          '<td data-label="행" class="bulk-no">' + r.line + '</td>' +
          '<td data-label="상태">' + badge + '</td>' +
          '<td data-label="고유번호" class="code-cell">' + esc(r.view.code || '-') + '</td>' +
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
    var bulkMe = currentAccount();
    var bulkOwner = { id: (bulkMe && bulkMe.id) || DEFAULT_CONSULTANT_ID, name: (bulkMe && bulkMe.name) || '김현율' };
    var byId = {};
    state.listings.forEach(function (L) { byId[L.id] = L; });
    var fresh = [];
    var freshByCode = {};
    var added = 0, updated = 0;

    okRows.forEach(function (r) {
      var L = {};
      for (var k in r.listing) {
        if (Object.prototype.hasOwnProperty.call(r.listing, k)) L[k] = r.listing[k];
      }
      var base = r.targetId ? byId[r.targetId] : null;
      var keepCode = base ? codeOf(base) : String(r.listing.code || '');
      if (base) {
        /* 기존 AP-xxx 번호·상태·작성자·비공개 메모는 유지하고 내용·수치만 최신으로 업데이트 */
        L.id = base.id;
        L.code = keepCode;
        L.status = base.status === 'closed' ? 'closed' : (base.status || 'active');
        L.visible = base.visible !== false;
        L.registered_by = base.registered_by || '';
        L.private_deals = base.private_deals ? base.private_deals : [];
        L.consultant_id = base.consultant_id || bulkOwner.id;
        L.consultant_name = base.consultant_name || bulkOwner.name;
        L.updated_by = authorLabel();
        byId[base.id] = L;
        updated++;
      } else if (freshByCode[keepCode]) {
        /* 같은 파일 안에서 같은 지점명이 다시 나오면 나중 행 내용으로 합칩니다. */
        var idx = fresh.indexOf(freshByCode[keepCode]);
        L.id = freshByCode[keepCode].id;
        L.code = keepCode;
        L.consultant_id = bulkOwner.id;
        L.consultant_name = bulkOwner.name;
        L.registered_by = authorLabel();
        L.updated_by = authorLabel();
        L.private_deals = L.private_deals || [];
        fresh[idx] = L;
        freshByCode[keepCode] = L;
      } else {
        L.id = 'ap-' + stamp + '-' + pad2(fresh.length + 1);
        L.code = keepCode;
        L.consultant_id = bulkOwner.id;
        L.consultant_name = bulkOwner.name;
        L.registered_by = authorLabel();
        L.updated_by = authorLabel();
        L.private_deals = L.private_deals || [];
        fresh.push(L);
        freshByCode[keepCode] = L;
        added++;
      }
      if (r.branch) setBranch(keepCode, r.branch);
    });

    state.listings = fresh.concat(state.listings.map(function (L) { return byId[L.id] || L; }));
    persist();
    renderStats();
    renderStores();
    closeBulk();
    toast('신규 ' + added + '건 · 업데이트 ' + updated + '건을 반영했습니다. 사이트 점포 목록에 바로 반영됩니다.');
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

  /* ---------------- 매장 DB 목록 (카드 · 필터) ---------------- */
  function statusBadge(L) {
    if (L.status === 'closed' || L.visible === false) return '<span class="status-badge closed">거래완료 · 비노출</span>';
    if (L.status === 'sample') return '<span class="status-badge sample">샘플 · 노출 중</span>';
    return '<span class="status-badge live">노출 중</span>';
  }

  /* 담당 컨설턴트 후보 — 등록된 계정(최종관리자 먼저) + 예전 매장에 남은 담당 이름 */
  function consultantOptions() {
    var out = [];
    readAccounts().forEach(function (a) {
      out.push({ id: a.id, name: a.name, role: normalizeRole(a.role) });
    });
    state.listings.forEach(function (L) {
      var c = consultantOf(L);
      if (!out.some(function (o) { return o.id === c.id; })) {
        out.push({ id: c.id, name: c.name, role: 'consultant' });
      }
    });
    out.sort(function (a, b) {
      var am = a.role === 'master' ? 0 : 1;
      var bm = b.role === 'master' ? 0 : 1;
      if (am !== bm) return am - bm;
      return String(a.name).localeCompare(String(b.name), 'ko');
    });
    return out;
  }

  function fillFilterSelect(sel, values, allLabel, current) {
    if (!sel) return;
    var html = ['<option value="">' + allLabel + '</option>'];
    values.forEach(function (v) {
      html.push('<option value="' + esc(v.value) + '">' + esc(v.label) + '</option>');
    });
    sel.innerHTML = html.join('');
    sel.value = values.some(function (v) { return v.value === current; }) ? current : '';
  }

  function renderStoreFilters() {
    var regions = ['서울', '경기', '인천', '대전', '충남', '기타'];
    state.listings.forEach(function (L) {
      var r = String(L.region || '').trim();
      if (r && regions.indexOf(r) === -1) regions.push(r);
    });
    if (state.storeFilters.region && regions.indexOf(state.storeFilters.region) === -1) state.storeFilters.region = '';
    fillFilterSelect($('#storeFilterRegion'), regions.map(function (r) { return { value: r, label: r }; }),
      '전체 지역', state.storeFilters.region);

    var cats = ['카페', '디저트', '음식점', '치킨', '기타'];
    state.listings.forEach(function (L) {
      var c = String(L.category || '').trim();
      if (c && cats.indexOf(c) === -1) cats.push(c);
    });
    if (state.storeFilters.category && cats.indexOf(state.storeFilters.category) === -1) state.storeFilters.category = '';
    fillFilterSelect($('#storeFilterCategory'), cats.map(function (c) { return { value: c, label: c }; }),
      '전체 업종', state.storeFilters.category);

    var owners = consultantOptions();
    if (state.storeFilters.consultant && !owners.some(function (o) { return o.id === state.storeFilters.consultant; })) {
      state.storeFilters.consultant = '';
    }
    fillFilterSelect($('#storeFilterConsultant'), owners.map(function (o) {
      return { value: o.id, label: consultantLabel(o.name) };
    }), '매장 전체', state.storeFilters.consultant);
  }

  function filteredListings() {
    var f = state.storeFilters;
    var q = String(f.q || '').toLowerCase();
    return state.listings.filter(function (L) {
      if (f.region && String(L.region || '') !== f.region) return false;
      if (f.category && String(L.category || '') !== f.category) return false;
      var closed = L.status === 'closed' || L.visible === false;
      if (f.status === 'live' && closed) return false;
      if (f.status === 'closed' && !closed) return false;
      if (f.status === 'private' && !L.private_only) return false;
      var owner = consultantOf(L);
      if (f.consultant && owner.id !== f.consultant) return false;
      if (q) {
        var hay = [codeOf(L), L.area, L.brand, L.category, L.district, L.area_note, branchOf(L), owner.name]
          .join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function storeCardHTML(L) {
    var closed = L.status === 'closed' || L.visible === false;
    var code = codeOf(L);
    var branch = branchOf(L);
    var owner = consultantOf(L);
    var cost = (L.initial_cost && L.initial_cost.label) || '-';
    var sales = String((L.monthly_sales && L.monthly_sales.label) || '').replace(/^월 평균\s*/, '') || '-';
    var profitRaw = (L.profit && (L.profit.label || L.profit.avg_manwon)) || '';
    var profit = profitRaw
      ? (String(L.profit.label || '').replace(/^월 약\s*/, '') || (comma(L.profit.avg_manwon) + '만 원'))
      : '-';
    var by = (L.registered_by || L.updated_by)
      ? '등록 ' + (L.registered_by || '-') + (L.updated_by && L.updated_by !== L.registered_by ? ' · 수정 ' + L.updated_by : '')
      : '';
    return '' +
      '<article class="store-card' + (closed ? ' is-closed' : '') + '" data-code="' + esc(code) + '" data-id="' + esc(L.id) + '" data-consultant="' + esc(owner.id) + '">' +
        '<div class="store-card-head">' +
          '<div class="store-card-title">' +
            '<span class="store-code">No. ' + esc(code || '-') + '</span>' +
            '<h3>' + esc(L.brand || '(브랜드 미정)') + '</h3>' +
            (branch ? '<span class="branch-badge" title="관리자 전용 비공개 지점명 — 손님 화면에는 보이지 않습니다">[' + esc(branch) + ']</span>' : '') +
          '</div>' +
          '<div class="store-card-state">' + statusBadge(L) +
            (L.private_only ? ' <span class="status-badge sample">비공개전용</span>' : '') + '</div>' +
        '</div>' +
        '<p class="store-public"><span>고객 노출</span>' + esc(L.area || '-') + '</p>' +
        '<p class="store-note">' + esc([L.category, L.store_spec, L.area_note].filter(Boolean).join(' · ')) + '</p>' +
        '<dl class="store-figures">' +
          '<div><span>초기 인수</span><b>' + esc(cost) + '</b></div>' +
          '<div><span>월 매출</span><b>' + esc(sales) + '</b></div>' +
          '<div><span>예상 수익</span><b>' + esc(profit) + '</b></div>' +
          '<div><span>담당 컨설턴트</span><b class="store-owner">' + esc(consultantLabel(owner.name)) + '</b></div>' +
        '</dl>' +
        (by ? '<p class="store-by">' + esc(by) + '</p>' : '') +
        '<div class="store-card-foot">' +
          '<select class="store-status" data-status aria-label="' + esc((L.brand || '') + ' 노출 상태') + '">' +
            '<option value="live"' + (closed ? '' : ' selected') + '>노출 중</option>' +
            '<option value="closed"' + (closed ? ' selected' : '') + '>거래완료 · 비노출</option>' +
          '</select>' +
          '<div class="row-actions">' +
            '<button type="button" class="card" data-card="' + esc(L.id) + '" aria-label="' + esc((L.brand || '') + ' 물건카드 보기·첨부') + '">물건카드</button>' +
            '<button type="button" class="gold" data-edit="' + esc(L.id) + '">수정</button>' +
            '<button type="button" class="danger" data-del="' + esc(L.id) + '">삭제</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderStores() {
    var wrap = $('#storeCards');
    if (!wrap) return;
    renderStoreFilters();
    var list = filteredListings();
    var label = $('#storeCountLabel');
    if (label) label.textContent = '(' + list.length + '/' + state.listings.length + ')';
    var empty = $('#storeEmpty');
    if (empty) empty.hidden = list.length > 0;
    wrap.innerHTML = list.map(storeCardHTML).join('');
    bindStoreCardActions(wrap);
  }

  function bindStoreCardActions(wrap) {
    $all('[data-card]', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        var L = findListing(b.getAttribute('data-card'));
        if (L) openCardModal(L);
      });
    });
    $all('[data-edit]', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        var L = findListing(b.getAttribute('data-edit'));
        if (L) openForm(L);
      });
    });
    $all('[data-del]', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-del');
        var L = findListing(id);
        if (!L) return;
        if (!window.confirm('"' + L.area + ' ' + L.brand + '" 매장을 목록에서 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.')) return;
        state.listings = state.listings.filter(function (x) { return x.id !== id; });
        persist();
        renderStats();
        renderStores();
        toast('매장을 삭제했습니다.');
      });
    });
    $all('[data-status]', wrap).forEach(function (sel) {
      sel.addEventListener('change', function () {
        var card = sel.closest('.store-card');
        var id = card ? card.getAttribute('data-id') : '';
        var L = findListing(id);
        if (!L) return;
        if (sel.value === 'closed') {
          L.status_prev = L.status;
          L.status = 'closed';
          L.visible = false;
          toast('거래완료로 돌렸습니다. 사이트 목록에서 감춰집니다.');
        } else {
          L.status = L.status_prev || 'live';
          L.visible = true;
          delete L.status_prev;
          toast('거래완료를 해제했습니다. 사이트에 다시 노출됩니다.');
        }
        persist();
        renderStats();
        renderStores();
      });
    });
  }

  function initStoreFilters() {
    var search = $('#storeSearch');
    if (search) search.addEventListener('input', function () {
      state.storeFilters.q = String(search.value || '').trim();
      renderStores();
    });
    [['#storeFilterRegion', 'region'], ['#storeFilterCategory', 'category'],
      ['#storeFilterStatus', 'status'], ['#storeFilterConsultant', 'consultant']]
      .forEach(function (pair) {
        var el = $(pair[0]);
        if (!el) return;
        el.addEventListener('change', function () {
          state.storeFilters[pair[1]] = el.value;
          renderStores();
        });
      });
    var reset = $('#storeFilterReset');
    if (reset) reset.addEventListener('click', function () {
      state.storeFilters = { q: '', region: '', category: '', status: '', consultant: '' };
      if (search) search.value = '';
      renderStores();
    });
  }

  /* 텔레그램에서 연 admin.html?id=AP-005 — 해당 카드로 스크롤하고 잠시 강조합니다. */
  function parseDeepCode() {
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
    return raw ? (normalizeCode(raw) || '') : '';
  }

  function focusStoreByCode(code) {
    if (!code) return;
    selectTab(0);
    var wrap = $('#storeCards');
    if (!wrap) return;
    var card = $('.store-card[data-code="' + code + '"]', wrap);
    if (!card) {
      /* 필터에 가려져 있으면 필터를 풀고 다시 찾습니다. */
      state.storeFilters = { q: '', region: '', category: '', status: '', consultant: '' };
      var searchEl = $('#storeSearch');
      if (searchEl) searchEl.value = '';
      renderStores();
      card = $('.store-card[data-code="' + code + '"]', wrap);
    }
    if (!card) {
      toast(code + ' 매장을 이 브라우저에서 찾지 못했습니다. 매장 DB에서 번호로 검색해 주세요.');
      var search = $('#storeSearch');
      if (search) { search.value = code; state.storeFilters.q = code; renderStores(); }
      return;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('is-focus');
    setTimeout(function () { card.classList.remove('is-focus'); }, 8000);
    toast('알림에서 연 ' + code + ' 매장입니다.');
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
    if (typeof s === 'string') {
      /* 텔레그램 알림용으로 붙은 링크 '(https://…/?id=AP-005)' 는 CSV·화면에서 띄어 냅니다. */
      return s.replace(/\s*\(https?:\/\/[^)]*\)\s*$/, '').trim();
    }
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
        : L.source === 'store_detail' ? '상세 상담'
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

  /* ---------------- 물건카드 (비공개 Google Drive) ----------------
     관리자 페이지는 이미지를 직접 보관하지 않고, Apps Script 웹훅(LEAD_ENDPOINT)에
     action=getCard / action=saveCard 로 요청해 현율 님 드라이브 폴더와 주고받습니다. */
  function cardConfig() {
    var cfg = safeParse(readStore(CARD_CONFIG_KEY));
    if (!cfg || typeof cfg !== 'object') cfg = {};
    return {
      endpoint: String(cfg.endpoint || CARD_ENDPOINT_DEFAULT).trim(),
      secret: String(cfg.secret == null ? CARD_SECRET_DEFAULT : cfg.secret),
      stored: !!(cfg.endpoint || cfg.secret),
      updated_at: cfg.updated_at || ''
    };
  }

  function saveCardConfig(endpoint, secret) {
    var data = { endpoint: String(endpoint || '').trim(), secret: String(secret || ''), updated_at: new Date().toISOString() };
    writeStore(CARD_CONFIG_KEY, JSON.stringify(data));
    return cardConfig();
  }

  function cardFetchUrl(action, extra) {
    var cfg = cardConfig();
    if (!cfg.endpoint) return '';
    var q = 'action=' + encodeURIComponent(action) + '&key=' + encodeURIComponent(cfg.secret) + '&_t=' + Date.now();
    if (extra) q += '&' + extra;
    return cfg.endpoint + (cfg.endpoint.indexOf('?') === -1 ? '?' : '&') + q;
  }

  /* 서버 응답을 읽지 못한 경우(CORS·네트워크)와 서버가 준 실패를 구분해서 돌려줍니다. */
  function cardReasonText(r) {
    var reason = (r && r.reason) || '';
    if (reason === 'unauthorized') return '연동 키가 Apps Script의 CARD_SECRET_KEY와 다릅니다. [알림 설정 → 물건카드 연동]에서 키를 맞춰 주세요.';
    if (reason === 'folder_unavailable') return 'Drive 폴더(AP파트너_물건카드_비공개)를 찾을 수 없습니다. 폴더 ID와 스크립트 액세스 권한을 확인해 주세요.';
    if (reason === 'not_found') return '등록된 물건카드 없음';
    if (reason === 'too_large') return '이미지가 너무 큽니다. 8MB 이하로 올려 주세요.';
    if (reason === 'bad_data_url') return '이미지 형식을 읽지 못했습니다. jpg·png 파일로 다시 시도해 주세요.';
    if (reason === 'bad_id') return '물건카드 번호(AP-000)를 확인해 주세요.';
    if (reason === 'no-endpoint') return '웹훅 주소가 비어 있습니다. [알림 설정 → 물건카드 연동]에서 주소를 저장해 주세요.';
    if (reason === 'no_doget') return 'Apps Script에 물건카드 조회(doGet)가 아직 배포되지 않았습니다. docs/apps-script-property-cards.gs의 [2] 블록을 붙이고 새 버전으로 배포해 주세요.';
    if (reason === 'auth') return 'Apps Script 배포가 공개되지 않았습니다. [배포 관리]에서 액세스 권한을 모든 사용자로 바꿔 주세요.';
    if (reason === 'network') return '웹훅에 연결하지 못했습니다. Apps Script에 물건카드 코드(doGet)를 붙여 새 버전으로 배포했는지, 배포 액세스 권한이 "모든 사용자"인지 확인해 주세요. [알림 설정 → 응답 미리 보기 ↗]로 실제 응답을 볼 수 있습니다.';
    return '물건카드를 불러오지 못했습니다' + (reason ? ' (' + reason + ')' : '') + '.';
  }

  /* ---- 웹훅 읽기: JSONP 먼저, 안 되면 fetch ----
     Apps Script 웹 앱은 응답에 CORS 헤더가 붙지 않는 경우가 있어, 브라우저에서는
     <script> 태그로 부를 수 있는 JSONP(callback=) 경로를 먼저 시도합니다.
     (Code.gs의 doGet이 callback 이름을 받아 자바스크립트로 감싸줍니다.) */
  function cardQueryString(action, extra, callbackName) {
    var cfg = cardConfig();
    var q = 'action=' + encodeURIComponent(action) + '&key=' + encodeURIComponent(cfg.secret) + '&_t=' + Date.now();
    if (extra) q += '&' + extra;
    if (callbackName) q += '&callback=' + encodeURIComponent(callbackName);
    return cfg.endpoint + (cfg.endpoint.indexOf('?') === -1 ? '?' : '&') + q;
  }

  function cardJsonpGet(action, extra) {
    var cfg = cardConfig();
    if (!cfg.endpoint) return Promise.resolve({ ok: false, reason: 'no-endpoint' });
    return new Promise(function (resolve) {
      var name = 'apCardCb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      var done = false;
      var script = document.createElement('script');
      var timer = setTimeout(function () { finish({ ok: false, reason: 'network' }); }, 15000);
      function finish(data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[name]; } catch (e) { window[name] = null; }
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(data && typeof data === 'object' ? data : { ok: false, reason: 'bad_response' });
      }
      window[name] = finish;
      script.onerror = function () { finish({ ok: false, reason: 'network' }); };
      script.onload = function () { finish({ ok: false, reason: 'network' }); };
      script.src = cardQueryString(action, extra, name);
      document.head.appendChild(script);
    });
  }

  function cardFetchGet(action, extra) {
    var cfg = cardConfig();
    if (!cfg.endpoint) return Promise.resolve({ ok: false, reason: 'no-endpoint' });
    return fetch(cardQueryString(action, extra, ''), { method: 'GET', cache: 'no-store' }).then(function (res) {
      return res.text().then(function (t) {
        var body = safeParse(t);
        if (body && typeof body === 'object') return body;
        /* 아직 doGet이 없는 스크립트는 HTML 안내문(HTTP 200)을 돌려줍니다. */
        if (/Script function not found/i.test(t)) return { ok: false, reason: 'no_doget' };
        if (/\bdoGet\b/i.test(t) && /(없|찾을 수 없|not found)/i.test(t)) return { ok: false, reason: 'no_doget' };
        if (/accounts\.google\.com|Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778/i.test(t)) return { ok: false, reason: 'auth' };
        return { ok: false, reason: res.ok ? 'bad_response' : ('HTTP ' + res.status) };
      });
    }).catch(function (err) {
      return { ok: false, reason: 'network', message: String((err && err.message) || err) };
    });
  }

  function cardGet(action, extra) {
    return cardJsonpGet(action, extra).then(function (r) {
      if (r && (r.ok || (r.reason && r.reason !== 'network' && r.reason !== 'bad_response'))) return r;
      return cardFetchGet(action, extra).then(function (r2) {
        if (r2 && (r2.ok || (r2.reason && r2.reason !== 'network' && r2.reason !== 'bad_response'))) return r2;
        return r;
      });
    });
  }

  function fetchCardData(code) {
    if (!cardConfig().endpoint || !code) return Promise.resolve({ ok: false, reason: 'no-endpoint' });
    return cardGet('getCard', 'id=' + encodeURIComponent(code));
  }

  /* 이미지 저장. 응답을 읽지 못했을 때는 이미 저장됐는지 getCard로 먼저 확인한 뒤에만 다시 보냅니다. */
  function saveCardRemote(code, dataUrl) {
    var cfg = cardConfig();
    if (!cfg.endpoint) return Promise.resolve({ ok: false, reason: 'no-endpoint' });
    var body = JSON.stringify({ action: 'saveCard', id: code, key: cfg.secret, dataUrl: dataUrl, saved_at: new Date().toISOString() });
    return fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    }).then(function (res) {
      return res.text().then(function (t) {
        var j = safeParse(t);
        if (j && j.ok) return { ok: true, body: j };
        if (j) return { ok: false, reason: j.reason || ('HTTP ' + res.status) };
        return { ok: false, reason: 'HTTP ' + res.status };
      });
    }).catch(function () {
      return fetchCardData(code).then(function (check) {
        if (check && check.ok && check.dataUrl === dataUrl) return { ok: true, body: check, verified: true };
        return fetch(cfg.endpoint, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: body
        }).then(function () {
          return { ok: true, uncertain: true };
        }).catch(function (err2) {
          return { ok: false, reason: 'network', message: String((err2 && err2.message) || err2) };
        });
      });
    });
  }

  /* 고른 사진을 긴 변 1600px · JPEG로 축소해 data URL로 만듭니다(원본이 작으면 그대로). */
  function imageFileToDataUrl(file, maxSide) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('파일이 없습니다.')); return; }
      if (!/^image\//i.test(String(file.type || ''))) { reject(new Error('이미지 파일이 아닙니다.')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('파일을 읽지 못했습니다.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('이미지를 열지 못했습니다. jpg·png 파일로 다시 시도해 주세요.')); };
        img.onload = function () {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var limit = maxSide || CARD_MAX_SIDE;
          var scale = Math.min(1, limit / Math.max(w, h));
          var tw = Math.max(1, Math.round(w * scale));
          var th = Math.max(1, Math.round(h * scale));
          var out = String(reader.result || '');
          try {
            var canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tw, th);
            ctx.drawImage(img, 0, 0, tw, th);
            out = canvas.toDataURL('image/jpeg', 0.85);
          } catch (e) { /* 캔버스를 못 쓰면 원본 data URL을 그대로 */ }
          resolve({ dataUrl: out, width: tw, height: th, name: file.name || '', bytes: Math.round(out.length * 0.75) });
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  function cardUpdatedLabel(iso) {
    if (!iso) return '';
    try { return kst(iso, true); } catch (e) { return ''; }
  }

  function renderCardModal() {
    var st = state.card;
    var loading = $('#cardLoading');
    var empty = $('#cardEmpty');
    var figure = $('#cardFigure');
    var meta = $('#cardMeta');
    var err = $('#cardError');
    var zoom = $('#cardZoom');
    var img = $('#cardImage');
    if (!loading) return;
    loading.hidden = st.status !== 'loading';
    empty.hidden = st.status !== 'none';
    figure.hidden = st.status !== 'ok';
    if (err) err.hidden = true;
    if (zoom) {
      zoom.hidden = st.status !== 'ok';
      zoom.textContent = st.zoom ? '화면에 맞춰 보기' : '확대해서 보기';
    }
    if (figure) figure.classList[st.zoom ? 'add' : 'remove']('is-zoom');
    if (img && st.status === 'ok' && img.getAttribute('src') !== st.dataUrl) img.src = st.dataUrl;
    if (meta) {
      if (st.status === 'ok') {
        var bits = [st.code];
        if (st.updated) bits.push(cardUpdatedLabel(st.updated) + ' 갱신');
        if (st.size) bits.push(Math.max(1, Math.round(st.size / 1024)) + 'KB');
        bits.push('비공개 Drive 원본');
        meta.textContent = bits.join(' · ');
        meta.hidden = false;
      } else {
        meta.hidden = true;
      }
    }
  }

  function showCardError(msg) {
    var err = $('#cardError');
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
  }

  function cardProgress(msg) {
    var el = $('#cardProgress');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = msg;
    el.hidden = false;
  }

  function openCardModal(L) {
    var modal = $('#cardModal');
    if (!modal || !L) return;
    var code = codeOf(L);
    state.card = { code: code, listingId: L.id, status: 'loading', dataUrl: '', updated: '', size: 0, zoom: false, busy: false };
    var title = $('#cardModalTitle');
    if (title) title.textContent = 'No. ' + (code || '-') + ' 물건카드';
    var who = $('#cardModalWho');
    if (who) {
      var branch = branchOf(L);
      who.textContent = [L.brand || '', L.area || '', branch ? '[' + branch + ']' : ''].filter(Boolean).join(' · ');
    }
    cardProgress('');
    modal.hidden = false;
    renderCardModal();
    refreshCard(code, true);
  }

  function closeCardModal() {
    var modal = $('#cardModal');
    if (modal) modal.hidden = true;
    state.card = { code: '', listingId: '', status: 'idle', dataUrl: '', updated: '', size: 0, zoom: false, busy: false };
    cardProgress('');
  }

  /* 캐시가 있으면 바로 보여 주면서, 뒤에서 최신으로 갱신합니다. */
  function refreshCard(code, useCache) {
    var cached = state.cards[code];
    if (useCache && cached && (Date.now() - cached.ts) < CARD_CACHE_MS) {
      applyCardResult(code, cached);
      return Promise.resolve(cached);
    }
    if (state.card.code === code) {
      state.card.status = 'loading';
      state.card.dataUrl = '';
      renderCardModal();
    }
    return fetchCardData(code).then(function (r) {
      var data = { ok: !!(r && r.ok), dataUrl: (r && r.dataUrl) || '', updated: (r && r.updated) || '', size: (r && r.size) || 0, reason: (r && r.reason) || '', ts: Date.now() };
      state.cards[code] = data;
      if (state.card.code === code) applyCardResult(code, data);
      return data;
    });
  }

  function applyCardResult(code, data) {
    if (!state.card || state.card.code !== code) return;
    if (data.ok && data.dataUrl) {
      state.card.status = 'ok';
      state.card.dataUrl = data.dataUrl;
      state.card.updated = data.updated || '';
      state.card.size = data.size || 0;
      cardProgress('');
    } else if (data.reason === 'not_found') {
      state.card.status = 'none';
      state.card.dataUrl = '';
      state.card.updated = '';
      cardProgress('');
    } else {
      state.card.status = 'none';
      state.card.dataUrl = '';
      showCardError(cardReasonText(data));
    }
    renderCardModal();
  }

  function handleCardFile(file) {
    var st = state.card;
    if (!st || !st.code || !file || st.busy) return;
    st.busy = true;
    cardProgress('이미지를 준비하는 중…');
    imageFileToDataUrl(file, CARD_MAX_SIDE).then(function (img) {
      cardProgress('비공개 Drive에 저장하는 중…');
      return saveCardRemote(st.code, img.dataUrl).then(function (res) { return { res: res, img: img }; });
    }).then(function (o) {
      st.busy = false;
      var res = o.res;
      if (!res.ok) {
        cardProgress('');
        showCardError(cardReasonText(res));
        return;
      }
      var body = (res.body && res.body.ok) ? res.body : {};
      var saved = { ok: true, dataUrl: o.img.dataUrl, updated: body.updated || new Date().toISOString(), size: body.size || o.img.bytes, ts: Date.now() };
      state.cards[st.code] = saved;
      applyCardResult(st.code, saved);
      cardProgress('저장했습니다 · ' + o.img.width + '×' + o.img.height + 'px' + (body.replaced && body.replaced.length ? ' · 이전 파일은 휴지통으로 이동' : ''));
      toast(st.code + ' 물건카드를 비공개 Drive에 저장했습니다.');
    }).catch(function (err) {
      st.busy = false;
      cardProgress('');
      showCardError('업로드하지 못했습니다 · ' + String((err && err.message) || err));
    });
  }

  function initCardModal() {
    var modal = $('#cardModal');
    if (!modal) return;
    $all('[data-close-card]', modal).forEach(function (b) { b.addEventListener('click', closeCardModal); });
    var pick = $('#cardPick');
    var input = $('#cardFile');
    if (pick && input) {
      pick.addEventListener('click', function () { input.value = ''; input.click(); });
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (f) handleCardFile(f);
      });
    }
    var zoom = $('#cardZoom');
    if (zoom) zoom.addEventListener('click', function () {
      state.card.zoom = !state.card.zoom;
      renderCardModal();
      var figure = $('#cardFigure');
      if (figure && state.card.zoom) figure.scrollTop = 0;
    });
    var figure = $('#cardFigure');
    if (figure) figure.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'cardImage') {
        state.card.zoom = !state.card.zoom;
        renderCardModal();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeCardModal();
    });
  }

  /* 새 매장·수정 폼에서 고른 물건카드 */
  function clearFormCard() {
    state.formCard = null;
    var name = $('#fCardName');
    if (name) name.textContent = '선택 안 함';
    var preview = $('#fCardPreview');
    if (preview) preview.hidden = true;
    var img = $('#fCardImage');
    if (img) img.removeAttribute('src');
    var input = $('#fCardFile');
    if (input) input.value = '';
  }

  function initFormCard() {
    var pick = $('#fCardPick');
    var input = $('#fCardFile');
    if (pick && input) {
      pick.addEventListener('click', function () { input.value = ''; input.click(); });
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) return;
        imageFileToDataUrl(f, CARD_MAX_SIDE).then(function (img) {
          state.formCard = img;
          var name = $('#fCardName');
          if (name) name.textContent = (img.name || '이미지') + ' · ' + img.width + '×' + img.height + 'px · 저장 시 업로드';
          var preview = $('#fCardPreview');
          var el = $('#fCardImage');
          if (el) el.src = img.dataUrl;
          if (preview) preview.hidden = false;
        }).catch(function (err) {
          clearFormCard();
          var e = $('#storeError');
          if (e) { e.textContent = String((err && err.message) || err); e.hidden = false; }
        });
      });
    }
    var clear = $('#fCardClear');
    if (clear) clear.addEventListener('click', clearFormCard);
  }

  /* ---------------- 물건카드 연동 설정 (알림 설정 탭) ---------------- */
  function loadCardSettings() {
    var cfg = cardConfig();
    var endpoint = $('#cardEndpoint');
    var secret = $('#cardSecret');
    if (endpoint) endpoint.value = cfg.endpoint;
    if (secret) secret.value = cfg.secret;
    var raw = $('#cardOpenRaw');
    if (raw) raw.href = cardFetchUrl('ping', '') || '#';
    var status = $('#cardStatus');
    if (status) {
      status.textContent = cfg.stored ? '저장됨' : '기본값';
      status.className = 'status-badge ' + (cfg.stored ? 'live' : 'sample');
    }
  }

  function initCardSettings() {
    loadCardSettings();
    var form = $('#cardForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var endpoint = val('#cardEndpoint');
      var secret = val('#cardSecret');
      var err = $('#cardFormError');
      var res = $('#cardFormResult');
      if (err) err.hidden = true;
      if (res) { res.hidden = true; res.textContent = ''; }
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_\-]+\/exec$/.test(endpoint)) {
        if (err) { err.textContent = 'Apps Script 웹 앱 주소(https://script.google.com/macros/s/.../exec)를 넣어 주세요.'; err.hidden = false; }
        return;
      }
      if (!secret) {
        if (err) { err.textContent = '물건카드 연동 키를 입력해 주세요. 기본값은 apcard-2026 입니다.'; err.hidden = false; }
        return;
      }
      saveCardConfig(endpoint, secret);
      state.cards = {};
      loadCardSettings();
      toast('물건카드 연동 설정을 저장했습니다.');
    });

    var test = $('#cardTest');
    if (test) test.addEventListener('click', function () {
      var res = $('#cardFormResult');
      var err = $('#cardFormError');
      if (err) err.hidden = true;
      if (res) { res.hidden = false; res.textContent = '연결을 확인하는 중…'; }
      if (!cardConfig().endpoint) {
        if (res) res.textContent = '웹훅 주소가 비어 있습니다.';
        return;
      }
      cardGet('ping', '').then(function (b) {
        b = b || {};
        if (b.ok) {
          if (res) res.textContent = '연결됨 · 물건카드 서비스가 응답했습니다' + (b.folderAccessible ? ' · 드라이브 폴더 접근 가능' : ' · 다만 드라이브 폴더에 접근하지 못했습니다(폴더 ID 확인 필요)');
          var status = $('#cardStatus');
          if (status) { status.textContent = b.folderAccessible ? '연결됨' : '폴더 확인 필요'; status.className = 'status-badge ' + (b.folderAccessible ? 'live' : 'closed'); }
        } else if (b.reason === 'unknown_action') {
          if (res) res.textContent = '웹훅은 응답하지만 물건카드 기능(doGet)이 아직 배포되지 않았습니다. Apps Script에 [2] 블록을 붙이고 새 버전으로 배포해 주세요.';
        } else if (b.reason === 'no_doget' || b.reason === 'auth') {
          if (res) res.textContent = cardReasonText(b) + ' (지금 응답: ' + b.reason + ')';
        } else if (b.reason === 'network') {
          if (res) res.textContent = '응답을 읽지 못했습니다. 위 [응답 미리 보기 ↗]를 누르면 브라우저 새 창에서 실제 응답을 볼 수 있습니다.';
        } else {
          if (res) res.textContent = '연결하지 못했습니다 (' + (b.reason || '알 수 없음') + '). 주소·배포 액세스 권한(모든 사용자)을 확인해 주세요.';
        }
      });
    });

    var reset = $('#cardReset');
    if (reset) reset.addEventListener('click', function () {
      removeStore(CARD_CONFIG_KEY);
      state.cards = {};
      loadCardSettings();
      toast('물건카드 연동 설정을 기본값으로 되돌렸습니다.');
    });
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
      + '· 관심 점포: [AP-005] 우지커피 · 서울 서초구 주거상권\n'
      + '  (https://apchangup.com/?id=AP-005)\n'
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
    state.deepCode = parseDeepCode();
    initLogin();
    initTabs();
    initForm();
    initBulk();
    initStoreFilters();
    initLeadFilters();
    initSellActions();
    initTelegram();
    initCardModal();
    initFormCard();
    initCardSettings();
    initPwModal();
    initAccountsPanel();
    renderAccounts();
    if (isAuthed()) enterApp();
    else restoreRemember().then(function (restored) {
      if (restored) {
        enterApp();
        toast('저장된 로그인으로 관리자 화면을 열었습니다.');
      } else {
        showLogin();
      }
    });
  });
})();
