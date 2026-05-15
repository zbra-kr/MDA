"""
Musinsa product detail scraper.

데이터 소스: www.musinsa.com/products/{musinsa_no} Playwright 네트워크 인터셉트.
조사 결과: worker/scrapers/_investigate_product_findings.md §2

1차 필드 (이번 구현):
  wishlist_count, brand_like_count, tags, similar_products,
  snaps, ai_summary, keyword_scores, total_reviews, rating_distribution

2차 필드 (추후 구현 — 항상 None):
  main_image_url, description, also_viewed_products

개인정보 정책 (코드로 강제):
  - review/v1/view/list 응답 → 수신 즉시 폐기 (리뷰 본문·작성자)
  - snap/v1/profiles 응답 → 수신 즉시 폐기 (스냅 작성자 식별 정보)
  - review/v1/picture-reviews 응답 → 수신 즉시 폐기 (사진 리뷰 본문)
  - SnapItem 모델에 작성자 식별 필드 없음 — 설계 의도

적재(DB write)는 이 파일의 책임이 아니다 — worker/ingest/ 에서 처리.
"""
from __future__ import annotations

import asyncio
import random
import re
import time
import uuid
from collections.abc import Callable, Coroutine
from datetime import UTC, datetime
from typing import Any

from loguru import logger
from playwright.async_api import Page, Response
from playwright_stealth import Stealth as _Stealth
from pydantic import BaseModel

from .base import (
    BaseScraper,
    BotBlockedError,
    PageNotFoundError,
    PageTimeoutError,
)

# ---------------------------------------------------------------------------
# URL 화이트리스트 — 이 패턴에 매칭되는 JSON 응답만 캡처, 나머지 무시
# key 는 _build_product_detail 파싱 메서드와 1:1 대응
# ---------------------------------------------------------------------------
_CAPTURE_PATTERNS: dict[str, re.Pattern[str]] = {
    "goods_like":     re.compile(r"like\.musinsa\.com/like/api/v2/liketypes/goods/counts"),
    "brand_like":     re.compile(r"like\.musinsa\.com/like/api/v2/liketypes/brand/counts"),
    "tags":           re.compile(r"goods-detail\.musinsa\.com/api2/goods/\d+/tags(?:\?|$)"),
    "similar":        re.compile(r"goods-detail\.musinsa\.com/api2/goods/\d+/recommends/multi\?.*allbrand"),
    "snap":           re.compile(r"content\.musinsa\.com/api2/content/snap/v1/snaps\?"),
    "ai_summary":     re.compile(r"goods\.musinsa\.com/api2/review/v1/ai-summary/\d+"),
    "survey":         re.compile(r"goods\.musinsa\.com/api2/review/v1/view/survey/\d+/summary"),
    "review_summary": re.compile(r"goods\.musinsa\.com/api2/review/v1/goods/\d+/reviews/summary"),
}

# ---------------------------------------------------------------------------
# URL 거부 목록 — 개인정보 보호: 화이트리스트 이전에 우선 검사.
# 매칭되면 응답 본문을 파싱하지 않고 즉시 폐기하며 warning 로그를 남긴다.
# ---------------------------------------------------------------------------
_DENY_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"review/v1/view/list"),      "리뷰 본문·작성자"),
    (re.compile(r"review/v1/picture-reviews"), "사진 리뷰 본문"),
    (re.compile(r"snap/v1/profiles"),          "스냅 작성자 식별 정보"),
    (re.compile(r"/member"),                   "회원 정보"),
    (re.compile(r"/account"),                  "계정 정보"),
]

_PRODUCT_URL_TPL = "https://www.musinsa.com/products/{no}"


# ---------------------------------------------------------------------------
# 출력 모델
# ---------------------------------------------------------------------------


class SnapItem(BaseModel):
    """스냅(코디 사진) 메타데이터.

    ⚠ 작성자 식별 필드(닉네임·프로필·createdBy) 없음 — 설계 의도 (개인정보 정책).
    """

    snap_id: str
    image_url: str
    caption: str | None = None   # 현재 API 응답에서 미확인 → None
    posted_at: datetime | None = None  # 현재 API 응답에서 미확인 → None


class SimilarItem(BaseModel):
    """추천 상품 1건 (similar | also_viewed)."""

    musinsa_no: str
    rank: int
    kind: str  # "similar" | "also_viewed"


class ProductDetail(BaseModel):
    """MusinsaProductScraper 가 반환하는 상품 상세 데이터 1건.

    1차 필드: 이번 구현에서 채움.
    2차 필드: 추후 구현 — 항상 None. ingest 에서 DB NULL 로 저장됨.
    """

    musinsa_no: str
    scraped_at: datetime

    # 1차 필드
    wishlist_count: int | None = None
    brand_like_count: int | None = None
    tags: list[str] | None = None
    similar_products: list[SimilarItem] | None = None
    snaps: list[SnapItem] | None = None
    ai_summary: str | None = None
    keyword_scores: dict[str, Any] | None = None
    total_reviews: int | None = None
    rating_distribution: dict[str, Any] | None = None

    # 2차 필드 — 추후 구현 (항상 None)
    main_image_url: None = None
    description: None = None
    also_viewed_products: None = None


# ---------------------------------------------------------------------------
# 스크래퍼
# ---------------------------------------------------------------------------

CapturedBuf = dict[str, list[dict[str, Any]]]


class MusinsaProductScraper(BaseScraper):
    """Musinsa 상품 상세 데이터 수집기 (Playwright 네트워크 인터셉트).

    사용법:
        async with MusinsaProductScraper() as s:
            results: list[dict] = await s.scrape(["6154808", "6197079"])
    """

    # 페이지 타이밍 상수 (조사 결과 §3 기준)
    TIMEOUT_MS: int = 30_000
    _POST_LOAD_SLEEP: float = 4.0    # "load" 이후 비동기 XHR 대기
    _POST_LOAD_JITTER: float = 2.0
    _SCROLL_ROUNDS: int = 6          # 스크롤 횟수 — 지연 로딩 위젯 트리거
    _SCROLL_SLEEP: float = 1.5
    _SCROLL_JITTER: float = 0.8
    _POST_SCROLL_SLEEP: float = 2.0  # 스크롤 후 XHR 완료 대기

    # ------------------------------------------------------------------
    # 응답 인터셉트 핸들러 팩토리
    # ------------------------------------------------------------------

    def _make_handler(
        self,
        buf: CapturedBuf,
        musinsa_no: str,
    ) -> Callable[[Response], Coroutine[Any, Any, None]]:
        """응답 인터셉트 핸들러를 반환한다.

        - _DENY_PATTERNS 에 매칭 → 폐기 (개인정보 보호)
        - _CAPTURE_PATTERNS 에 매칭 → buf 에 축적
        - 그 외 → 무시
        """

        async def _handler(resp: Response) -> None:
            url = resp.url

            # 1. 개인정보 보호 거부 목록 — 최우선
            for deny_pat, reason in _DENY_PATTERNS:
                if deny_pat.search(url):
                    logger.bind(
                        scraper=self._name,
                        musinsa_no=musinsa_no,
                        url=url[:120],
                        reason=reason,
                    ).warning("privacy_response_discarded")
                    return

            # 2. 화이트리스트 매칭
            field_key: str | None = None
            for key, pat in _CAPTURE_PATTERNS.items():
                if pat.search(url):
                    field_key = key
                    break

            if field_key is None:
                return

            # 3. JSON 응답만, 4xx+ 제외
            ct = resp.headers.get("content-type", "")
            if "json" not in ct or resp.status >= 400:
                return

            try:
                body: Any = await resp.json()
            except Exception:
                return

            buf.setdefault(field_key, []).append({"url": url, "body": body})
            logger.bind(
                scraper=self._name,
                musinsa_no=musinsa_no,
                field=field_key,
                url=url[:120],
            ).debug("response_captured")

        return _handler

    # ------------------------------------------------------------------
    # 페이지 내비게이션 (networkidle 사용 금지 — 조사 결과 §6: YouTube SDK)
    # ------------------------------------------------------------------

    async def _open_product_page(
        self,
        musinsa_no: str,
        trace_id: str,
    ) -> tuple[Page, CapturedBuf]:
        """상품 상세 페이지를 열고 스크롤하며 XHR 응답을 캡처한다.

        Returns:
            (page, captured_buf): 호출자가 page.close() 해야 함.

        Raises:
            PageTimeoutError: goto 실패이고 XHR 0건 캡처된 경우.
            PageNotFoundError: HTTP 404.
            BotBlockedError: 봇 차단 감지.
        """
        if self._ctx is None:
            raise RuntimeError("Use 'async with MusinsaProductScraper()' before scraping.")

        url = _PRODUCT_URL_TPL.format(no=musinsa_no)
        captured: CapturedBuf = {}

        page = await self._ctx.new_page()
        await _Stealth().apply_stealth_async(page)
        page.on("response", self._make_handler(captured, musinsa_no))

        t0 = time.monotonic()
        response = None
        goto_exc: Exception | None = None

        try:
            # wait_until="load" — networkidle 은 YouTube/광고 SDK 연결 유지로 45s timeout 발생
            response = await page.goto(url, timeout=self.TIMEOUT_MS, wait_until="load")
        except Exception as exc:
            goto_exc = exc
            logger.bind(
                scraper=self._name,
                musinsa_no=musinsa_no,
                url=url,
                error=str(exc)[:120],
                trace_id=trace_id,
            ).warning("goto_exception")

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        # goto 실패 + XHR 0건이면 진짜 실패
        if goto_exc is not None and not captured:
            await page.close()
            raise PageTimeoutError(f"goto failed, no XHR captured: {url}") from goto_exc

        status = response.status if response else None

        if status == 404:
            await page.close()
            raise PageNotFoundError(f"404: {url}")

        if await self._is_blocked(page):
            logger.bind(
                scraper=self._name,
                musinsa_no=musinsa_no,
                url=url,
                status=status,
                trace_id=trace_id,
            ).warning("bot_blocked")
            await page.close()
            raise BotBlockedError(f"blocked: {url}")

        logger.bind(
            scraper=self._name,
            musinsa_no=musinsa_no,
            url=url,
            status=status,
            elapsed_ms=elapsed_ms,
            trace_id=trace_id,
        ).info("page_loaded")

        # "load" 이후 지연 XHR 완료 대기 (스냅·AI후기·리뷰 위젯)
        await asyncio.sleep(self._POST_LOAD_SLEEP + random.random() * self._POST_LOAD_JITTER)

        # 하단까지 스크롤 (지연 로딩 위젯 트리거)
        prev_h = -1
        for _ in range(self._SCROLL_ROUNDS):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(self._SCROLL_SLEEP + random.random() * self._SCROLL_JITTER)
            curr_h: int = await page.evaluate("document.body.scrollHeight")
            if curr_h == prev_h:
                break
            prev_h = curr_h

        # 스크롤 후 XHR 완료 대기
        await asyncio.sleep(self._POST_SCROLL_SLEEP)

        logger.bind(
            scraper=self._name,
            musinsa_no=musinsa_no,
            captured_fields=list(captured.keys()),
            captured_counts={k: len(v) for k, v in captured.items()},
            trace_id=trace_id,
        ).info("capture_complete")

        return page, captured

    # ------------------------------------------------------------------
    # 파싱 메서드 — 각 field_key 에 대응
    # ------------------------------------------------------------------

    @staticmethod
    def _data(body: Any) -> dict[str, Any]:
        """body["data"] 를 안전하게 dict 로 꺼낸다.

        API 가 {"data": null} 을 반환하는 경우에도 {} 를 돌려줘
        후속 .get() 호출에서 AttributeError 가 발생하지 않도록 한다.
        """
        return body.get("data") or {}

    def _parse_wishlist_count(
        self, captured: CapturedBuf, musinsa_no: str
    ) -> int | None:
        """like.musinsa.com/.../goods/counts → wishlist_count.

        goods/counts 는 추천 상품 좋아요 수도 배치로 호출되므로
        relationId == musinsa_no 인 항목을 정확히 찾는다.
        """
        for entry in captured.get("goods_like", []):
            items = (
                self._data(entry["body"])
                .get("contents", {})
                .get("items", [])
            )
            for item in items:
                if str(item.get("relationId", "")) == str(musinsa_no):
                    count = item.get("count")
                    if isinstance(count, int):
                        return count
        return None

    def _parse_brand_like_count(self, captured: CapturedBuf) -> int | None:
        """like.musinsa.com/.../brand/counts → brand_like_count."""
        entries = captured.get("brand_like", [])
        if not entries:
            return None
        items = (
            self._data(entries[0]["body"])
            .get("contents", {})
            .get("items", [])
        )
        if items:
            count = items[0].get("count")
            return count if isinstance(count, int) else None
        return None

    def _parse_tags(self, captured: CapturedBuf) -> list[str] | None:
        """goods-detail/.../tags → list[str]."""
        entries = captured.get("tags", [])
        if not entries:
            return None
        tags: list[str] = self._data(entries[0]["body"]).get("tags", [])
        return tags if tags else None

    def _parse_similar_products(
        self, captured: CapturedBuf
    ) -> list[SimilarItem] | None:
        """goods-detail/.../recommends/multi?...allbrand → list[SimilarItem].

        응답 구조: data.similar[0].recommendsTabs[0].recommendedGoodsList
        (조사 덤프 실측값)
        """
        entries = captured.get("similar", [])
        if not entries:
            return None

        body = entries[0]["body"]
        similar_groups: list[dict] = self._data(body).get("similar", [])
        if not similar_groups:
            return None

        tabs: list[dict] = similar_groups[0].get("recommendsTabs", [])
        if not tabs:
            return None
        goods_list: list[dict] = tabs[0].get("recommendedGoodsList", [])

        items: list[SimilarItem] = []
        for rank, g in enumerate(goods_list, start=1):
            goods_no = g.get("goodsNo")
            if goods_no is None:
                continue
            items.append(SimilarItem(musinsa_no=str(goods_no), rank=rank, kind="similar"))

        return items if items else None

    def _parse_snaps(self, captured: CapturedBuf) -> list[SnapItem] | None:
        """content.musinsa.com/.../snap/v1/snaps? → list[SnapItem].

        ⚠ createdBy (작성자 ID) 는 명시적으로 참조하지 않는다.
        caption·posted_at 은 현재 응답에서 미확인 → None.
        """
        entries = captured.get("snap", [])
        if not entries:
            return None

        snap_list: list[dict] = self._data(entries[0]["body"]).get("list", [])
        items: list[SnapItem] = []
        for s in snap_list:
            snap_id = s.get("id")
            image_url = s.get("thumbnailUrl")
            if not snap_id or not image_url:
                continue
            # createdBy, model, aggregations 등 작성자·개인 식별 필드는 일절 참조 안 함
            items.append(
                SnapItem(
                    snap_id=str(snap_id),
                    image_url=image_url,
                    caption=None,
                    posted_at=None,
                )
            )

        return items if items else None

    def _parse_ai_summary(self, captured: CapturedBuf) -> str | None:
        """goods.musinsa.com/.../ai-summary/{no} → str.

        sentimentSummary.positive + negative 를 하나의 텍스트로 합친다.
        """
        entries = captured.get("ai_summary", [])
        if not entries:
            return None

        sent: dict = self._data(entries[0]["body"]).get("sentimentSummary", {})
        positive = (sent.get("positive") or "").strip()
        negative = (sent.get("negative") or "").strip()

        parts: list[str] = []
        if positive:
            parts.append(positive)
        if negative:
            parts.append(f"[주의] {negative}")

        return "\n\n".join(parts) if parts else None

    def _parse_keyword_scores(
        self, captured: CapturedBuf
    ) -> dict[str, Any] | None:
        """goods.musinsa.com/.../survey/{no}/summary → keyword_scores dict.

        각 attribute 에서 가장 높은 비율(dominant)의 답변을 추출.
        예: {"사이즈": {"dominant": "정사이즈예요", "dominant_pct": 82}}
        """
        entries = captured.get("survey", [])
        if not entries:
            return None

        questions: list[dict] = self._data(entries[0]["body"]).get("questions", [])
        scores: dict[str, Any] = {}

        for q in questions:
            attr = q.get("attribute")
            if not attr:
                continue
            answers: list[dict] = q.get("answers", [])
            if not answers:
                continue
            dominant = max(answers, key=lambda a: a.get("percentage", 0))
            scores[attr] = {
                "dominant": dominant.get("answerText"),
                "dominant_pct": dominant.get("percentage"),
            }

        return scores if scores else None

    def _parse_review_meta(
        self, captured: CapturedBuf
    ) -> tuple[int | None, dict[str, Any] | None]:
        """goods.musinsa.com/.../reviews/summary → (total_reviews, rating_distribution).

        reviews/summary 엔드포인트는 별점 분포(5-star breakdown)를 제공하지 않는다.
        satisfactionScore (평균 만족도) 를 rating_distribution 에 보관한다.
        """
        entries = captured.get("review_summary", [])
        if not entries:
            return None, None

        data: dict = self._data(entries[0]["body"])
        total = data.get("totalCount")
        score = data.get("satisfactionScore")

        total_reviews: int | None = int(total) if isinstance(total, (int, float)) else None
        rating_dist: dict[str, Any] | None = (
            {"satisfaction_score": float(score)} if score is not None else None
        )

        return total_reviews, rating_dist

    # ------------------------------------------------------------------
    # 조립
    # ------------------------------------------------------------------

    def _build_product_detail(
        self,
        musinsa_no: str,
        captured: CapturedBuf,
        scraped_at: datetime,
    ) -> ProductDetail:
        total_reviews, rating_dist = self._parse_review_meta(captured)
        return ProductDetail(
            musinsa_no=musinsa_no,
            scraped_at=scraped_at,
            wishlist_count=self._parse_wishlist_count(captured, musinsa_no),
            brand_like_count=self._parse_brand_like_count(captured),
            tags=self._parse_tags(captured),
            similar_products=self._parse_similar_products(captured),
            snaps=self._parse_snaps(captured),
            ai_summary=self._parse_ai_summary(captured),
            keyword_scores=self._parse_keyword_scores(captured),
            total_reviews=total_reviews,
            rating_distribution=rating_dist,
        )

    # ------------------------------------------------------------------
    # 공개 인터페이스
    # ------------------------------------------------------------------

    async def scrape(  # type: ignore[override]
        self,
        musinsa_nos: list[str],
    ) -> list[dict[str, Any]]:
        """musinsa_no 목록을 순차 수집해 ProductDetail dict 목록 반환.

        Args:
            musinsa_nos: 수집할 무신사 상품 번호 목록.

        Returns:
            list[dict] — ProductDetail.model_dump() 목록. ingest 모듈로 전달.

        Raises:
            BotBlockedError: 봇 차단 감지 시 즉시 중단 (워크플로우 중단).
                             PageNotFoundError·PageTimeoutError 는 해당 상품만 건너뜀.
        """
        results: list[ProductDetail] = []

        for i, musinsa_no in enumerate(musinsa_nos):
            trace_id = str(uuid.uuid4())
            scraped_at = datetime.now(UTC)

            logger.bind(
                scraper=self._name,
                musinsa_no=musinsa_no,
                progress=f"{i + 1}/{len(musinsa_nos)}",
                trace_id=trace_id,
            ).info("product_start")

            page: Page | None = None
            try:
                page, captured = await self._open_product_page(musinsa_no, trace_id)
                detail = self._build_product_detail(musinsa_no, captured, scraped_at)

                self._log_extracted(
                    url=_PRODUCT_URL_TPL.format(no=musinsa_no),
                    items_extracted=1,
                    trace_id=trace_id,
                )
                results.append(detail)

            except BotBlockedError:
                logger.bind(
                    scraper=self._name, musinsa_no=musinsa_no
                ).error("bot_blocked_abort")
                raise  # 봇 차단 시 전체 워크플로우 중단

            except (PageNotFoundError, PageTimeoutError) as exc:
                logger.bind(
                    scraper=self._name,
                    musinsa_no=musinsa_no,
                    error=str(exc),
                    trace_id=trace_id,
                ).warning("product_skip")
                # 404 / timeout: 해당 상품 건너뜀, 나머지 계속 진행

            finally:
                if page is not None:
                    await page.close()

            # 상품 간 rate limit — 거버넌스: 최소 3초 + 1~2초 jitter
            if i < len(musinsa_nos) - 1:
                delay = self.MIN_DELAY_SEC + random.uniform(1.0, 2.0)
                logger.bind(
                    scraper=self._name,
                    delay_sec=round(delay, 2),
                ).debug("rate_limit_sleep")
                await asyncio.sleep(delay)

        return [d.model_dump() for d in results]


# ---------------------------------------------------------------------------
# 동작 확인용 — 직접 실행 시 상품 1개 수집·출력
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    async def _smoke_test() -> None:
        # 조사 결과에서 확인된 상의 rank=1 상품
        test_no = "6154808"
        async with MusinsaProductScraper() as scraper:
            results = await scraper.scrape([test_no])

        print(f"\n수집 완료: {len(results)}건")
        for r in results:
            r["scraped_at"] = r["scraped_at"].isoformat()
            print(json.dumps(r, ensure_ascii=False, indent=2))

    asyncio.run(_smoke_test())
