"""
Temporary investigation script — DO NOT use in production.

목적: 무신사 상품 상세 페이지 구조 파악 — 11개 필드 위치 확인
출력:
  worker/scrapers/_investigate_product_dump.json
  worker/scrapers/_investigate_product_findings.md

실행: python3 worker/scrapers/_investigate_product.py
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from pathlib import Path
from typing import Any

import httpx
from playwright.async_api import Response, async_playwright
from playwright_stealth import Stealth

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
USER_AGENT = "B.CAVE-Competitor-Radar/1.0 (internal analytics)"
MIN_DELAY_SEC = 3.0
TIMEOUT_MS = 45_000

CATEGORIES = [
    {"code": "001", "name": "상의"},
    {"code": "003", "name": "바지"},
    {"code": "004", "name": "가방"},
]

RANKING_API = (
    "https://client.musinsa.com/api/home/web/v5/pans/ranking/sections/200"
)
RANKING_REFERER = "https://www.musinsa.com/main/musinsa/ranking"

DUMP_PATH = Path(__file__).parent / "_investigate_product_dump.json"
FINDINGS_PATH = Path(__file__).parent / "_investigate_product_findings.md"

# 11개 필드별 검색 키워드 (API 응답 본문 + URL 에서 탐색)
FIELD_KEYWORDS: dict[str, list[str]] = {
    "wishlist_count": ["wish", "likeCount", "wishCount", "wishlist", "좋아요"],
    "brand_like_count": ["brandLike", "brandFollow", "follower", "brandLikeCount"],
    "main_image_url": [
        "representImage",
        "mainImage",
        "goodsImage",
        "imageUrl",
        "images",
    ],
    "similar_products": ["similar", "relatedGoods", "related", "similarGoods"],
    "also_viewed_products": ["alsoViewed", "also_viewed", "otherCustomers", "browseAlso"],
    "tags": ["tag", "keyword", "hashTag", "tags"],
    "description": ["description", "goodsDetail", "material", "detail"],
    "snap": ["snap", "styleSnap", "snapFeed", "styleFeed"],
    "ai_review_summary": ["aiReview", "reviewSummary", "aiSummary", "summarize"],
    "review_keyword_scores": ["reviewKeyword", "reviewEvaluation", "keywordScore"],
    "review_meta": ["rating", "starScore", "ratingDistribution", "reviewCount"],
}

BOT_INDICATORS = ["비정상적인 접근", "보안 점검", "captcha", "access denied"]

# DOM에서 필드 키 → dom 결과 키 매핑
FIELD_TO_DOM_KEY: dict[str, str | None] = {
    "wishlist_count": "wishlist",
    "brand_like_count": "brand_like",
    "main_image_url": "images",
    "similar_products": "similar",
    "also_viewed_products": None,
    "tags": "tags",
    "description": "description",
    "snap": "snap",
    "ai_review_summary": "ai_review",
    "review_keyword_scores": "review_keyword",
    "review_meta": "rating_dist",
}

# ---------------------------------------------------------------------------
# DOM 분석 JS (상품 상세 페이지 — 11개 필드 위치 탐색)
# ---------------------------------------------------------------------------
_DOM_JS = """
() => {
    const qone = s => document.querySelector(s);
    const qall = s => Array.from(document.querySelectorAll(s));
    const txt  = el => el?.innerText?.trim()?.substring(0, 200) ?? null;
    const cls  = el => {
        const c = el?.className;
        return (typeof c === 'string' ? c : String(c ?? '')).substring(0, 120);
    };

    // 1. wishlist_count
    const wishEl = qone(
        '[class*="wish"], [class*="likeCount"], ' +
        '[aria-label*="위시"], [aria-label*="찜"], [class*="like-btn"]'
    );

    // 2. brand_like_count / follow
    const brandLikeEl = qone(
        '[class*="brand-like"], [class*="brandLike"], [class*="brand-follow"]'
    );

    // 3. main_image + gallery images
    const imgEls = qall(
        'img[class*="product"], img[class*="goods"], ' +
        '[class*="gallery"] img, [class*="swiper-slide"] img, ' +
        '[class*="ProductImages"] img'
    ).slice(0, 10);

    // 4. similar / related products widget
    const similarEl = qone(
        '[class*="similar"], [class*="relat"], [class*="recommend"]'
    );

    // 5. tags / keywords
    const tagEls = qall(
        '[class*="tag-item"], [class*="keyword-item"], ' +
        '[class*="hashTag"], [class*="TagItem"]'
    ).slice(0, 15);

    // 6. description / detail
    const descEl = qone(
        '[class*="description"], [class*="goods-detail"], ' +
        '[class*="goodsDetail"], [class*="product-detail"], ' +
        '[class*="ProductDetail"]'
    );

    // 7. snap / style feed
    const snapEl = qone(
        '[class*="snap"], [class*="style-snap"], ' +
        '[class*="styleFeed"], [class*="StyleSnap"]'
    );

    // 8. AI review summary
    const aiEl = qone(
        '[class*="ai-review"], [class*="aiReview"], ' +
        '[class*="review-summary"], [class*="reviewSummary"], ' +
        '[class*="AiReview"]'
    );

    // 9. Review keyword scores (구매평 키워드별 점수)
    const rkEl = qone(
        '[class*="keyword-review"], [class*="review-keyword"], ' +
        '[class*="keywordScore"], [class*="ReviewKeyword"]'
    );

    // 10. Rating distribution (별점 분포 — 메타 only, 텍스트·작성자 수집 안 함)
    const ratingDistEl = qone(
        '[class*="rating-dist"], [class*="ratingDist"], ' +
        '[class*="star-dist"], [class*="RatingDist"]'
    );
    // 일반 별점 래퍼
    const ratingEls = qall(
        '[class*="rating-wrap"], [class*="star-score"], [class*="review-score"]'
    ).slice(0, 5);

    // JSON-LD 구조화 데이터
    const jsonLd = qall('script[type="application/ld+json"]').map(el => {
        try { return JSON.parse(el.textContent); } catch(e) { return null; }
    }).filter(Boolean);

    // script[id] 목록 (__NEXT_DATA__ 외 다른 embedded JSON 확인)
    const scriptIds = qall('script[id]').map(s => ({
        id: s.id,
        len: s.textContent?.length ?? 0
    }));

    return {
        wishlist:      wishEl      ? { cls: cls(wishEl), txt: txt(wishEl) }                 : null,
        brand_like:    brandLikeEl ? { cls: cls(brandLikeEl), txt: txt(brandLikeEl) }       : null,
        images:        imgEls.map(img => ({ src: img.src?.substring(0, 200), alt: img.alt })),
        similar:       similarEl   ? { cls: cls(similarEl), txt: txt(similarEl),
                                        children: similarEl.children.length }               : null,
        tags:          tagEls.map(el => txt(el)).filter(Boolean),
        description:   descEl      ? { cls: cls(descEl), txt: txt(descEl) }                 : null,
        snap:          snapEl       ? { cls: cls(snapEl), txt: txt(snapEl),
                                        children: snapEl.children.length }                  : null,
        ai_review:     aiEl         ? { cls: cls(aiEl), txt: txt(aiEl) }                    : null,
        review_keyword: rkEl        ? { cls: cls(rkEl), txt: txt(rkEl) }                    : null,
        rating_dist:   ratingDistEl ? { cls: cls(ratingDistEl), txt: txt(ratingDistEl) }    : null,
        rating_els:    ratingEls.map(el => ({ cls: cls(el), txt: txt(el) })),
        json_ld:       jsonLd,
        script_ids:    scriptIds,
        page_title:    document.title,
        og: {
            image: qone('meta[property="og:image"]')?.getAttribute('content')?.substring(0, 200),
            title: qone('meta[property="og:title"]')?.getAttribute('content')?.substring(0, 200),
        },
    };
}
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _truncate(obj: Any, max_chars: int = 5_000) -> Any:
    s = json.dumps(obj, ensure_ascii=False)
    if len(s) <= max_chars:
        return obj
    return s[:max_chars] + "…[truncated]"


def _body_has(body: Any, keywords: list[str]) -> bool:
    s = json.dumps(body, ensure_ascii=False).lower()
    return any(kw.lower() in s for kw in keywords)


def _url_has(url: str, keywords: list[str]) -> bool:
    url_l = url.lower()
    return any(kw.lower() in url_l for kw in keywords)


def _make_handler(buf: list[dict]) -> Any:
    """on_response 콜백 팩토리 — buf 에 JSON 응답을 수집."""

    async def _handler(resp: Response) -> None:
        ct = resp.headers.get("content-type", "")
        if "json" not in ct or resp.status >= 400:
            return
        try:
            body = await resp.json()
            buf.append(
                {
                    "url": resp.url,
                    "status": resp.status,
                    "body": _truncate(body, 5_000),
                }
            )
            print(f"  [XHR] {resp.status} {resp.url[:120]}")
        except Exception:
            pass

    return _handler


# ---------------------------------------------------------------------------
# Phase 1 — 랭킹 API 에서 카테고리별 rank=1 상품 확보
# ---------------------------------------------------------------------------


async def fetch_rank1_by_category() -> list[dict]:
    """3개 카테고리에서 rank=1 상품을 httpx 로 수집 (브라우저 불필요)."""
    results: list[dict] = []

    async with httpx.AsyncClient(
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json, */*",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Referer": RANKING_REFERER,
        },
        timeout=30.0,
        follow_redirects=True,
    ) as client:
        for cat in CATEGORIES:
            code = cat["code"]
            params = {
                "storeCode": "musinsa",
                "categoryCode": code,
                "contentsId": "",
                "period": "REALTIME",
                "gf": "A",
            }
            print(f"\n[랭킹 API] categoryCode={code} ({cat['name']}) →")
            resp = await client.get(RANKING_API, params=params)
            print(f"  HTTP {resp.status_code}")

            if resp.status_code != 200:
                results.append(
                    {
                        "category_code": code,
                        "category_name": cat["name"],
                        "error": f"HTTP {resp.status_code}",
                    }
                )
                await asyncio.sleep(MIN_DELAY_SEC + random.random() * 1.5)
                continue

            data = resp.json()
            rank1: dict | None = None
            for module in data.get("data", {}).get("modules", []):
                if module.get("type") != "MULTICOLUMN":
                    continue
                for item in module.get("items", []):
                    if (
                        item.get("type") == "PRODUCT_COLUMN"
                        and item.get("image", {}).get("rank") == 1
                    ):
                        rank1 = item
                        break
                if rank1:
                    break

            if rank1 is None:
                results.append(
                    {
                        "category_code": code,
                        "category_name": cat["name"],
                        "error": "rank=1 not found",
                    }
                )
            else:
                mno: str = rank1["id"]
                info = rank1.get("info", {})
                image = rank1.get("image", {})
                amp: dict = (
                    image.get("onClickLike", {})
                    .get("eventLog", {})
                    .get("amplitude", {})
                    .get("payload", {})
                )
                entry: dict = {
                    "category_code": code,
                    "category_name": cat["name"],
                    "musinsa_no": mno,
                    "product_url": f"https://www.musinsa.com/products/{mno}",
                    "brand_name": info.get("brandName", ""),
                    "product_name": info.get("productName", ""),
                    "thumbnail_url": image.get("url", ""),
                    "rank1_item": _truncate(rank1, 3_000),
                    "brand_slug": amp.get("brand_id", ""),
                    "review_score_raw": amp.get("reviewScore"),
                }
                results.append(entry)
                print(
                    f"  → no={mno} | {info.get('brandName')} / {info.get('productName')}"
                )

            await asyncio.sleep(MIN_DELAY_SEC + random.random() * 1.5)

    return results


# ---------------------------------------------------------------------------
# Phase 2 — Playwright 로 상품 상세 페이지 조사
# ---------------------------------------------------------------------------


async def investigate_products(rank1_items: list[dict]) -> list[dict]:
    """상품 상세 페이지 최대 3개를 Playwright 로 순차 조사."""
    valid = [r for r in rank1_items if "musinsa_no" in r]
    if not valid:
        print("⚠ 유효한 상품 없음 — 랭킹 API 실패 확인 요망")
        return []

    results: list[dict] = []

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

        for item in valid:
            mno = item["musinsa_no"]
            cat_name = item["category_name"]
            url = item["product_url"]
            print(f"\n[상세 조사] {url}  ({cat_name})")

            captured: list[dict] = []
            page = await ctx.new_page()
            page.on("response", _make_handler(captured))

            bot_blocked = False
            entry: dict = {
                "musinsa_no": mno,
                "category_code": item["category_code"],
                "category_name": cat_name,
                "url": url,
            }

            try:
                t0 = time.monotonic()
                # "load" 사용 — "networkidle" 은 YouTube/분석 SDK 지속 연결이 있으면 timeout 발생
                try:
                    await page.goto(url, timeout=TIMEOUT_MS, wait_until="load")
                    elapsed = time.monotonic() - t0
                    print(f"  → 로드 {elapsed:.1f}s, XHR {len(captured)}건 캡처")
                except Exception as goto_exc:
                    elapsed = time.monotonic() - t0
                    print(
                        f"  ⚠ goto {goto_exc.__class__.__name__} ({elapsed:.1f}s) — "
                        f"XHR {len(captured)}건 캡처 후 계속 진행"
                    )

                # 봇 차단 체크
                try:
                    page_text = (await page.content()).lower()
                    if any(ind in page_text for ind in BOT_INDICATORS):
                        bot_blocked = True
                        print("  ⚠⚠ 봇 차단 감지! 중단.")
                except Exception:
                    pass

                if not bot_blocked:
                    # "load" 이후 비동기 XHR 완료 대기 (스냅·AI후기·리뷰 등 지연 가능)
                    await asyncio.sleep(4.0 + random.random() * 2.0)

                    # 하단까지 스크롤 (지연 로딩 트리거)
                    prev_h = -1
                    for _ in range(6):
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        await asyncio.sleep(1.5 + random.random() * 0.8)
                        curr_h: int = await page.evaluate("document.body.scrollHeight")
                        if curr_h == prev_h:
                            break
                        prev_h = curr_h

                    # 스크롤 후 추가 API 호출 완료 대기
                    await asyncio.sleep(2.0)
                    print(f"  → 스크롤 후 총 XHR {len(captured)}건")

                    # __NEXT_DATA__ 추출
                    next_raw: str = await page.evaluate(
                        "() => { const el = document.getElementById('__NEXT_DATA__');"
                        " return el ? el.textContent : ''; }"
                    )
                    next_data: dict = {}
                    if next_raw:
                        try:
                            next_data = json.loads(next_raw)
                            print(
                                f"  [__NEXT_DATA__] {len(next_raw):,} chars  "
                                f"keys={list(next_data.keys())[:6]}"
                            )
                        except Exception:
                            print("  [__NEXT_DATA__] 파싱 실패")
                    else:
                        print("  [__NEXT_DATA__] 없음")

                    # DOM 분석
                    dom: dict = {}
                    try:
                        dom = await page.evaluate(_DOM_JS)
                    except Exception as dom_exc:
                        print(f"  ⚠ DOM 분석 에러: {dom_exc}")

                    entry.update(
                        {
                            "final_url": page.url,
                            "bot_blocked": False,
                            "captured_api_count": len(captured),
                            "captured_api": captured,
                            "next_data": {
                                "found": bool(next_data),
                                "size_chars": len(next_raw) if next_raw else 0,
                                "top_keys": list(next_data.keys())[:10],
                                "page_props_keys": list(
                                    next_data.get("props", {})
                                    .get("pageProps", {})
                                    .keys()
                                )[:20],
                                "content": _truncate(next_data, 5_000),
                            },
                            "dom": dom,
                        }
                    )
                else:
                    entry.update(
                        {
                            "bot_blocked": True,
                            "captured_api_count": len(captured),
                            "captured_api": captured,
                        }
                    )

            except Exception as exc:
                print(f"  ⚠ 치명적 에러: {exc}")
                entry.update(
                    {
                        "bot_blocked": bot_blocked,
                        "error": str(exc),
                        "captured_api_count": len(captured),
                        "captured_api": captured,
                    }
                )
            finally:
                await page.close()

            results.append(entry)

            if entry.get("bot_blocked"):
                print("봇 차단으로 나머지 조사 중단.")
                break

            # 상품 간 rate limit
            await asyncio.sleep(MIN_DELAY_SEC + random.random() * 1.5)

        await ctx.close()
        await browser.close()

    return results


# ---------------------------------------------------------------------------
# Phase 3 — 11개 필드 분석
# ---------------------------------------------------------------------------


def _analyze_field(field: str, products: list[dict]) -> dict:
    """하나의 필드에 대해 3개 상품 데이터를 분석."""
    keywords = FIELD_KEYWORDS[field]
    dom_key = FIELD_TO_DOM_KEY[field]
    per_product: list[dict] = []

    for p in products:
        if p.get("bot_blocked") or "error" in p:
            continue

        # API 응답에서 탐색
        api_hits: list[str] = []
        for api in p.get("captured_api", []):
            body_match = _body_has(api.get("body", {}), keywords)
            url_match = _url_has(api.get("url", ""), keywords)
            if body_match or url_match:
                api_hits.append(api["url"][:150])

        # __NEXT_DATA__ 탐색
        nd_content = p.get("next_data", {}).get("content", {})
        nd_hit = _body_has(nd_content, keywords) if isinstance(nd_content, dict) else False

        # DOM 탐색
        dom = p.get("dom", {})
        dom_val = dom.get(dom_key) if dom_key else None
        dom_hit = bool(dom_val) and (
            (isinstance(dom_val, dict) and (dom_val.get("txt") or dom_val.get("cls")))
            or (isinstance(dom_val, list) and len(dom_val) > 0)
        )

        per_product.append(
            {
                "category": p["category_name"],
                "musinsa_no": p["musinsa_no"],
                "api_hits": api_hits[:3],
                "nd_hit": nd_hit,
                "dom_hit": dom_hit,
                "dom_sample": str(dom_val)[:120] if dom_val else None,
            }
        )

    if not per_product:
        return {
            "source": "확인 불가",
            "calls": "—",
            "path": "—",
            "confidence": "확인 불가",
            "notes": "조사 실패 (봇 차단 또는 에러)",
            "per_product": [],
        }

    any_api = any(r["api_hits"] for r in per_product)
    any_nd = any(r["nd_hit"] for r in per_product)
    any_dom = any(r["dom_hit"] for r in per_product)
    all_found = all(r["api_hits"] or r["nd_hit"] or r["dom_hit"] for r in per_product)

    # 출처 결정
    if any_api:
        all_urls = sorted({u for r in per_product for u in r["api_hits"]})
        # 상품 상세 URL이면 메인 1회, 별도 엔드포인트면 추가 1회
        product_urls = [u for u in all_urls if "/products/" in u]
        other_urls = [u for u in all_urls if "/products/" not in u]
        calls = "1회 (메인 페이지)" if product_urls and not other_urls else "추가 1회+"
        source = "REST API"
        path = (other_urls[0] if other_urls else product_urls[0])[:100]
        confidence = "확인됨" if all_found else "추정"
        notes = f"API URL: {path[:80]}"
    elif any_nd:
        source = "__NEXT_DATA__ 임베디드"
        calls = "1회 (메인 페이지)"
        path = "props.pageProps.*"
        confidence = "추정"
        notes = "keyword 매칭 — 정확한 경로는 dump 확인"
    elif any_dom:
        source = "DOM 셀렉터"
        calls = "1회 (메인 페이지)"
        dom_samples = [r["dom_sample"] for r in per_product if r.get("dom_sample")]
        path = dom_samples[0][:80] if dom_samples else "(클래스 패턴)"
        confidence = "추정"
        notes = "DOM 매칭 — class 기반, 변경 가능성 있음"
    else:
        source = "확인 불가"
        calls = "—"
        path = "—"
        confidence = "확인 불가"
        notes = "3개 상품 모두에서 미발견 — 앱 전용이거나 추가 스크롤 필요"

    return {
        "source": source,
        "calls": calls,
        "path": path,
        "confidence": confidence,
        "notes": notes,
        "per_product": per_product,
    }


def _analyze_all_fields(products: list[dict]) -> dict[str, dict]:
    return {field: _analyze_field(field, products) for field in FIELD_KEYWORDS}


# ---------------------------------------------------------------------------
# Phase 4 — findings.md 생성
# ---------------------------------------------------------------------------

_FIELD_LABELS = {
    "wishlist_count": "wishlist_count",
    "brand_like_count": "brand_like_count",
    "main_image_url": "main_image_url + 갤러리",
    "similar_products": "similar_products",
    "also_viewed_products": "also_viewed_products",
    "tags": "tags",
    "description": "description",
    "snap": "snap",
    "ai_review_summary": "ai_review_summary",
    "review_keyword_scores": "review_keyword_scores",
    "review_meta": "review_meta ⚠메타only",
}


def _build_findings_md(
    rank1_items: list[dict],
    products: list[dict],
    field_analysis: dict[str, dict],
) -> str:
    import datetime

    today = datetime.date.today().isoformat()
    # captured_api 가 있으면 분석에 포함 (DOM 에러가 있어도 API 데이터로 분석 가능)
    ok_products = [
        p for p in products
        if not p.get("bot_blocked") and p.get("captured_api_count", 0) > 0
    ]
    bot_blocked_any = any(p.get("bot_blocked") for p in products)

    # §1 상품 URL 패턴
    sec1_lines = ["| 카테고리 | musinsa_no | 상품명 | URL |", "|---|---|---|---|"]
    for item in rank1_items:
        if "musinsa_no" not in item:
            sec1_lines.append(
                f"| {item['category_name']} | — | (수집 실패) | {item.get('error', '')} |"
            )
        else:
            name = (item.get("product_name") or "")[:30]
            sec1_lines.append(
                f"| {item['category_name']} | {item['musinsa_no']} "
                f"| {name} | {item['product_url']} |"
            )
    sec1 = "\n".join(sec1_lines)

    # §2 데이터 소스 매핑 표
    confirmed = sum(
        1 for v in field_analysis.values() if v["confidence"] == "확인됨"
    )
    inferred = sum(
        1 for v in field_analysis.values() if v["confidence"] == "추정"
    )
    not_found = sum(
        1 for v in field_analysis.values() if v["confidence"] == "확인 불가"
    )

    table_rows = ["| # | 필드 | 출처 | 호출 수 | JSON 경로 / 셀렉터 | 신뢰도 | 비고 |"]
    table_rows.append("|---|---|---|---|---|---|---|")
    for i, (field, label) in enumerate(_FIELD_LABELS.items(), 1):
        fa = field_analysis[field]
        table_rows.append(
            f"| {i} | `{label}` | {fa['source']} | {fa['calls']} "
            f"| `{fa['path'][:60]}` | {fa['confidence']} | {fa['notes'][:60]} |"
        )
    sec2 = "\n".join(table_rows)

    # §2 per-product 상세
    per_product_blocks: list[str] = []
    for field, label in _FIELD_LABELS.items():
        fa = field_analysis[field]
        pp = fa.get("per_product", [])
        if not pp:
            continue
        lines = [f"#### `{label}`"]
        for r in pp:
            status = "O API" if r["api_hits"] else ("O ND" if r["nd_hit"] else ("O DOM" if r["dom_hit"] else "X"))
            hits = ", ".join(r["api_hits"][:2]) if r["api_hits"] else (r.get("dom_sample") or "—")[:80]
            lines.append(f"  - {r['category']} ({r['musinsa_no']}): **{status}** — `{hits}`")
        per_product_blocks.append("\n".join(lines))
    sec2_detail = "\n\n".join(per_product_blocks)

    # §3 추출 비용 분석
    main_page_fields = sum(
        1 for v in field_analysis.values() if "추가" not in v["calls"] and v["calls"] != "—"
    )
    extra_call_fields = sum(
        1 for v in field_analysis.values() if "추가" in v["calls"]
    )
    calls_per_product = 1 + extra_call_fields
    time_per_product = calls_per_product * MIN_DELAY_SEC + calls_per_product * 3  # load + delay
    time_300 = int(300 * time_per_product / 60)

    # §4 카테고리별 차이
    cat_diff_lines: list[str] = []
    if len(ok_products) >= 2:
        cat_diff_lines.append("| 카테고리 | XHR 캡처 수 | __NEXT_DATA__ | DOM 이미지 수 |")
        cat_diff_lines.append("|---|---|---|---|")
        for p in ok_products:
            nd_found = p.get("next_data", {}).get("found", False)
            img_count = len(p.get("dom", {}).get("images", []))
            cat_diff_lines.append(
                f"| {p['category_name']} ({p['musinsa_no']}) "
                f"| {p.get('captured_api_count', '?')} "
                f"| {'있음' if nd_found else '없음'} "
                f"| {img_count} |"
            )
        sec4 = "\n".join(cat_diff_lines)
    else:
        sec4 = "(조사 성공 상품이 2개 미만 — 카테고리 비교 불가)"

    # §5 권장 정책
    tier1 = [
        f for f, v in field_analysis.items()
        if v["confidence"] == "확인됨" and "추가" not in v["calls"]
    ]
    tier2 = [
        f for f, v in field_analysis.items()
        if v["confidence"] == "추정" or "추가" in v["calls"]
    ]
    tier3 = [f for f, v in field_analysis.items() if v["confidence"] == "확인 불가"]

    # §6 위험·이슈
    risk_lines: list[str] = []
    if bot_blocked_any:
        risk_lines.append("- **봇 차단 감지됨** — 일부 상품 페이지 조사 실패. 실제 스크래퍼에서 User-Agent·딜레이 재검토 필요.")
    nd_found_any = any(p.get("next_data", {}).get("found") for p in ok_products)
    if not nd_found_any:
        risk_lines.append("- `__NEXT_DATA__` 미발견 — 상품 상세 페이지는 클라이언트 렌더링. DOM 파싱 의존도 높을 수 있음.")
    total_xhr = sum(p.get("captured_api_count", 0) for p in ok_products)
    if total_xhr == 0:
        risk_lines.append("- **XHR 캡처 0건** — networkidle 전에 응답이 끝났거나 캡처 로직 문제. dump 확인 요망.")
    risk_lines.append("- 스냅·AI후기·리뷰 키워드는 하단 스크롤 후 지연 로딩될 가능성 있음 → 충분한 대기 필요.")
    risk_lines.append("- `review_meta` (§11): 별점 분포·작성일자만 수집. 리뷰 본문·작성자 닉네임·ID는 수집 금지.")
    if not risk_lines:
        risk_lines.append("- 조사 범위에서 특이 이슈 없음.")
    sec6 = "\n".join(risk_lines)

    return f"""# 무신사 상품 상세 페이지 구조 조사 결과

> 조사일: {today}
> 조사 대상: 3개 카테고리 rank=1 상품 (상의·바지·가방)
> 봇 차단 여부: {'감지됨 ⚠' if bot_blocked_any else '없음 ✓'}
> 조사 성공 상품 수: {len(ok_products)} / {len(products)}

---

## 1. 상세 페이지 URL 패턴

```
https://www.musinsa.com/products/{{musinsa_no}}
```

{sec1}

- 모바일 전용 URL 차이: 미확인 (데스크톱 viewport 1920×1080 사용)
- 리다이렉트: 각 상품 final_url 은 dump 참조

---

## 2. 데이터 소스 매핑 (11개)

> **요약**: 확인됨 {confirmed}개 / 추정 {inferred}개 / 확인 불가 {not_found}개

{sec2}

### 2-1. 상품별 상세 히트 기록

{sec2_detail}

---

## 3. 추출 비용 분석

| 항목 | 값 |
|---|---|
| 메인 페이지 1회 로드로 확보 가능 필드 | {main_page_fields}개 |
| 추가 별도 API 호출이 필요한 필드 | {extra_call_fields}개 |
| 상품 1개당 총 호출 수 | {calls_per_product}회 |
| 3초 간격 기준 상품 1개 처리 시간 | 약 {time_per_product:.0f}초 |
| 하루 300개 처리 시 총 시간 | 약 {time_300}분 ({time_300 // 60}시간 {time_300 % 60}분) |
| 봇 차단 위험 | {'높음 (이번 조사에서 차단 발생)' if bot_blocked_any else '낮음 (이번 조사 차단 없음)'} |

---

## 4. 카테고리별 차이

{sec4}

- 구조적 차이 (사이즈 옵션 등): dump 의 captured_api 응답 내 product 객체에서 확인 필요
- 공통 필드 여부: 3개 카테고리 모두 조사 시 동일 엔드포인트 패턴 사용 확인 필요

---

## 5. 권장 1차 수집 정책

### 1차 수집 (즉시 구현 — 호출 비용 낮음, 신뢰도 높음)

{chr(10).join(f'- `{f}`' for f in tier1) if tier1 else '- (없음 — 추가 검증 필요)'}

### 2차 수집 (검증 후 구현 — 추정 또는 추가 호출 필요)

{chr(10).join(f'- `{f}`' for f in tier2) if tier2 else '- (없음)'}

### 보류 (확인 불가 — 앱 전용이거나 구조 변경 가능성)

{chr(10).join(f'- `{f}`' for f in tier3) if tier3 else '- (없음)'}

### 봇 위험 완화 방안

- 상품 간 딜레이 최소 3초 + 최대 1.5초 지터 (현행 유지)
- 동시성 1 (순차 처리) 유지
- Playwright + playwright-stealth (이번 조사와 동일)
- 하루 처리량 300개 이하 유지

---

## 6. 발견된 위험·이슈

{sec6}

---

> 원본 데이터: `worker/scrapers/_investigate_product_dump.json`
> 다음 단계: findings §2·§5 기반으로 `worker/scrapers/musinsa_product.py` 설계
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    print("=" * 60)
    print("무신사 상품 상세 페이지 조사 시작")
    print("=" * 60)

    # Phase 1: rank-1 상품 확보
    print("\n[Phase 1] 랭킹 API → rank=1 상품 3개 수집")
    rank1_items = await fetch_rank1_by_category()
    print(f"  → {len([r for r in rank1_items if 'musinsa_no' in r])}개 확보")

    # Phase 2: 상세 페이지 조사
    print("\n[Phase 2] 상품 상세 페이지 Playwright 조사")
    product_results = await investigate_products(rank1_items)

    # Phase 3: 11개 필드 분석
    print("\n[Phase 3] 11개 필드 분석")
    ok = [p for p in product_results if not p.get("bot_blocked") and "error" not in p]
    field_analysis = _analyze_all_fields(ok)

    for field, fa in field_analysis.items():
        print(f"  {field:28s}: {fa['confidence']:10s} | {fa['source']}")

    # 출력 파일 저장
    dump = {
        "rank1_items": rank1_items,
        "product_results": product_results,
        "field_analysis": field_analysis,
    }
    DUMP_PATH.write_text(json.dumps(dump, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== dump → {DUMP_PATH} ===")

    findings_md = _build_findings_md(rank1_items, product_results, field_analysis)
    FINDINGS_PATH.write_text(findings_md, encoding="utf-8")
    print(f"=== findings → {FINDINGS_PATH} ===")

    print("\n--- findings 요약 ---")
    print(findings_md[:3000])


if __name__ == "__main__":
    asyncio.run(main())
