# AP PARTNERS · 에이피파트너 — 홍보 사이트 + 관리자 페이지

프랜차이즈 양도양수 홍보 사이트의 정적 사이트입니다. 등록 점포 3곳은 실제 현장 실사를 마친 매장입니다.
빌드 도구 없이 `index.html` 하나로 열리며, GitHub Pages · Vercel 같은 정적 호스팅에 그대로 올릴 수 있습니다.

## 파일 구조

```
site/
├─ index.html                 화면 구조 (히어로 · AI 컨시어지 · 점포 목록 · 절차·실사 가이드 · 상담)
├─ admin.html                 관리자 화면 (로그인 · 점포 관리 · 손님 DB · 양도 의뢰 · 알림 설정)
├─ styles.css                 디자인 (딥네이비 #0F1E36 · 골드 #C8A45D · 화이트/라이트그레이)
├─ app.js                     필터 · 상세 모달 · AI 매칭 · 4항목 게이트 · 비교 · 양도 의뢰
├─ admin.js                   관리자 로그인 · 점포 CRUD · DB 목록 · CSV · 텔레그램 설정
├─ assets/business-card.jpg   명함 이미지 (상담 섹션)
└─ data/
   └─ listings.json         등록 점포 데이터 3곳 (관리자에서 저장하면 브라우저 목록이 우선)
```

## 로컬에서 확인하기

```bash
cd site
python3 -m http.server 8000
# 사이트   http://localhost:8000
# 관리자   http://localhost:8000/admin.html
```

> `index.html`을 파일로 직접 열어도 화면은 보이지만, 브라우저 보안 정책 때문에 JSON을 읽지 못해
> `app.js` 안의 예비 데이터가 표시됩니다. 서버로 열거나 배포하면 항상 JSON을 읽습니다.

## 2단계 손님 DB 흐름

| 단계 | 내용 |
| --- | --- |
| **1단계 · 무료** | 상단 검색·필터, 점포 카드 목록, 카드의 초기 인수 비용·월 매출·예상 순수익은 연락처 없이 열람 |
| **2단계 · 4항목** | ① 희망 업종/브랜드(칩+직접 입력) ② 희망 지역(칩) ③ 가용 예산(칩) ④ 연락처(휴대폰 + 동의) 입력 후 잠금 해제 |

게이트가 열리는 지점은 두 곳입니다.

1. AI 컨시어지의 **`AI 맞춤 매칭 결과 확인`** — 결과 카드는 지역·업종만 보이는 잠금 미리보기로 보이고, 4항목 입력 후 매칭 이유와 상세 요약이 열립니다.
2. 점포 상세 모달의 **`상세 지출·비공개 매물 더 보기`** — 항목별 지출(재료비 % · 인건비·고정비·기타잡비 금액), 확인 포인트, 같은 상권 비공개 매물이 열립니다.

한 번 입력하면 `localStorage`(기기에 저장)와 `sessionStorage`(탭 세션)에 남아 다시 묻지 않습니다.
목록 위 **`4항목 입력 완료 · 잠금 해제됨`** 줄에서 저장된 페이로드를 보거나 `다시 입력`으로 초기화할 수 있습니다.

### 저장되는 JSON 페이로드

```json
{
  "form_version": "lead-gate-v1",
  "lead_id": "LEAD-20261125-1234",
  "submitted_at": "2026-11-24T19:50:00.288Z",
  "source": "detail | matching | compare",
  "store": { "id": "ap-sample-01", "area": "서울 마포구", "brand": "커피 프랜차이즈" },
  "stores": [{ "id": "ap-sample-01", "area": "서울 마포구", "brand": "커피 프랜차이즈", "initial_cost": "2억 1,000만 원" }],
  "criteria": {
    "category": ["카페"],
    "brand_text": "메가커피",
    "area": ["서울"],
    "budget": "2억대"
  },
  "contact": { "phone": "010-1234-5678", "phone_digits": "01012345678", "consent": true, "consent_at": "..." },
  "page": "https://..."
}
```

### 바로 전송으로 바꾸기

`app.js` 상단의 한 줄만 채우면 저장과 동시에 전송합니다.

```js
var LEAD_ENDPOINT = '';   // 예: https://script.google.com/macros/s/xxxx/exec
```

* `Content-Type: text/plain`으로 JSON을 POST하므로 Google Apps Script(`doPost`)·Formspree·자체 웹훅 모두 그대로 받습니다.
* 전송 전에는 브라우저 저장 + `apPartnerLeadQueue` 대기열에 쌓입니다(최근 50건).

## 운영 계획으로 묻기 (오토 · 직접 운영)

점포 카드·비교표·관리자 화면에는 운영 방식을 표시하지 않습니다. 대신 손님이 컨시어지에
`풀오토 추천`, `오토로 돌릴 만한 카페`, `직접 운영할 매장`처럼 물으면,
매출 규모 · 인건비 비중 · 매장 규모/특징을 보고 그 계획이 통할 점포를 골라
추천 사유(예: "매출 규모와 인건비 여력이 있어 매니저 체제 검토에 적합")와 함께 보여줍니다.

## 관심 점포 비교 담기 (최대 3곳)

* 점포 카드 오른쪽 **`비교 담기`** → 하단 비교 바에 담깁니다(최대 3곳, 4번째는 안내 후 막힘).
* **`나란히 비교`** 모달에서 초기 인수 비용 · 월 평균 매출 · 예상 순수익 · 상권·위치 · 매장 규모 · 확인할 점을 나란히 봅니다. 비용 최저·수익 최고 항목에는 표시가 붙습니다.
* **`선택한 점포 한 번에 상담 신청`** → 4항목 게이트로 이어지고, 접수 후 선택한 점포 목록과 함께 상담 접수 화면이 열립니다. `source: "compare"`로 손님 DB에 저장됩니다.

## 내 매장 양도 의뢰

* 헤더(데스크톱) · 상담 섹션 · 모바일 하단 바의 **`내 매장 양도 의뢰`** 버튼 → 접수 모달.
* 입력: 브랜드/업종, 지역, 월 평균 매출(만 원), 희망 권리금(만 원), 연락처 + 수집·이용 동의.
* 접수번호와 함께 `apPartnerSellRequests`에 저장되고, 관리자 **양도 의뢰** 탭에서 조회·CSV 다운로드할 수 있습니다.

## 관리자 페이지 (`admin.html`)

* **로그인**: 시안용 비밀번호 `ap2026` (화면에도 안내 표시). `sessionStorage`에 유지되며 로그아웃으로 해제합니다.
  **실제 오픈 전 반드시 서버 인증으로 교체하세요.**
* **점포 관리**: 새 점포 등록(지역·업종·브랜드·**매장 규모(층수·평수)**·매출·예치금·권리금·**예상 월 수익 평균치**·지출(재료비 %·인건비·매장 고정비·기타잡비 만 원, 각 **평균치 한 칸**)·**특징·한줄평**·확인 포인트·공개 범위), 수정, 거래완료(비노출) 토글, 삭제.
  매장 규모는 `층수`와 `평수` 두 칸에 나눠 넣으면 `1층 · 13평` 형태로 저장되어 카드·상세·비교표에 표시됩니다.
  `특징·한줄평`은 영업시간·주차·상권 특이사항을 자유롭게 적는 한 줄 칸이며, 매장 규모 뒤에 이어서 표시됩니다.
  지출 항목의 `매장 고정비`에는 (임대료·점포 사용료), `기타잡비`에는 (공과금·일반관리비 등)을 보조 설명으로 붙여, 공개 사이트에는 순화된 이름(`매장 고정비`, `기타잡비(공과금·일반관리비 등)`)으로만 나갑니다.
  최소·최대를 따로 적지 않고 항목마다 **평균치 하나만** 넣으면 되고, 입력하는 즉시 옆에 환산값(`약 1,088만 원`, `매출의 16.3%`)이 표시됩니다.
  저장하면 `apPartnerCatalog`에 기록되고 `index.html`이 이 목록을 우선 사용하므로 사이트에 즉시 반영됩니다.
  예상 수익은 `월 약 1,250만 원`처럼 평균임을 드러내는 표기로 저장됩니다.
  매출 범위(최소·최대) 입력칸은 없앴습니다. 예전 데이터에 매출 범위가 남아 있으면 사이트에는 그대로 `3,000~3,400만 원 범위`로 표시됩니다.
* **엑셀(CSV) 일괄 등록**: 점포 관리 탭의 **`샘플 양식(CSV) 다운로드`**로 UTF-8 BOM 양식(예시 2행)을 받아 채운 뒤,
  **`CSV 일괄 등록`** 영역에 끌어다 놓거나 파일을 고르면 업로드 전에 **행별 유효/오류 미리보기**가 열립니다.
  **`일괄 등록하기`**를 누르면 `apPartnerCatalog`에 한 번에 추가되어 사이트 목록에 바로 반영됩니다.
  - 열(15개): `지역` · `업종` · `브랜드` · `층수` · `평수(평)` · `점포예치금(만원)` · `권리금(만원)` · `월평균매출(만원)` · `예상수익(만원)` · `재료비비율(%)` · `인건비(만원)` · `고정비(만원)` · `기타잡비(만원)` · `특징한줄평` · `비공개전용(Y/N)`
  - `층수`는 `1층`·`지하 1층`처럼, `평수(평)`은 `13`처럼 숫자로 적으면 `1층 · 13평`으로 합쳐집니다. 두 칸 모두 비워도 되고, 예전 양식의 13열(`유형/브랜드`·`한줄특징` 등)도 그대로 읽힙니다.
  - `지역`은 `서울 마포구`처럼 지역과 지역구를 함께 적습니다(서울·경기·인천 외 지역은 `기타`로 분류).
  - UTF-8(권장)과 EUC-KR을 모두 읽고, 따옴표·쉼표·줄바꿈이 든 칸도 처리합니다. 한 번에 300행 · 5MB까지.
  - 예전 양식의 `운영방식` 열이 남아 있어도 무시하고 안내만 표시합니다(점포 데이터에 운영 방식을 저장하지 않습니다).
  - 재료비는 매출 대비 비율(%), 인건비·매장 고정비·기타잡비는 만 원 금액으로 **평균치 하나**를 적습니다. 예전 양식처럼 `480~560` 범위로 적거나 `예상수익최소`·`예상수익최대` 두 열로 나눠 적어도 두 값의 **평균**으로 등록되고, 미리보기에 환산 결과가 표시됩니다.
    예전 양식의 `인건비비율(%)`·`고정비비율(%)`·`기타비율(%)` 열은 값이 비율로 읽혀 월 매출 기준 금액으로 환산됩니다.
* **손님 DB**: 4항목 게이트로 들어온 DB 목록, 신규/상담완료 상태 변경, 엑셀용 CSV(UTF-8 BOM) 다운로드.
* **양도 의뢰**: 점주 의뢰 목록, CSV 다운로드.
* **알림 설정**: 텔레그램 Bot Token · Chat ID · 알림 대상(전체/손님 DB/양도 의뢰) 저장, 테스트 전송, 알림 문구 미리보기.

### 브라우저 저장 키

| 키 | 내용 |
| --- | --- |
| `apPartnerLead` | 마지막 4항목 입력값(잠금 해제용) |
| `apPartnerLeadSession` | 같은 세션용 사본 |
| `apPartnerLeads` | 손님 DB 전체 목록 (관리자 화면) |
| `apPartnerLeadStatus` | 손님 DB 상태(신규/상담완료) |
| `apPartnerLeadQueue` | 전송 대기열 |
| `apPartnerSellRequests` | 양도 의뢰 목록 |
| `apPartnerCompare` | 비교 담은 점포(세션) |
| `apPartnerCatalog` | 관리자가 저장한 점포 목록 |
| `apTelegramConfig` | 텔레그램 Bot Token · Chat ID 설정 |

## 텔레그램 알림 연결 (배포 시)

1. BotFather에서 봇 생성 → `/start` 후 `getUpdates`로 chat id 확인.
2. 관리자 **알림 설정**에 Bot Token · Chat ID 저장 (시안에서는 브라우저에 저장).
3. 실제 오픈 시에는 토큰을 브라우저에 두지 말고, `LEAD_ENDPOINT` 웹훅(Google Apps Script · Vercel 함수)에서 보관하며 접수 JSON을 받아 `sendMessage`를 호출하세요.

```js
// Apps Script 예시 (웹훅 doPost)
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var text = '[에이피파트너] 새 손님 DB\n' +
    '· 업종·브랜드: ' + (d.criteria.category || []).join(', ') + ' ' + (d.criteria.brand_text || '') + '\n' +
    '· 지역·예산: ' + (d.criteria.area || []).join(', ') + ' / ' + d.criteria.budget + '\n' +
    '· 연락처: ' + d.contact.phone;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ chat_id: CHAT_ID, text: text })
  });
  return ContentService.createTextOutput('ok');
}
```

## 배포

- **GitHub Pages**: 저장소에 `site/` 폴더를 올리고 Settings → Pages → Branch `main`, 폴더 `/site` 선택
- **Vercel**: 저장소 연결 후 Root Directory를 `site`로 지정 (프레임워크: Other, 빌드 명령 없음)

## 검색엔진 최적화 (2026-11-25 추가)

- **사이트**: `https://hyunyul89-design.github.io/ap-partners/` (저장소 `hyunyul89-design/ap-partners`, 커밋 `bd8a188`·`f11bc44`)
- `robots.txt`: 전체 허용, `/admin.html`만 차단, 사이트맵 위치 안내
- `sitemap.xml`: 사이트 루트 URL 1개
- `index.html` head: `canonical`, `description`, `og:*`(title·description·url·image·type·site_name·locale), `twitter:card`, `naver-site-verification` 메타태그
- `assets/og-cover.png`: 공유 미리보기용 1200×630 이미지. `tools/make_og_cover.py`로 다시 만들 수 있음(Noto Sans/Serif KR, 네이비·골드)
- **루트 저장소** `hyunyul89-design/hyunyul89-design.github.io`: 네이버 서치어드바이저가 호스트 단위로만 사이트를 받기 때문에 만든 저장소. `index.html`은 `/ap-partners/`로 넘기는 안내 페이지이고, 루트 `robots.txt`와 네이버 확인 파일(`naver157fc89ea794a6ebeab98219ec2df593.html`)이 함께 있다. 확인 파일을 지우면 네이버 소유확인이 풀리므로 삭제하지 말 것.
- **네이버 서치어드바이저**(`hyunyul89` 계정): 사이트 `https://hyunyul89-design.github.io` 등록·소유확인 완료, 사이트맵 `ap-partners/sitemap.xml` 제출, `/ap-partners/` 수집 요청, robots.txt 수집·검증 완료
- 도메인을 새로 붙이면 서치어드바이저에 그 도메인을 사이트로 다시 등록하고 소유확인해야 한다.

## 실제 오픈 전에 확인할 것

1. ~~`listings.sample.json`을 실제 점포로 교체~~ → 완료: `listings.json`에 실사 점포 3곳 반영, `SAMPLE` 배지·샘플 안내 문구 제거
2. 관리자 비밀번호(`ap2026`)를 서버 인증으로 교체하고, `admin.html`을 검색엔진에서 막기 (`noindex` 유지)
3. 손님 DB·양도 의뢰 접수를 Formspree · Google Apps Script · 서버 API로 실제 전송 (현재는 브라우저 저장)
4. 개인정보 수집·이용 동의 문구를 실제 수집 항목·보관 기간에 맞춰 법률 검토 후 확정하기
5. 텔레그램 Bot Token은 서버 쪽에 보관하고, 브라우저 저장 설정은 배포 전 제거하기
6. 수익·매출 수치는 점주 제시 자료 기준임을 계속 표시하기 (표시 없이 단정하지 않기)
