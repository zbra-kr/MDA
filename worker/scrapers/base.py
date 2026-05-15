from __future__ import annotations

import asyncio
import os
import random
import time
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from loguru import logger
from playwright.async_api import Browser, BrowserContext, Page, async_playwright
from playwright_stealth import Stealth as _Stealth
from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential

# ---------------------------------------------------------------------------
# Governance constants — override via .env
# ---------------------------------------------------------------------------
_MIN_DELAY_SEC = float(os.getenv("SCRAPE_MIN_DELAY_SEC", "3.0"))
_USER_AGENT = os.getenv(
    "SCRAPE_USER_AGENT",
    "B.CAVE-Competitor-Radar/1.0 (internal analytics)",
)

BOT_BLOCK_INDICATORS: list[str] = [
    "비정상적인 접근",
    "보안 점검",
    "captcha",
    "access denied",
]

# ---------------------------------------------------------------------------
# File logger — JSON lines, daily rotation → worker/logs/scrape-YYYY-MM-DD.jsonl
# ---------------------------------------------------------------------------
_LOG_DIR = Path(__file__).parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)

logger.add(
    str(_LOG_DIR / "scrape_{time:YYYY-MM-DD}.jsonl"),
    rotation="00:00",
    retention="30 days",
    serialize=True,  # emit newline-delimited JSON
    level="DEBUG",
    enqueue=True,    # thread-safe async write
)


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class ScraperError(RuntimeError):
    """Base class for all scraper errors."""


class BotBlockedError(ScraperError):
    """Target site returned a bot-detection page. Workflow should halt."""


class PageTimeoutError(ScraperError):
    """page.goto() exceeded TIMEOUT_MS."""


class SelectorEmptyError(ScraperError):
    """CSS selector matched 0 elements — likely a DOM structure change."""


class PageNotFoundError(ScraperError):
    """HTTP 404: product deleted or page removed."""


# ---------------------------------------------------------------------------
# BaseScraper
# ---------------------------------------------------------------------------


class BaseScraper(ABC):
    USER_AGENT: str = _USER_AGENT
    MIN_DELAY_SEC: float = _MIN_DELAY_SEC  # governance: minimum 3 s
    DELAY_JITTER: float = 1.5              # actual delay: MIN_DELAY_SEC .. +DELAY_JITTER
    TIMEOUT_MS: int = 30_000

    def __init__(self) -> None:
        self._pw = None
        self._browser: Browser | None = None
        self._ctx: BrowserContext | None = None
        self._name = self.__class__.__name__

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> BaseScraper:
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
        logger.bind(
            scraper=self._name,
            user_agent=self.USER_AGENT,
            min_delay_sec=self.MIN_DELAY_SEC,
        ).info("browser_launched")
        return self

    async def __aexit__(self, *exc) -> None:
        if self._ctx:
            await self._ctx.close()
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        logger.bind(scraper=self._name).info("browser_closed")

    # ------------------------------------------------------------------
    # Navigation — retries on transient errors; halts on block/404
    # ------------------------------------------------------------------

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=20),
        retry=retry_if_not_exception_type((BotBlockedError, PageNotFoundError)),
        reraise=True,
    )
    async def goto(self, url: str) -> Page:
        """Navigate to *url* with stealth, rate-limiting, and bot-detection check.

        Retries up to 3 times on transient failures (timeout, network).
        Never retries BotBlockedError or PageNotFoundError.
        """
        if self._ctx is None:
            raise RuntimeError("Call 'async with Scraper()' before goto()")

        trace_id = str(uuid.uuid4())
        t0 = time.monotonic()

        page = await self._ctx.new_page()
        await _Stealth().apply_stealth_async(page)

        try:
            response = await page.goto(url, timeout=self.TIMEOUT_MS, wait_until="networkidle")
        except Exception as exc:
            await page.close()
            raise PageTimeoutError(f"Timeout navigating to {url}") from exc

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        status = response.status if response else None

        if status == 404:
            await page.close()
            raise PageNotFoundError(f"404: {url}")

        if await self._is_blocked(page):
            logger.bind(
                scraper=self._name,
                url=url,
                status=status,
                elapsed_ms=elapsed_ms,
                trace_id=trace_id,
            ).warning("bot_blocked")
            await page.close()
            raise BotBlockedError(f"blocked: {url}")

        logger.bind(
            scraper=self._name,
            url=url,
            status=status,
            elapsed_ms=elapsed_ms,
            trace_id=trace_id,
        ).info("page_loaded")

        await asyncio.sleep(self.MIN_DELAY_SEC + random.random() * self.DELAY_JITTER)
        return page

    # ------------------------------------------------------------------
    # Infinite scroll helper
    # ------------------------------------------------------------------

    async def scroll_to_bottom(self, page: Page, max_scrolls: int = 20) -> None:
        """Scroll *page* incrementally to trigger infinite-scroll content loads.

        Stops early when scrollHeight stops growing (bottom reached).
        Logs a warning if max_scrolls is exhausted without hitting the bottom.
        """
        prev_height = -1
        for i in range(max_scrolls):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(0.8 + random.random() * 0.7)  # 0.8~1.5 s jitter
            curr_height: int = await page.evaluate("document.body.scrollHeight")
            if curr_height == prev_height:
                logger.bind(scraper=self._name, scroll_count=i + 1).debug("scroll_bottom_reached")
                break
            prev_height = curr_height
        else:
            logger.bind(scraper=self._name, max_scrolls=max_scrolls).warning("scroll_max_reached")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _is_blocked(self, page: Page) -> bool:
        content = (await page.content()).lower()
        return any(ind.lower() in content for ind in BOT_BLOCK_INDICATORS)

    def _log_extracted(self, url: str, items_extracted: int, trace_id: str | None = None) -> None:
        """Structured log for the number of items parsed from a page."""
        logger.bind(
            scraper=self._name,
            url=url,
            items_extracted=items_extracted,
            trace_id=trace_id,
        ).info("items_extracted")

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    async def scrape(self, *args, **kwargs) -> list[dict]:
        """Subclasses implement page-specific scraping logic here."""
        ...

