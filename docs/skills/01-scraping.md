# Skill 01: Scraping (Playwright)

> 본 문서는 Claude Code / Cursor에 컨텍스트로 직접 전달하여 `worker/scrapers/` 코드를 작성할 때 사용한다.

## 1. 목적

무신사 웹페이지에서 6종의 데이터를 매일 수집하여 표준 dict 형태로 반환한다. DB 적재는 다음 모듈(02-ingestion)의 책임이므로 본 모듈은 **수집과 정규화까지만** 담당.

## 2. 디렉토리

```
worker/scrapers/
├── __init__.py
├── base.py              모든 스크래퍼의 공통 베이스
├── musinsa_ranking.py   카테고리 랭킹
├── musinsa_product.py   상품 상세
├── musinsa_review.py    리뷰 메타·코멘트 N개
├── musinsa_event.py     세일탭·타임딜·프리오더
└── musinsa_snap.py      코디·스냅샷
```

## 3. 기술 스택

```toml
# pyproject.toml 발췌
[project]
dependencies = [
  "playwright==1.49.*",
  "playwright-stealth==1.0.6",
  "pydantic>=2.6",
  "tenacity>=8.2",       # retry
  "loguru>=0.7",         # 로깅
  "structlog>=24.1",     # 구조화 로그
]
```

설치 후 1회: `playwright install chromium`

## 4. 베이스 스크래퍼 (`base.py`)

모든 스크래퍼는 `BaseScraper`를 상속한다.

### 4.1 책임
- Playwright Chromium headless launch
- stealth 적용 (`playwright-stealth`)
- User-Agent 명시
- rate limit (페이지당 최소 3초 + jitter)
- retry (tenacity, 지수 백오프)
- 응답 로깅 (URL, 소요시간, HTTP 상태)
- 컨텍스트 매니저 패턴 (`async with`)

### 4.2 인터페이스

```python
class BaseScraper(ABC):
    USER_AGENT = "B.CAVE-Competitor-Radar/1.0 (internal analytics)"
    MIN_DELAY_SEC = 3.0
    DELAY_JITTER = 1.5  # 3~4.5초 사이 랜덤
    TIMEOUT_MS = 30_000

    async def __aenter__(self) -> "BaseScraper": ...
    async def __aexit__(self, *exc) -> None: ...

    async def goto(self, url: str) -> Page:
        """rate limit + retry 포함된 page navigation"""

    async def scroll_to_bottom(self, max_scrolls: int = 20) -> None:
        """무한 스크롤 페이지 처리"""

    @abstractmethod
    async def scrape(self, *args, **kwargs) -> list[dict]:
        """서브클래스가 구현"""
```

### 4.3 거버넌스 강제 사항
- 동시 페이지 1개만 (`p.chromium.launch(args=["--single-process"])` 아님, 그냥 코드에서 직렬 처리)
- 모든 요청 후 `await asyncio.sleep(MIN_DELAY_SEC + random.random() * DELAY_JITTER)`
- 응답이 봇 차단 페이지(특정 키워드 감지) → 즉시 raise `BotBlockedError`, 워크플로우 정지

## 5. 각 스크래퍼 명세

### 5.1 `musinsa_ranking.py`

**입력**: 카테고리 코드(`"001"`), 페이지 범위(기본 1~10페이지, 100건/페이지)

**출력 dict 스키마**:
```python
class RankingItem(BaseModel):
    musinsa_no: str
    rank_main: int
    brand_slug: str           # 브랜드 페이지 URL에서 추출
    brand_name: str
    product_name: str
    current_price: int
    list_price: int | None
    discount_rate: int | None
    thumbnail_url: str
    category_code: str
    scraped_at: datetime
```

**URL 패턴 (확인 필요)**:
- 카테고리 랭킹: `https://www.musinsa.com/ranking/best?categoryCode={code}&period=now`

**파싱 전략**:
- DOM 셀렉터는 변경에 취약 → 페이지 내 임베디드 JSON (`__NEXT_DATA__` 또는 유사) 우선 활용
- 폴백으로만 DOM 셀렉터 사용
- 셀렉터는 모듈 상단 상수로 분리하여 변경 시 한곳만 수정

**페이지네이션**: URL 쿼리 `&page=N` 또는 무한 스크롤 (사이트 구조에 따라)

### 5.2 `musinsa_product.py`

**입력**: `musinsa_no`

**출력**:
```python
class ProductDetail(BaseModel):
    musinsa_no: str
    brand_slug: str
    brand_name: str
    product_name: str
    product_name_en: str | None
    category_code: str
    list_price: int
    current_price: int
    description_text: str       # 본문 텍스트 (HTML 제거)
    colors: list[str]           # 추출 가능하면
    sizes: list[str]
    fit_keywords: list[str]     # '오버핏', '레귤러' 등
    images: list[ImageMeta]     # 메인+상세 이미지
    rating: float | None
    review_count: int
    wishlist_count: int | None
    likes_count: int | None
    scraped_at: datetime

class ImageMeta(BaseModel):
    url: str
    image_type: str             # 'main' | 'detail' | 'thumbnail'
    order_idx: int
```

**URL**: `https://www.musinsa.com/products/{musinsa_no}`

**주의**:
- 이미지 URL은 origin URL만 보관 (실제 다운로드는 02-ingestion에서)
- 본문 텍스트는 200자 요약본 + 풀텍스트 둘 다 보관 (LLM용 + 검색용)

### 5.3 `musinsa_review.py`

**입력**: `musinsa_no`, `limit`(기본 30건)

**출력**:
```python
class ReviewMeta(BaseModel):
    musinsa_no: str
    cumulative_review_count: int
    avg_rating: float
    recent_comments: list[ReviewComment]   # 최신 N건
    scraped_at: datetime

class ReviewComment(BaseModel):
    rating: int                  # 1~5
    body_text: str               # 본문 (작성자 식별정보 제외)
    written_at: date | None      # 작성일 (YYYY-MM-DD)
    size_purchased: str | None
    height_cm: int | None        # "키 178cm" 류
    weight_kg: int | None
```

**개인정보 강제 사항** (GOVERNANCE.md 3.2 준수):
- 닉네임, 사용자 ID, 프로필 이미지 URL **수집 금지**
- 키/몸무게는 통계 분석용으로만 (개인 식별 불가)

### 5.4 `musinsa_event.py`

**입력**: 없음 (메인 이벤트 페이지 전체 수집)

**출력**:
```python
class PromotionItem(BaseModel):
    musinsa_no: str
    promo_type: Literal['sale_tab', 'time_deal', 'pre_order', 'coupon']
    promo_name: str
    discount_rate: int | None
    discount_amount: int | None
    starts_at: datetime | None
    ends_at: datetime | None
    final_price: int
    list_price: int
    meta: dict                   # 사이트별 추가 정보
    scraped_at: datetime
```

**URL 패턴 (확인 필요)**:
- 세일탭: `/sale`
- 타임딜: `/timeDeal`
- 프리오더: `/pre-order`

### 5.5 `musinsa_snap.py`

**입력**: 카테고리 또는 브랜드 슬러그

**출력**:
```python
class SnapItem(BaseModel):
    snap_id: str                 # 무신사 스냅 고유 ID
    image_url: str
    tagged_musinsa_nos: list[str]
    likes_count: int
    comments_count: int
    posted_at: datetime | None
    scraped_at: datetime
```

**주의**: 스냅 게시자 정보 미수집.

## 6. 봇 차단 우회

### 6.1 stealth 옵션
```python
from playwright_stealth import stealth_async
# 페이지 생성 후
await stealth_async(page)
```

### 6.2 사용 권장 패턴
- 브라우저 launch 시 `args=["--disable-blink-features=AutomationControlled"]`
- viewport: 일반적인 데스크탑 해상도 (1920x1080)
- locale: `ko-KR`, timezone: `Asia/Seoul`
- 마우스 이동·랜덤 스크롤 (`scroll_to_bottom`)

### 6.3 차단 감지
```python
BOT_BLOCK_INDICATORS = [
    "비정상적인 접근",
    "보안 점검",
    "captcha",
    "Access Denied",
]

async def is_blocked(page: Page) -> bool:
    content = await page.content()
    return any(ind.lower() in content.lower() for ind in BOT_BLOCK_INDICATORS)
```

차단 감지 시 즉시 `BotBlockedError` 발생 → n8n이 워크플로우 중단.

## 7. 로깅 규칙

모든 요청은 다음 필드로 구조화 로깅:
```json
{
  "ts": "...",
  "scraper": "musinsa_ranking",
  "url": "...",
  "status": 200,
  "elapsed_ms": 2340,
  "items_extracted": 100,
  "trace_id": "uuid"
}
```

로그는 `worker/logs/scrape.jsonl` 에 일자별 로테이션.

## 8. 단위 테스트 전략

- VCR.py 또는 Playwright의 HAR 저장 기능으로 응답을 fixture로 저장
- 파싱 로직만 단위 테스트 (네트워크 없이)
- 셀렉터 변경은 통합 테스트로 주 1회 자동 점검 (Phase 3)

## 9. 실패 모드 체크리스트

코드 작성자가 반드시 처리해야 할 케이스:
- [ ] 페이지 로딩 timeout
- [ ] 봇 차단 응답
- [ ] DOM 구조 변경 (셀렉터 매치 0건)
- [ ] 임베디드 JSON 스키마 변경
- [ ] 상품 페이지 404 (삭제된 상품)
- [ ] 카테고리 페이지 빈 결과
- [ ] 이미지 URL이 protocol-relative (`//image...`) → `https:` prefix
- [ ] 가격 표기 변동 (`60,000원` vs `60000` vs `₩60,000`)

## 10. 코드 작성 시작점 (스니펫)

```python
# worker/scrapers/base.py
from __future__ import annotations
import asyncio
import random
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from playwright_stealth import stealth_async
from tenacity import retry, stop_after_attempt, wait_exponential
from loguru import logger


class BotBlockedError(RuntimeError):
    pass


class BaseScraper(ABC):
    USER_AGENT = "B.CAVE-Competitor-Radar/1.0 (internal analytics)"
    MIN_DELAY_SEC = 3.0
    DELAY_JITTER = 1.5
    TIMEOUT_MS = 30_000

    def __init__(self) -> None:
        self._pw = None
        self._browser: Browser | None = None
        self._ctx: BrowserContext | None = None

    async def __aenter__(self) -> "BaseScraper":
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        self._ctx = await self._browser.new_context(
            user_agent=self.USER_AGENT,
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            viewport={"width": 1920, "height": 1080},
        )
        return self

    async def __aexit__(self, *exc) -> None:
        if self._ctx: await self._ctx.close()
        if self._browser: await self._browser.close()
        if self._pw: await self._pw.stop()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=20))
    async def goto(self, url: str) -> Page:
        assert self._ctx is not None
        page = await self._ctx.new_page()
        await stealth_async(page)
        await page.goto(url, timeout=self.TIMEOUT_MS, wait_until="networkidle")
        if await self._is_blocked(page):
            await page.close()
            raise BotBlockedError(f"blocked: {url}")
        await asyncio.sleep(self.MIN_DELAY_SEC + random.random() * self.DELAY_JITTER)
        return page

    async def _is_blocked(self, page: Page) -> bool:
        content = (await page.content()).lower()
        return any(k in content for k in ["captcha", "비정상적인 접근", "access denied"])

    @abstractmethod
    async def scrape(self, *args, **kwargs) -> list[dict]:
        ...
```

이 베이스를 상속하여 각 5개 스크래퍼를 작성한다.

## 11. AI 페어 프로그래밍 가이드

Cursor/Claude Code 사용 시 권장 프롬프트 패턴:

> "본 문서(`docs/skills/01-scraping.md`)와 `worker/scrapers/base.py`를 컨텍스트로 사용한다. `musinsa_ranking.py`를 작성하라. 출력 dict는 RankingItem 스키마를 따르고, 베이스 스크래퍼를 상속하며, 페이지네이션은 100건씩 10페이지까지 처리한다. 실제 URL과 셀렉터는 코드 내 상수로 분리하라."

DOM 셀렉터는 사이트 구조 변경에 취약하므로, **실제 페이지를 한 번 열어 구조를 확인한 후 코드를 작성**하는 것이 정석. AI가 추측한 셀렉터는 거의 틀린다.
