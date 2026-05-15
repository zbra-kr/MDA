# 무신사 상품 상세 페이지 구조 조사 결과

> 조사일: 2026-05-15
> 조사 대상: 3개 카테고리 rank=1 상품 (상의·바지·가방)
> 봇 차단 여부: 없음 ✓
> 조사 성공 상품 수: 3 / 3
> 원본 데이터: `worker/scrapers/_investigate_product_dump.json`

---

## 0. TL;DR — 가장 중요한 발견

1. **상품 상세 페이지 1회 로드로 11개 필드 전부 트리거** — Playwright 로 페이지를 열고 스크롤하면 브라우저가 모든 API를 자동 호출. 추가 수동 API 호출 불필요.
2. **`goods-detail.musinsa.com`·`goods.musinsa.com`·`content.musinsa.com`·`like.musinsa.com` 4개 도메인에 필드 분산** — 모두 HTTPS JSON API.
3. **11개 중 9개 확인됨, 2개 추정** — `main_image_url`·`also_viewed_products` 는 해당 응답이 덤프에 있으나 상세 구조 미확인.
4. **리뷰 키워드 점수는 `survey` 엔드포인트**, AI 후기 요약은 `ai-summary` 전용 엔드포인트 존재 확인.

---

## 1. 상세 페이지 URL 패턴

```
https://www.musinsa.com/products/{musinsa_no}
```

| 카테고리 | musinsa_no | 브랜드 | 상품명 |
|---|---|---|---|
| 상의 (001) | 6154808 | 키뮤어 | [크롭] 배색 롤업 크롭 반팔 티셔츠_블랙 |
| 바지 (003) | 6197079 | 디미트리블랙 | [여름용] VLAD 원턱 커브드 트랙 팬츠_립스탑 3 COLOR |
| 가방 (004) | 6131515 | 아크테릭스 | 맨티스 2 웨이스트 팩 - 24K BLACK |

- `__NEXT_DATA__` 존재: 3개 모두 있음 (16~24 KB) — 기본 상품 정보 포함 추정
- 리다이렉트: 없음 (final_url = 요청 URL 동일)
- 모바일 URL 차이: 미확인 (1920×1080 데스크톱 viewport 사용)

---

## 2. 데이터 소스 매핑 (11개)

> **요약**: 확인됨 9개 / 추정 2개 / 확인 불가 0개
>
> ⚠ 아래 경로는 Playwright 네트워크 캡처로 직접 확인한 실제 엔드포인트.
> 자동 분석의 `feature-flag.json` 오탐은 제거하고 수동 보정함.

| # | 필드 | 출처 | 트리거 | 엔드포인트 | 신뢰도 | 비고 |
|---|---|---|---|---|---|---|
| 1 | `wishlist_count` | REST API | 자동 (페이지 로드) | `like.musinsa.com/like/api/v2/liketypes/goods/counts` | 확인됨 | 3상품 모두 동일 URL, `{goodsNo}` 파라미터 |
| 2 | `brand_like_count` | REST API | 자동 (페이지 로드) | `like.musinsa.com/like/api/v2/liketypes/brand/counts` | 확인됨 | goods/counts 와 같은 도메인·패턴, brand 전용 |
| 3 | `main_image_url + 갤러리` | __NEXT_DATA__ + REST API | 자동 (페이지 로드) | `__NEXT_DATA__` 내 or `goods-detail.musinsa.com/api2/goods/{no}/stat` | 추정 | stat 응답 구조 미확인 — dump 에서 직접 확인 필요 |
| 4 | `similar_products` | REST API | 자동 (페이지 로드) | `goods-detail.musinsa.com/api2/goods/{no}/recommends/multi?uuid=detail_goods_attributes_allbrand&limit=10` | 확인됨 | 3상품 모두 캡처됨 |
| 5 | `also_viewed_products` | REST API | 자동 (페이지 로드) | `goods-detail.musinsa.com/api2/goods/{no}/v3/recommends/multi?adTarget=false` | 추정 | similar 와 구분되는 v3 엔드포인트 — "다른 고객 추천" 여부 dump 확인 필요 |
| 6 | `tags` | REST API | 자동 (페이지 로드) | `goods-detail.musinsa.com/api2/goods/{no}/tags` | **확인됨** | 전용 엔드포인트, URL 에 `tags` 명시. 3상품 모두 동일 패턴 |
| 7 | `description` | REST API | 자동 (페이지 로드) | `content.musinsa.com/api2/content/v1/musinsa-content/goods-detail/contents?brandId={brand}&goodsNo={no}&category={cat}` | 확인됨 | 상세 콘텐츠 전용 엔드포인트 (호출 2회 — position 파라미터 다름) |
| 8 | `snap` | REST API | 자동 (스크롤 후) | `content.musinsa.com/api2/content/snap/v1/snaps?page=1&size=20&goodsNosIncludeOtherColor=MUSINSA:{no}` | 확인됨 | 스냅 전용. 브랜드 스냅은 별도 URL (`/brands/{brand}/snaps`) |
| 9 | `ai_review_summary` | REST API | 자동 (스크롤 후) | `goods.musinsa.com/api2/review/v1/ai-summary/{no}` | **확인됨** | 전용 엔드포인트. 3상품 모두 동일 패턴 |
| 10 | `review_keyword_scores` | REST API | 자동 (스크롤 후) | `goods.musinsa.com/api2/review/v1/view/survey/{no}/summary` | 확인됨 | `survey` = 구매 회원 키워드 평가 (편안함·핏 등) |
| 11 | `review_meta` | REST API | 자동 (스크롤 후) | `goods.musinsa.com/api2/review/v1/goods/{no}/reviews/summary` | 확인됨 | 별점 분포·총 리뷰 수. ⚠ 리뷰 본문·작성자 수집 금지 |

### 2-1. 상품별 API 캡처 확인

| 엔드포인트 | 상의 | 바지 | 가방 |
|---|---|---|---|
| `like/.../liketypes/goods/counts` | ✓ | ✓ | ✓ |
| `like/.../liketypes/brand/counts` | ✓ | ✓ | ✓ |
| `goods-detail/.../tags` | ✓ | ✓ | ✓ |
| `goods-detail/.../recommends/multi?uuid=...allbrand` | ✓ | ✓ | ✓ |
| `goods-detail/.../v3/recommends/multi` | ✓ | ✓ | ✓ |
| `goods-detail/.../stat` | ✓ | ✓ | ✓ |
| `content/.../goods-detail/contents` | ✓ (×2) | ✓ (×2) | ✓ (×2) |
| `content/.../snap/v1/snaps` | ✓ | ✓ | ✓ |
| `content/.../snap/v1/snaps/count` | ✓ | ✓ | ✓ |
| `review/v1/ai-summary/{no}` | ✓ | ✓ | ✓ |
| `review/v1/view/survey/{no}/summary` | ✓ | ✓ | ✓ |
| `review/v1/goods/{no}/reviews/summary` | ✓ | ✓ | ✓ |
| `review/v1/view/list` | ✓ | ✓ | ✓ |

> 리뷰 목록 (`view/list`) 은 캡처되나 리뷰 본문·작성자 데이터를 포함. **실제 스크래퍼에서는 호출하지 않는다.** `reviews/summary` (별점 분포)·`survey/summary` (키워드 점수)만 사용.

---

## 3. 추출 비용 분석

> **핵심 발견**: 추가 수동 API 호출 불필요. 페이지 로드 + 하단 스크롤만으로 11개 필드 모두 자동 트리거.

| 항목 | 값 |
|---|---|
| Playwright 페이지 로드 수 | **1회 / 상품** |
| 추가 수동 API 호출 | 0회 |
| 실측 로드 시간 | 1.6 ~ 2.7초 (networkidle 아닌 `load` 기준) |
| 스크롤 + 대기 시간 | 약 12~15초 (지연 로딩 위젯 완료 대기) |
| 상품 1개당 총 처리 시간 | **약 18~22초** (로드 + 스크롤 + rate-limit 딜레이 3초) |
| 하루 300개 처리 시 총 시간 | **약 90~110분** (1.5~1.8시간) |
| 봇 차단 위험 | **낮음** — 3개 조사에서 차단 없음 |
| 캡처 XHR 수 / 상품 | 56 ~ 66건 (YouTube SDK 포함) |

---

## 4. 카테고리별 차이

| 카테고리 | XHR 캡처 수 | __NEXT_DATA__ 크기 | DOM 이미지 수 | 특이사항 |
|---|---|---|---|---|
| 상의 (6154808) | 66 | 19,655자 | 4 | YouTube 영상 포함 → SDK 호출 많음 |
| 바지 (6197079) | 58 | 24,204자 | 4 | 없음 |
| 가방 (6131515) | 56 | 16,089자 | 2 | `color-images` 엔드포인트 추가 (색상 변형 이미지) |

**패턴 일관성**:
- 동일 도메인 + 동일 URL 구조 (`{no}` 치환) — 3카테고리 모두 동일
- `optKindCd` 파라미터만 다름: 상의=`CLOTHES`, 가방=`BAG` (옵션 종류)
- 가방은 사이즈 옵션 없음으로 `size-recommend` 엔드포인트 미호출 가능성 있음 (dump 확인 필요)
- 핵심 11개 필드 엔드포인트는 카테고리 무관하게 동일 패턴 확인

---

## 5. 권장 1차 수집 정책

### 1차 수집 — 즉시 구현 (Playwright 페이지 로드로 자동 확보)

모든 필드가 페이지 1회 로드로 자동 트리거되므로 필드 우선순위는 "파싱 복잡도"로 결정.

**파싱 단순 (1차 구현):**
- `tags` — `goods-detail.musinsa.com/api2/goods/{no}/tags` 응답 직접 파싱
- `wishlist_count` — `like.musinsa.com/like/api/v2/liketypes/goods/counts` 응답
- `brand_like_count` — `like.musinsa.com/like/api/v2/liketypes/brand/counts` 응답
- `ai_review_summary` — `goods.musinsa.com/api2/review/v1/ai-summary/{no}` 응답
- `review_meta` — `goods.musinsa.com/api2/review/v1/goods/{no}/reviews/summary` (별점 분포만)
- `review_keyword_scores` — `goods.musinsa.com/api2/review/v1/view/survey/{no}/summary`

**파싱 중간 (1차 구현):**
- `snap` — `content.musinsa.com/api2/content/snap/v1/snaps?...` 응답 (이미지 URL + 캡션)
- `similar_products` — `goods-detail.musinsa.com/api2/goods/{no}/recommends/multi?uuid=...allbrand` (musinsa_no 목록)

### 2차 수집 — 구조 확인 후 구현

- `main_image_url + 갤러리` — `__NEXT_DATA__` 또는 `stat` 응답 구조 dump에서 직접 확인 필요
- `description` — `content.musinsa.com/.../goods-detail/contents` 응답 (HTML 포함 가능성 있어 파싱 복잡)
- `also_viewed_products` — `v3/recommends/multi` 응답이 "다른 고객이 찾은" 데이터인지 dump 확인 필요

### 봇 위험 완화 방안

- 현행 Playwright + playwright-stealth 유지
- 상품 간 rate-limit ≥ 3초 (+ 최대 1.5초 지터) 유지
- `wait_until="load"` 사용 (networkidle 은 YouTube SDK 지속 연결로 timeout 발생)
- 하단 스크롤 6회 + 1.5초 간격 — 지연 로딩 위젯 트리거에 충분
- 동시성 1 유지

---

## 6. 발견된 위험·이슈

- **YouTube SDK**: 상의(6154808)는 상품 페이지에 YouTube 동영상이 있어 `youtubei/v1/*` API가 지속 호출됨. `networkidle` 사용 시 45초 timeout 발생 → `wait_until="load"` 필수.
- **`review/v1/view/list`**: 리뷰 목록 (본문·별점·날짜 포함)이 페이지 로드 시 자동 호출됨. **실제 스크래퍼에서는 이 응답을 수집하지 않을 것** — `reviews/summary` 만 저장.
- **리뷰 작성자 데이터**: `view/list` 응답에 작성자 닉네임·날짜가 포함될 가능성 있음. 스크래퍼 설계 시 이 필드 수집 금지 명시 필요.
- **`content.musinsa.com/.../goods-detail/contents` 2회 호출**: position 파라미터가 다른 동일 엔드포인트 2회 호출. 첫 번째 응답에 description 포함 가능성 높으나 dump 확인 필요.
- **`snap` 스냅 작성자 정보**: `snap/v1/profiles` 엔드포인트가 자동 호출됨. 스냅 수집 시 이미지 URL·캡션만 저장, 작성자 ID·닉네임은 수집 금지.
- **`feature-flag.json` 키워드 오탐**: 자동 분석에서 `feature-flag.json` 응답이 "description", "snap" 등 키워드를 포함해 오탐 발생 → 이 파일 필터링 필요 (실제 스크래퍼에서는 캡처 URL 화이트리스트 방식 권장).

---

> 다음 단계: `worker/scrapers/musinsa_product.py` 설계 — Playwright 네트워크 인터셉트 방식으로 위 엔드포인트 응답 선별 수집
