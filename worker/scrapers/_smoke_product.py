"""
Smoke test for MusinsaProductScraper.
실행: python3 -m scrapers._smoke_product  (worker/ 디렉토리에서)
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

from scrapers.musinsa_product import MusinsaProductScraper  # noqa: E402

RANKING_API = "https://client.musinsa.com/api/home/web/v5/pans/ranking/sections/200"
USER_AGENT = "B.CAVE-Competitor-Radar/1.0 (internal analytics)"

# deny-list hit counter (loguru 인터셉트)
_deny_hits: list[str] = []

from loguru import logger  # noqa: E402

logger.remove()  # 기본 stderr 제거


def _sink(msg: str) -> None:
    rec = msg.strip()
    print(rec, file=sys.stderr)
    if "privacy_response_discarded" in rec:
        _deny_hits.append(rec)


logger.add(_sink, format="{time:HH:mm:ss} {level} {message} {extra}", level="DEBUG")


# ---------------------------------------------------------------------------
# Phase 1 — 랭킹 API 로 상의(001) TOP 3 musinsa_no 확보
# ---------------------------------------------------------------------------

async def fetch_top3(category_code: str = "001") -> list[str]:
    params = {
        "storeCode": "musinsa",
        "categoryCode": category_code,
        "contentsId": "",
        "period": "REALTIME",
        "gf": "A",
    }
    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=20.0,
        follow_redirects=True,
    ) as client:
        resp = await client.get(RANKING_API, params=params)
        resp.raise_for_status()

    nos: list[str] = []
    for module in resp.json().get("data", {}).get("modules", []):
        if module.get("type") != "MULTICOLUMN":
            continue
        for item in module.get("items", []):
            if item.get("type") == "PRODUCT_COLUMN":
                nos.append(str(item["id"]))
                if len(nos) == 3:
                    return nos
    return nos


# ---------------------------------------------------------------------------
# Phase 2 — 스크래퍼 실행
# ---------------------------------------------------------------------------

async def main() -> None:
    print("=" * 65)
    print("MusinsaProductScraper 실행 검증")
    print("=" * 65)

    # TOP 3 확보
    print("\n[Phase 1] 랭킹 API → 상의(001) TOP 3")
    nos = await fetch_top3("001")
    print(f"  musinsa_nos: {nos}")
    if len(nos) < 3:
        print("  ⚠ TOP 3 확보 실패 — 종료")
        return

    # 스크래퍼 실행
    print("\n[Phase 2] MusinsaProductScraper 실행 (3개 순차)")
    t_start = time.monotonic()
    timings: list[float] = []
    results: list[dict] = []
    bot_blocked = False
    error_msg: str | None = None

    try:
        async with MusinsaProductScraper() as scraper:
            for mno in nos:
                t0 = time.monotonic()
                r = await scraper.scrape([mno])
                elapsed = time.monotonic() - t0
                timings.append(elapsed)
                results.extend(r)
                print(f"  [{mno}] {elapsed:.1f}s — fields: {[k for k,v in r[0].items() if v is not None and k not in ('musinsa_no','scraped_at')] if r else 'EMPTY'}")
    except Exception as exc:
        bot_blocked = "BotBlockedError" in type(exc).__name__
        error_msg = str(exc)
        print(f"\n  ⚠ 예외 발생: {type(exc).__name__}: {exc}")

    total_elapsed = time.monotonic() - t_start

    # ---------------------------------------------------------------
    # 보고
    # ---------------------------------------------------------------
    print("\n" + "=" * 65)
    print("== A) 봇 차단 여부")
    if bot_blocked:
        print(f"  BotBlockedError 발생 — {error_msg}")
    elif error_msg:
        print(f"  기타 오류 — {error_msg}")
    else:
        print("  정상 완료 (봇 차단 없음)")

    print("\n== B) 필드 채움 표")
    header = (
        "| musinsa_no | wishlist | brand_like | tags수 | similar수 | snap수 "
        "| ai_summary | keyword수 | review_total | rating_dist |"
    )
    sep = "|" + "|".join(["-" * len(h) for h in header.split("|")[1:-1]]) + "|"
    print(header)
    print(sep)

    field_matrix: dict[str, dict[str, bool]] = {}
    for r in results:
        mno = r["musinsa_no"]
        wl = r.get("wishlist_count")
        bl = r.get("brand_like_count")
        tg = r.get("tags")
        sim = r.get("similar_products")
        sn = r.get("snaps")
        ai = r.get("ai_summary")
        kw = r.get("keyword_scores")
        rv = r.get("total_reviews")
        rd = r.get("rating_distribution")

        row = (
            f"| {mno} "
            f"| {wl if wl is not None else '✗'} "
            f"| {bl if bl is not None else '✗'} "
            f"| {len(tg) if tg else '✗'} "
            f"| {len(sim) if sim else '✗'} "
            f"| {len(sn) if sn else '✗'} "
            f"| {'✓' if ai else '✗'} "
            f"| {len(kw) if kw else '✗'} "
            f"| {rv if rv is not None else '✗'} "
            f"| {'✓' if rd else '✗'} |"
        )
        print(row)
        field_matrix[mno] = {
            "wishlist": wl is not None,
            "brand_like": bl is not None,
            "tags": bool(tg),
            "similar": bool(sim),
            "snaps": bool(sn),
            "ai_summary": bool(ai),
            "keyword_scores": bool(kw),
            "total_reviews": rv is not None,
            "rating_dist": bool(rd),
        }

    print("\n== C) 1차 8개 필드 채움 분류")
    fields = ["wishlist", "brand_like", "tags", "similar", "snaps",
              "ai_summary", "keyword_scores", "total_reviews"]
    all_filled = [f for f in fields if all(field_matrix.get(mno, {}).get(f) for mno in nos[:len(results)])]
    partial = [f for f in fields if f not in all_filled and any(field_matrix.get(mno, {}).get(f) for mno in nos[:len(results)])]
    all_empty = [f for f in fields if f not in all_filled and f not in partial]
    print(f"  전체 채워짐 ({len(all_filled)}/8): {all_filled}")
    print(f"  일부만 채워짐: {partial}")
    print(f"  전부 비어있음: {all_empty}")

    print("\n== D) 소요 시간")
    if timings:
        print(f"  상품당 평균: {sum(timings)/len(timings):.1f}s")
        print(f"  최소: {min(timings):.1f}s  최대: {max(timings):.1f}s")
        print(f"  총 소요: {total_elapsed:.1f}s")
    else:
        print("  측정 불가 (실행 실패)")

    print("\n== E) deny 리스트 동작 확인")
    if _deny_hits:
        print(f"  warning 로그 {len(_deny_hits)}건 발생:")
        for h in _deny_hits[:10]:
            print(f"    {h[:120]}")
    else:
        print("  deny 대상 URL 인터셉트 없음 (해당 응답 미발생 또는 XHR 미캡처)")

    print("\n== F) 1위 상품 ai_summary 앞 200자")
    if results and results[0].get("ai_summary"):
        print(f"  [{results[0]['musinsa_no']}] {results[0]['ai_summary'][:200]}")
    else:
        print("  None (응답 없음 또는 AI 요약 미제공 상품)")

    # 결과 JSON 저장
    out_path = Path(__file__).parent / "_smoke_product_result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        serializable = []
        for r in results:
            r2 = dict(r)
            if hasattr(r2.get("scraped_at"), "isoformat"):
                r2["scraped_at"] = r2["scraped_at"].isoformat()
            serializable.append(r2)
        json.dump(serializable, f, ensure_ascii=False, indent=2)
    print(f"\n결과 저장: {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
