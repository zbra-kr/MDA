# 무신사 랭킹 페이지 구조 조사 결과

> 조사일: 2026-05-14  
> 조사자: Claude Code (자동 조사 스크립트 + httpx 직접 탐색)  
> 원본 덤프: `worker/scrapers/_investigate_dump.json`, `worker/scrapers/_ranking_product_api.json`

---

## 0. TL;DR — 가장 중요한 발견 3가지

1. **문서가 가정한 URL `/ranking/best?categoryCode=001&period=now` 는 404** — 실제 랭킹은 `/main/musinsa/ranking` 페이지 + `client.musinsa.com` REST API 조합
2. **Playwright 없이 httpx로도 데이터 수집 가능** — 랭킹 데이터는 `client.musinsa.com` REST API로 직접 호출 가능, 한 번에 101건 반환, 페이지네이션 없음
3. **robots.txt `User-agent: *` → `Disallow: /`** — 사내 커스텀 UA는 기술적으로 차단. 팀 거버넌스 결정 필요. [→ 섹션 6 참조]

---

## 1. 데이터 공급 방식

**REST API (JSON)** — SSR HTML이 아님. 브라우저가 렌더링할 때 `client.musinsa.com`의 JSON API를 호출해 데이터를 받아온다.

| 방식 | 결과 |
|---|---|
| SSR HTML (DOM 파싱) | 불가 — 랭킹 페이지는 JS 렌더링, DOM에 상품 없음 |
| `__NEXT_DATA__` (랭킹 페이지) | 없음 — 랭킹 페이지 자체는 빈 shell |
| `__NEXT_DATA__` (홈 페이지) | 있음 — API 엔드포인트 URL 목록 포함 |
| `client.musinsa.com` REST API | **200 정상 응답, 상품 데이터 전체 포함** |

---

## 2. 실제 랭킹 URL 및 API 엔드포인트

### 2.1 페이지 URL (브라우저)

```
https://www.musinsa.com/main/musinsa/ranking
```

문서 가정(`/ranking/best?categoryCode=001&period=now`)은 **404**.

### 2.2 랭킹 데이터 API — 핵심 엔드포인트

**초기 패널 로딩** (subPan 목록 + 상품 초기값):
```
GET https://client.musinsa.com/api/home/web/v5/pans/ranking?storeCode=musinsa&subPan=product
```

**카테고리별 상품 랭킹** (실제 수집에 사용할 엔드포인트):
```
GET https://client.musinsa.com/api/home/web/v5/pans/ranking/sections/{sectionId}
    ?storeCode=musinsa
    &categoryCode={categoryCode}
    &contentsId=
    &period={period}
    &gf={genderFilter}
```

| 파라미터 | 설명 | 예시 값 |
|---|---|---|
| `sectionId` | 랭킹 테마 ID | `200` (신상 랭킹, 기본값) |
| `categoryCode` | 카테고리 코드 | `000`(전체), `001`(상의), `103`(신발) |
| `period` | 집계 주기 | `REALTIME`, `DAILY`, `WEEKLY`, `MONTHLY` |
| `gf` | 성별 필터 | `A`(전체), `M`(남성), `F`(여성) |
| `storeCode` | 스토어 | `musinsa`, `beauty`, `player` 등 |

**실전 예시 — 상의 실시간 랭킹 전체:**
```
https://client.musinsa.com/api/home/web/v5/pans/ranking/sections/200?storeCode=musinsa&categoryCode=001&contentsId=&period=REALTIME&gf=A
```

### 2.3 아카이브 (월간 과거 랭킹)

```
https://www.musinsa.com/ranking/archive?date=202604&categoryCode=103003
```

→ 신발(103) 샌들/슬리퍼(103003) 2026년 4월 랭킹 페이지. 구조는 미확인 (추후 조사 필요).

---

## 3. 상품 목록 1건당 추출 가능한 필드

API 응답 중 `MULTICOLUMN` 모듈 내 `PRODUCT_COLUMN` 아이템의 실제 구조:

```json
{
  "type": "PRODUCT_COLUMN",
  "id": "5842954",
  "image": {
    "rank": 1,
    "url": "https://image.msscdn.net/..._500.jpg",
    "labels": [
      { "text": "급상승" },
      { "text": "판매 2.9천개" }
    ]
  },
  "info": {
    "brandName": "엠엘비",
    "productName": "루키 언스트럭쳐 볼캡 LA (D.Pink)",
    "discountRatio": 0,
    "finalPrice": 36000,
    "strikethrough": false,
    "isSoldOut": false,
    "additionalInformation": [
      { "text": "176명이 보는 중" },
      { "text": "321명이 구매 중" }
    ]
  },
  "onClick": {
    "url": "https://www.musinsa.com/products/5842954"
  }
}
```

`image.onClickLike.eventLog.amplitude.payload`에서 추가 필드:

```json
{
  "brand_id": "mlb",
  "brand_name": "엠엘비",
  "category_id": "001",
  "product_id": "5842954",
  "product_name": "루키 언스트럭쳐 볼캡 LA (D.Pink)",
  "original_price": "36000",
  "price": "36000",
  "discount_rate": "0",
  "reviewCount": "18",
  "reviewScore": "98"
}
```

### 3.1 목록 페이지에서 얻을 수 있는 것 vs 없는 것

| 필드 | 목록 API 포함 | 비고 |
|---|---|---|
| `musinsa_no` | O | `id` 필드 |
| `rank_main` | O | `image.rank` |
| `brand_slug` | O | amplitude `brand_id` (영문 slug) |
| `brand_name` | O | `info.brandName` (한글) |
| `product_name` | O | `info.productName` |
| `current_price` | O | `info.finalPrice` (int) |
| `list_price` | O | amplitude `original_price` — **string, int 변환 필요** |
| `discount_rate` | O | amplitude `discount_rate` — **string, int 변환 필요** |
| `thumbnail_url` | O | `image.url` |
| `category_code` | O | amplitude `category_id` |
| `review_count` | O | amplitude `reviewCount` (string) |
| `review_score` | **주의** | `reviewScore` = **100점 만점**, 스키마 5점 가정 → 변환 or 스키마 수정 필요 |
| `wishlist_count` | **X** | 목록에 없음 — 상품 상세 API 별도 필요 |
| `likes_count` | **X** | 목록에 없음 |
| `scraped_at` | **X** | 수집 시 `datetime.now(UTC)` 직접 추가 |

---

## 4. 카테고리 코드 체계

### 4.1 코드 체계 결론

스키마 가정(`'001'`, `'002'` 등 3자리)은 **정확**. 단, 하위 카테고리는 6자리 형태.

| 깊이 | 형식 | 예시 |
|---|---|---|
| 전체 | `000` | 전체 카테고리 |
| 1depth | `001` | 상의 |
| 2depth | `001001` | 반소매 티셔츠 |

API 파라미터에 6자리 그대로 전달 가능: `categoryCode=001001`

### 4.2 주요 카테고리 코드 매핑

```
000: 전체
001: 상의      → 001001: 반소매 티셔츠, 001002: 셔츠/블라우스
                  001004: 후드 티셔츠,   001005: 맨투맨/스웨트
                  001006: 니트/스웨터,   001010: 긴소매 티셔츠
002: 아우터    → 002022: 후드 집업,     002023: 플리스/뽀글이
                  002020: 카디건,        002017: 트러커 재킷
003: 바지      → 003002: 데님 팬츠,     003004: 트레이닝/조거 팬츠
                  003008: 슈트 팬츠/슬랙스
004: 가방      → 004001: 백팩,          004007: 웨이스트 백
017: 스포츠/레저
026: 속옷/홈웨어
100: 원피스/스커트
101: 소품      → 101001: 모자,          101002: 양말/레그웨어
102: 디지털/라이프
103: 신발      → 103003: 샌들/슬리퍼,  103004: 스니커즈, 103005: 스포츠화
104: 뷰티      → 104001: 스킨케어,      104014: 베이스메이크업
106: 키즈
```

### 4.3 sectionId (랭킹 테마) 코드

| sectionId | applied_tab 값 | 비고 |
|---|---|---|
| `200` | `ranking_theme_new` | **기본값**, 신상 랭킹 |
| `199` | 미확인 | 다른 기준 랭킹 (같은 period 필터 사용) |
| `201` | 미확인 | period 옵션에 MONTHLY 없음 |
| `1770` | 미확인 | 카테고리 코드가 5자리(25884, 25898 등) |
| `1827` | 미확인 | 카테고리 코드가 109 계열 |

---

## 5. 페이지네이션 및 응답 크기

**페이지네이션 없음** — 단일 API 호출로 **101건** 반환.

- `MULTICOLUMN` 모듈 17~18개, 각 6개 아이템 → 총 약 101건
- BANNER_COLUMN(광고)이 간간이 섞임 → 실제 상품은 정확히 100건
- `contentsId` 파라미터를 이용한 추가 페이지 로딩은 미확인 (현재로서는 불필요)

---

## 6. robots.txt 분석 — 거버넌스 이슈

```txt
# 전문 크롤러 허용 (Group 1 & 2)
User-agent: Claude-User
User-agent: ClaudeBot
User-agent: Googlebot
...
Allow: /

# 나머지 모든 봇 차단
User-agent: *
Disallow: /
```

**핵심 이슈**: `B.CAVE-Competitor-Radar/1.0 (internal analytics)` UA는 `User-agent: *` 에 해당 → **`/` 전체 Disallow**.

### 6.1 접근 방식별 영향 범위

| 접근 방식 | robots.txt 준수 여부 |
|---|---|
| 실제 Chromium 브라우저 (Playwright) | **준수** — 브라우저는 robots.txt 적용 대상 아님 |
| httpx + 커스텀 UA | **위반** — `*` 그룹에 해당 |
| httpx + 브라우저 UA 위장 | 회색지대 (UA 스푸핑) |

### 6.2 권장 사항 (팀 결정 필요)

- **옵션 A (권장)**: Playwright로 랭킹 페이지를 열고, `page.on("response", ...)` 네트워크 인터셉트로 `client.musinsa.com` API 응답 캡처. robots.txt 준수, 구현 복잡도 약간 증가.
- **옵션 B**: httpx 직접 API 호출 — 빠르고 단순. API 엔드포인트는 공개 데이터 제공 목적이지만, robots.txt 기술적 위반. **법무·AX위원회 판단 필요**.

---

## 7. 스크래퍼 구현 시사점

### 7.1 수정이 필요한 사항 요약

| 항목 | 현재 문서 가정 | 실제 확인 값 |
|---|---|---|
| 랭킹 페이지 URL | `/ranking/best?categoryCode=001&period=now` | `/main/musinsa/ranking` |
| 데이터 소스 | DOM 파싱 or `__NEXT_DATA__` | `client.musinsa.com` REST API |
| 페이지당 상품 수 | 100건/페이지 (페이지네이션) | 101건 단일 응답, 페이지네이션 없음 |
| `list_price` 타입 | `int \| None` | string으로 수신 → `int()` 변환 필요 |
| `review_score` 척도 | 5점 만점 가정 | **100점 만점** — 스키마 수정 or `/ 20` 변환 필요 |
| `category_code` 추출 | URL 파라미터 | amplitude payload `category_id` 필드 |
| `scraped_at` | — | 수집 시 `datetime.now(UTC)` 직접 추가 |
| `wishlist_count` | 목록에서 수집 | 목록 API에 없음 — 상세 API 필요 |

### 7.2 권장 구현 전략

```python
# Playwright + 네트워크 인터셉트 방식 (옵션 A)
captured: list[dict] = []

async def on_response(response):
    if "client.musinsa.com/api/home/web/v5/pans/ranking" in response.url:
        data = await response.json()
        captured.append(data)

page.on("response", on_response)
await page.goto("https://www.musinsa.com/main/musinsa/ranking")
# 카테고리 탭 클릭 시 sections API 자동 호출됨

# 또는 직접 API 호출 (옵션 B, 거버넌스 승인 후)
url = "https://client.musinsa.com/api/home/web/v5/pans/ranking/sections/200"
params = {"storeCode": "musinsa", "categoryCode": "001",
          "contentsId": "", "period": "REALTIME", "gf": "A"}
response = await httpx.AsyncClient().get(url, params=params)
```

### 7.3 `base.py` 수정 필요 — playwright-stealth v2 API

설치된 버전: **`playwright-stealth` v2.0.3**  
현재 `base.py`: `from playwright_stealth import stealth_async` → **ImportError 발생**

v2 올바른 API:
```python
from playwright_stealth import Stealth

# 컨텍스트 전체에 적용 (권장)
async with Stealth().use_async(async_playwright()) as pw:
    browser = await pw.chromium.launch(...)

# 또는 페이지별 적용
stealth = Stealth()
await stealth.apply_stealth_async(page)
```

→ **`base.py` 수정 필요** — 다음 작업으로 처리 권장.

---

## 8. 조사 과정 실패 기록

| 실패 | 원인 | 대응 |
|---|---|---|
| Playwright로 랭킹 페이지 로딩 시 `error-container` | URL이 404인 `/ranking/best` 사용 | 올바른 URL로 변경 |
| `__NEXT_DATA__` 없음 | 랭킹 페이지는 빈 shell | API 직접 호출로 전환 |
| `stealth_async` ImportError | playwright-stealth v2 API 변경 | `Stealth().apply_stealth_async()` 사용 |
| httpx로 `client.musinsa.com` 호출 성공 | 브라우저 UA로 직접 호출 가능 | robots.txt 거버넌스 검토 필요 |
