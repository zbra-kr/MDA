"""
Temporary investigation script — DO NOT use in production.

목적: 무신사 카테고리 랭킹 페이지 구조 파악
출력:
  worker/scrapers/_investigate_dump.json   — 캡처한 JSON 전체
  worker/scrapers/_investigate_findings.md — 조사 요약

실행: python3 worker/scrapers/_investigate.py
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from pathlib import Path

import httpx
from playwright.async_api import Request, Response, async_playwright
from playwright_stealth import Stealth

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
USER_AGENT = "B.CAVE-Competitor-Radar/1.0 (internal analytics)"
MIN_DELAY_SEC = 3.0
TARGET_URL = "https://www.musinsa.com/ranking/best?categoryCode=001&period=now"
ROBOTS_URL = "https://www.musinsa.com/robots.txt"
TIMEOUT_MS = 45_000

DUMP_PATH = Path(__file__).parent / "_investigate_dump.json"
FINDINGS_PATH = Path(__file__).parent / "_investigate_findings.md"

# ---------------------------------------------------------------------------
# Main investigation
# ---------------------------------------------------------------------------


async def fetch_robots() -> str:
    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
        timeout=15,
    ) as client:
        try:
            r = await client.get(ROBOTS_URL)
            return r.text
        except Exception as exc:
            return f"ERROR: {exc}"


async def investigate() -> dict:
    robots_txt = await fetch_robots()
    print("=== robots.txt 수신 완료 ===")
    await asyncio.sleep(MIN_DELAY_SEC + random.random() * 1.5)

    captured_api: list[dict] = []   # XHR/fetch 응답
    captured_next_data: dict = {}
    nav_entries: list[dict] = []
    timing: dict = {}

    async with Stealth().use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            user_agent=USER_AGENT,
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            viewport={"width": 1920, "height": 1080},
        )

        # ── Network interception: catch all JSON API responses ──────────────
        async def on_response(response: Response) -> None:
            url = response.url
            ct = response.headers.get("content-type", "")
            # capture JSON-returning endpoints (skip images, css, fonts)
            if "json" in ct or (
                "/api/" in url and response.status < 400
            ):
                try:
                    body = await response.json()
                    captured_api.append(
                        {
                            "url": url,
                            "status": response.status,
                            "content_type": ct,
                            "body_preview": _truncate(body),
                            "body_full": body,
                        }
                    )
                    print(f"  [XHR] {response.status} {url[:120]}")
                except Exception:
                    pass

        async def on_request(request: Request) -> None:
            nav_entries.append(
                {"method": request.method, "url": request.url, "resource_type": request.resource_type}
            )

        page = await ctx.new_page()
        page.on("response", on_response)
        page.on("request", on_request)

        # ── Navigate ────────────────────────────────────────────────────────
        t0 = time.monotonic()
        print(f"=== Navigating to {TARGET_URL} ===")
        await page.goto(TARGET_URL, timeout=TIMEOUT_MS, wait_until="networkidle")
        elapsed = time.monotonic() - t0
        timing["goto_sec"] = round(elapsed, 2)
        print(f"    → 로드 완료 ({elapsed:.1f}s)")

        # Governance delay
        await asyncio.sleep(MIN_DELAY_SEC + random.random() * 1.5)

        # ── __NEXT_DATA__ check ─────────────────────────────────────────────
        next_data_raw: str = await page.evaluate("""
            () => {
                const el = document.getElementById('__NEXT_DATA__');
                return el ? el.textContent : '';
            }
        """)
        if next_data_raw:
            try:
                captured_next_data = json.loads(next_data_raw)
                print(f"  [__NEXT_DATA__] found, size={len(next_data_raw)} chars")
            except json.JSONDecodeError:
                print("  [__NEXT_DATA__] found but not valid JSON")
        else:
            print("  [__NEXT_DATA__] NOT found")

        # Check for other embedded script JSON (e.g. window.__INITIAL_STATE__)
        initial_state_raw: str = await page.evaluate("""
            () => {
                const scripts = Array.from(document.querySelectorAll('script[id]'));
                return JSON.stringify(scripts.map(s => ({id: s.id, len: s.textContent.length})));
            }
        """)
        print(f"  [script[id] elements] {initial_state_raw[:300]}")

        # ── Page structure analysis ─────────────────────────────────────────
        page_title = await page.title()
        current_url = page.url

        # Detect pagination vs infinite scroll
        pagination_info: dict = await page.evaluate("""
            () => {
                const pageNums = document.querySelectorAll('[class*="pagination"], [class*="Pagination"], nav[aria-label*="page"]');
                const loadMoreBtns = document.querySelectorAll('[class*="load-more"], [class*="loadMore"], [class*="infinite"]');
                const scrollSentinels = document.querySelectorAll('[class*="sentinel"], [class*="observer"], [class*="InfiniteScroll"]');
                return {
                    pagination_elements: pageNums.length,
                    load_more_buttons: loadMoreBtns.length,
                    scroll_sentinels: scrollSentinels.length,
                    has_next_page_link: !!document.querySelector('a[rel="next"]'),
                };
            }
        """)

        # Count visible product cards
        product_count_info: dict = await page.evaluate("""
            () => {
                // Try multiple common selectors for product cards
                const selectors = [
                    '[class*="product-item"]',
                    '[class*="ProductItem"]',
                    '[class*="ranking-item"]',
                    '[class*="RankingItem"]',
                    'li[class*="item"]',
                    '[data-product-no]',
                    '[data-goods-no]',
                    'article',
                ];
                const results = {};
                for (const sel of selectors) {
                    const count = document.querySelectorAll(sel).length;
                    if (count > 0) results[sel] = count;
                }
                return results;
            }
        """)

        # Attempt to extract first few items from DOM
        dom_items: list[dict] = await page.evaluate("""
            () => {
                // Common patterns for product data attributes
                const candidates = document.querySelectorAll('[data-product-no], [data-goods-no], [data-item-id]');
                const items = [];
                candidates.forEach(el => {
                    items.push({
                        tag: el.tagName,
                        classes: el.className.substring(0, 100),
                        attrs: Object.fromEntries(
                            Array.from(el.attributes)
                                .filter(a => a.name.startsWith('data-'))
                                .map(a => [a.name, a.value])
                        ),
                        text_preview: el.innerText ? el.innerText.substring(0, 200) : '',
                    });
                });
                return items.slice(0, 5);
            }
        """)

        # Category URL patterns — check what querystring params exist
        url_params: dict = await page.evaluate("""
            () => {
                const url = new URL(window.location.href);
                const params = {};
                url.searchParams.forEach((v, k) => { params[k] = v; });
                return { pathname: url.pathname, params };
            }
        """)

        # Check if categories are listed somewhere on the page (for code enumeration)
        category_links: list[dict] = await page.evaluate("""
            () => {
                const links = Array.from(document.querySelectorAll('a[href*="categoryCode"], a[href*="category"]'));
                return links.slice(0, 20).map(a => ({ href: a.href, text: a.innerText.trim() }));
            }
        """)

        # Check for ranking type tabs (main / realtime / weekly)
        ranking_tabs: list[dict] = await page.evaluate("""
            () => {
                const tabs = document.querySelectorAll('[class*="tab"], [role="tab"], nav a');
                return Array.from(tabs).slice(0, 20).map(el => ({
                    text: el.innerText.trim(),
                    href: el.href || '',
                    active: el.classList.toString().includes('active') || el.getAttribute('aria-selected') === 'true',
                }));
            }
        """)

        # Sample raw HTML snippet around first product
        html_snippet: str = await page.evaluate("""
            () => {
                const main = document.querySelector('main, #__next, [class*="ranking"]');
                return main ? main.innerHTML.substring(0, 3000) : document.body.innerHTML.substring(0, 3000);
            }
        """)

        await page.close()
        await ctx.close()
        await browser.close()

    # ── Assemble dump ───────────────────────────────────────────────────────
    dump = {
        "target_url": TARGET_URL,
        "final_url": current_url,
        "page_title": page_title,
        "timing": timing,
        "__next_data__": {
            "found": bool(captured_next_data),
            "top_keys": list(captured_next_data.keys()) if captured_next_data else [],
            "content": captured_next_data,
        },
        "api_calls": [
            {k: v for k, v in c.items() if k != "body_full"} for c in captured_api
        ],
        "api_calls_full": captured_api,
        "nav_request_count": len(nav_entries),
        "nav_requests_json": [r for r in nav_entries if "json" in r["url"].lower() or "/api/" in r["url"]],
        "pagination_info": pagination_info,
        "product_count_info": product_count_info,
        "dom_items_sample": dom_items,
        "url_params": url_params,
        "category_links_sample": category_links,
        "ranking_tabs": ranking_tabs,
        "html_snippet": html_snippet,
        "robots_txt": robots_txt,
    }

    DUMP_PATH.write_text(json.dumps(dump, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== dump saved → {DUMP_PATH} ===")
    return dump


def _truncate(obj: object, max_chars: int = 500) -> object:
    s = json.dumps(obj, ensure_ascii=False)
    if len(s) <= max_chars:
        return obj
    return s[:max_chars] + "…[truncated]"


def _summarise_findings(dump: dict) -> str:
    api_calls = dump.get("api_calls", [])
    json_apis = [c for c in api_calls if "json" in c.get("content_type", "")]
    next_data = dump["__next_data__"]
    pagination = dump["pagination_info"]
    dom_items = dump["dom_items_sample"]
    tabs = dump["ranking_tabs"]
    cats = dump["category_links_sample"]
    robots = dump["robots_txt"]

    data_source = "불명확"
    if next_data["found"]:
        data_source = f"**임베디드 JSON (`__NEXT_DATA__`)** — top keys: `{next_data['top_keys']}`"
    elif json_apis:
        data_source = f"**XHR/fetch API** — {len(json_apis)}건 캡처"
    else:
        data_source = "**SSR HTML** (JSON 없음, DOM 파싱 필요)"

    scroll_type = "불명확"
    if pagination["pagination_elements"] > 0 or pagination["has_next_page_link"]:
        scroll_type = f"페이지네이션 (`pagination_elements={pagination['pagination_elements']}`, next link={pagination['has_next_page_link']})"
    elif pagination["scroll_sentinels"] > 0 or pagination["load_more_buttons"] > 0:
        scroll_type = f"무한 스크롤 (sentinels={pagination['scroll_sentinels']}, load-more buttons={pagination['load_more_buttons']})"

    dom_fields: list[str] = []
    for item in dom_items:
        dom_fields.extend(item.get("attrs", {}).keys())
    dom_fields = sorted(set(dom_fields))

    api_table = ""
    if json_apis:
        api_table = "\n".join(
            f"| `{c['url'][:100]}` | {c['status']} |" for c in json_apis[:10]
        )
        api_table = f"\n| URL | Status |\n|---|---|\n{api_table}"

    tab_list = "\n".join(
        f"  - `{t['text']}` href=`{t['href'][:80]}` active={t['active']}`"
        for t in tabs if t["text"]
    )

    cat_list = "\n".join(
        f"  - `{c['text']}` → `{c['href'][:100]}`"
        for c in cats[:15] if c["text"]
    )

    robots_relevant = "\n".join(
        line for line in robots.splitlines()
        if any(kw in line.lower() for kw in ["disallow", "allow", "crawl", "user-agent", "ranking"])
    )

    return f"""# 무신사 랭킹 페이지 구조 조사 결과

> 조사일: 2026-05-14
> 대상 URL: `{dump["target_url"]}`
> 최종 URL (리다이렉트 후): `{dump["final_url"]}`
> 페이지 타이틀: {dump["page_title"]}
> 로드 시간: {dump["timing"].get("goto_sec")}s

---

## 1. 데이터 공급 방식

{data_source}

### 캡처된 JSON API 호출 ({len(json_apis)}건){api_table}

### `__NEXT_DATA__` 최상위 키
```
{json.dumps(next_data["top_keys"], ensure_ascii=False, indent=2)}
```

---

## 2. 페이지네이션 vs 무한 스크롤

{scroll_type}

| 항목 | 값 |
|---|---|
| pagination_elements | {pagination["pagination_elements"]} |
| load_more_buttons | {pagination["load_more_buttons"]} |
| scroll_sentinels | {pagination["scroll_sentinels"]} |
| has_next_page_link | {pagination["has_next_page_link"]} |

---

## 3. 상품 카드 셀렉터 후보

DOM에서 발견된 상품 카드 셀렉터 (개수 기준):

```json
{json.dumps(dump["product_count_info"], ensure_ascii=False, indent=2)}
```

### data-* 속성 (첫 5개 카드):

```
{json.dumps(dom_items, ensure_ascii=False, indent=2)[:2000]}
```

---

## 4. URL 구조 및 카테고리 코드 체계

현재 URL 파라미터:
```json
{json.dumps(dump["url_params"], ensure_ascii=False, indent=2)}
```

페이지에서 발견된 카테고리 링크 샘플:
{cat_list if cat_list else "(없음)"}

---

## 5. 랭킹 탭 구조 (main / realtime / weekly 등)

{tab_list if tab_list else "(탭 없음 또는 감지 실패)"}

---

## 6. robots.txt 발췌 (관련 규칙)

```
{robots_relevant if robots_relevant else robots[:800]}
```

---

## 7. HTML 구조 스니펫 (main 영역 첫 3000자)

```html
{dump["html_snippet"][:3000]}
```

---

## 8. 스크래퍼 구현 시사점

- **데이터 소스**: {data_source}
- **페이징**: {scroll_type}
- **DOM 데이터 속성**: `{dom_fields}`
- **주의사항**:
  - playwright-stealth 설치 버전이 v2.0.3으로, `stealth_async()` API 대신 `Stealth().apply_stealth_async(page)` 사용 필요 → `base.py` 수정 필요
  - 카테고리 코드 체계는 위 URL 파라미터 섹션에서 실제 값 확인 요망
"""


async def main() -> None:
    dump = await investigate()
    findings_md = _summarise_findings(dump)
    FINDINGS_PATH.write_text(findings_md, encoding="utf-8")
    print(f"=== findings saved → {FINDINGS_PATH} ===")
    print("\n--- FINDINGS 요약 (처음 2000자) ---")
    print(findings_md[:2000])


if __name__ == "__main__":
    asyncio.run(main())
