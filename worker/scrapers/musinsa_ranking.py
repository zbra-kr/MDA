"""
Musinsa category ranking scraper.

데이터 소스: client.musinsa.com REST API (조사 결과: _investigate_findings.md §2)
Playwright 불필요 — httpx 직접 호출로 101건 단일 응답.
페이지네이션 없음.

적재(DB write)는 이 파일의 책임이 아니다 — worker/ingest/ 에서 처리.
"""

from __future__ import annotations

import asyncio
import random
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from loguru import logger
from pydantic import BaseModel
from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential

from .base import (
    BaseScraper,
    BotBlockedError,
    PageNotFoundError,
    PageTimeoutError,
    SelectorEmptyError,
)

# ---------------------------------------------------------------------------
# API 상수 — 조사 결과에서 확인된 실제 엔드포인트
# ---------------------------------------------------------------------------
_API_URL = "https://client.musinsa.com/api/home/web/v5/pans/ranking/sections/200"
_STORE_CODE = "musinsa"
_REFERER = "https://www.musinsa.com/main/musinsa/ranking"


# ---------------------------------------------------------------------------
# 출력 모델 (01-scraping.md §5.1 RankingItem + 00005 스키마 보정 반영)
# ---------------------------------------------------------------------------


class RankingItem(BaseModel):
    musinsa_no: str
    rank_main: int
    brand_slug: str       # 영문 slug (API: amplitude.brand_id)
    brand_name: str       # 한글 브랜드명 (API: info.brandName)
    product_name: str
    current_price: int    # 판매가 — info.finalPrice (int)
    list_price: int | None  # 정가 — amplitude.original_price (str → int)
    discount_rate: int | None  # 할인율 — info.discountRatio (int)
    thumbnail_url: str
    category_code: str    # amplitude.category_id
    review_count: int | None  # amplitude.reviewCount (str → int)
    review_score: int | None  # amplitude.reviewScore, 100점 만점 원본 저장 (00005 §1)
    is_sold_out: bool     # info.isSoldOut (bool, 00005 §2)
    scraped_at: datetime


# ---------------------------------------------------------------------------
# 스크래퍼
# ---------------------------------------------------------------------------


class MusinsaRankingScraper(BaseScraper):
    """Musinsa 카테고리 랭킹 수집기 (httpx only, 브라우저 불필요).

    사용법:
        async with MusinsaRankingScraper() as s:
            items: list[dict] = await s.scrape(["001", "002", "103"])
    """

    def __init__(self) -> None:
        super().__init__()
        self._client: httpx.AsyncClient | None = None

    # ------------------------------------------------------------------
    # Context manager — BaseScraper의 브라우저 기동을 httpx 클라이언트로 대체
    # ------------------------------------------------------------------

    async def __aenter__(self) -> MusinsaRankingScraper:
        self._client = httpx.AsyncClient(
            headers={
                "User-Agent": self.USER_AGENT,
                "Accept": "application/json, */*",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Referer": _REFERER,
            },
            timeout=self.TIMEOUT_MS / 1000,
            follow_redirects=True,
        )
        logger.bind(
            scraper=self._name,
            user_agent=self.USER_AGENT,
            min_delay_sec=self.MIN_DELAY_SEC,
        ).info("http_client_started")
        return self

    async def __aexit__(self, *exc) -> None:
        if self._client:
            await self._client.aclose()
        logger.bind(scraper=self._name).info("http_client_closed")

    # ------------------------------------------------------------------
    # API 호출 — rate limit + retry
    # ------------------------------------------------------------------

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=20),
        retry=retry_if_not_exception_type((BotBlockedError, PageNotFoundError, SelectorEmptyError)),
        reraise=True,
    )
    async def _fetch_raw(
        self,
        category_code: str,
        period: str,
        gender: str,
    ) -> dict[str, Any]:
        """카테고리 1개분 랭킹 API 호출. 거버넌스 rate limit(≥3s) 적용."""
        if self._client is None:
            raise RuntimeError("Use 'async with MusinsaRankingScraper()' before scraping.")

        trace_id = str(uuid.uuid4())
        t0 = time.monotonic()

        params: dict[str, str] = {
            "storeCode": _STORE_CODE,
            "categoryCode": category_code,
            "contentsId": "",
            "period": period,
            "gf": gender,
        }

        try:
            resp = await self._client.get(_API_URL, params=params)
        except httpx.TimeoutException as exc:
            raise PageTimeoutError(f"API timeout — categoryCode={category_code}") from exc
        except httpx.RequestError as exc:
            raise PageTimeoutError(f"Network error — categoryCode={category_code}") from exc

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        logger.bind(
            scraper=self._name,
            url=str(resp.url),
            status=resp.status_code,
            elapsed_ms=elapsed_ms,
            category_code=category_code,
            trace_id=trace_id,
        ).info("api_response")

        if resp.status_code == 404:
            raise PageNotFoundError(f"404 — categoryCode={category_code}")
        if resp.status_code >= 400:
            raise BotBlockedError(f"HTTP {resp.status_code} — categoryCode={category_code}")

        data = resp.json()
        if data.get("meta", {}).get("result") != "SUCCESS":
            raise BotBlockedError(f"API non-success: {data.get('meta')}")

        # 거버넌스: 카테고리 간 최소 3초 지연
        await asyncio.sleep(self.MIN_DELAY_SEC + random.random() * self.DELAY_JITTER)

        return data  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # 파싱
    # ------------------------------------------------------------------

    def _parse_response(
        self,
        data: dict[str, Any],
        scraped_at: datetime,
    ) -> list[RankingItem]:
        items: list[RankingItem] = []
        modules: list[dict[str, Any]] = data.get("data", {}).get("modules", [])

        for module in modules:
            if module.get("type") != "MULTICOLUMN":
                continue
            for raw in module.get("items", []):
                if raw.get("type") != "PRODUCT_COLUMN":
                    continue
                item = self._parse_item(raw, scraped_at)
                if item is not None:
                    items.append(item)

        return items

    def _parse_item(
        self,
        raw: dict[str, Any],
        scraped_at: datetime,
    ) -> RankingItem | None:
        try:
            image: dict[str, Any] = raw["image"]
            info: dict[str, Any] = raw["info"]

            # amplitude payload: image → onClickLike → eventLog → amplitude → payload
            amp: dict[str, Any] = (
                image.get("onClickLike", {})
                .get("eventLog", {})
                .get("amplitude", {})
                .get("payload", {})
            )

            # --- 기본 필드 (info, image) ---
            musinsa_no: str = raw["id"]
            rank_main: int = image["rank"]
            thumbnail_url: str = image["url"]
            brand_name: str = info["brandName"]
            product_name: str = info["productName"]
            current_price: int = info["finalPrice"]        # int
            discount_rate: int | None = info.get("discountRatio")  # int
            is_sold_out: bool = bool(info.get("isSoldOut", False))

            # --- amplitude payload (모두 str) ---
            brand_slug: str = amp.get("brand_id", "")
            category_code: str = amp.get("category_id", "")

            raw_list_price = amp.get("original_price")
            list_price: int | None = int(raw_list_price) if raw_list_price else None

            raw_review_count = amp.get("reviewCount")
            review_count: int | None = int(raw_review_count) if raw_review_count else None

            # reviewScore == "0" 은 리뷰 없음을 의미 → NULL 저장 (00005 §1 정책)
            raw_review_score = amp.get("reviewScore")
            _score = int(raw_review_score) if raw_review_score else 0
            review_score: int | None = _score if _score > 0 else None

        except (KeyError, ValueError, TypeError) as exc:
            logger.bind(
                scraper=self._name,
                item_id=raw.get("id"),
                error=str(exc),
            ).warning("item_parse_failed")
            return None

        return RankingItem(
            musinsa_no=musinsa_no,
            rank_main=rank_main,
            brand_slug=brand_slug,
            brand_name=brand_name,
            product_name=product_name,
            current_price=current_price,
            list_price=list_price,
            discount_rate=discount_rate,
            thumbnail_url=thumbnail_url,
            category_code=category_code,
            review_count=review_count,
            review_score=review_score,
            is_sold_out=is_sold_out,
            scraped_at=scraped_at,
        )

    # ------------------------------------------------------------------
    # 공개 인터페이스
    # ------------------------------------------------------------------

    async def scrape(  # type: ignore[override]
        self,
        category_codes: list[str],
        period: str = "REALTIME",
        gender: str = "A",
    ) -> list[dict[str, Any]]:
        """카테고리 코드 목록을 순차적으로 수집해 RankingItem dict 목록 반환.

        Args:
            category_codes: 수집할 카테고리 코드 목록 (예: ["001", "002", "103"])
            period: 랭킹 집계 주기 — REALTIME | DAILY | WEEKLY | MONTHLY
            gender: 성별 필터 — A(전체) | M(남성) | F(여성)

        Returns:
            list[dict] — RankingItem.model_dump() 목록. ingest 모듈로 전달.

        Raises:
            BotBlockedError: API가 차단 응답을 반환한 경우 (워크플로우 중단)
            SelectorEmptyError: 파싱 결과 0건 (API 구조 변경 의심)
        """
        all_items: list[RankingItem] = []
        scraped_at = datetime.now(UTC)

        for cat_code in category_codes:
            data = await self._fetch_raw(cat_code, period, gender)
            items = self._parse_response(data, scraped_at)

            if not items:
                raise SelectorEmptyError(
                    f"0 products parsed for categoryCode={cat_code} — "
                    "API schema may have changed (check _investigate_findings.md §3)"
                )

            self._log_extracted(
                url=f"{_API_URL}?categoryCode={cat_code}&period={period}",
                items_extracted=len(items),
            )
            all_items.extend(items)

        return [item.model_dump() for item in all_items]


# ---------------------------------------------------------------------------
# 동작 확인용 — 직접 실행 시 카테고리 001(상의) 1건 수집·출력
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    async def _smoke_test() -> None:
        async with MusinsaRankingScraper() as scraper:
            results = await scraper.scrape(["001"])

        print(f"\n수집 완료: {len(results)}건")
        print("\n[상위 3건]")
        for r in results[:3]:
            # datetime → ISO string for json.dumps
            r["scraped_at"] = r["scraped_at"].isoformat()
            print(json.dumps(r, ensure_ascii=False, indent=2))

    asyncio.run(_smoke_test())
