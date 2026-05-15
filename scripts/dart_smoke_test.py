#!/usr/bin/env python3
"""
scripts/dart_smoke_test.py — DART OpenAPI 연결 검증 (단계 A).

실행:
    cd /Users/macmini/projects/MDA
    python scripts/dart_smoke_test.py

출력만. DB 저장 없음.
"""

from __future__ import annotations

import sys
from pathlib import Path

# worker 패키지 경로 확보
sys.path.insert(0, str(Path(__file__).parent.parent))

from worker.dart.config import get_dart_api_key

import OpenDartReader


def _mask(key: str) -> str:
    return f"{key[:4]}...{key[-4:]} (총 {len(key)}자)"


def check_a_auth(dart: OpenDartReader, key: str) -> bool:
    """a) corp_code 조회 — 삼성전자."""
    print("\n[a] corp_code 조회 — 삼성전자")
    try:
        corp = dart.find_corp_code("삼성전자")
        if not corp:
            print("    FAIL: 결과 없음")
            return False
        print(f"    corp_code : {corp}")
        print(f"    PASS")
        return True
    except Exception as exc:
        print(f"    FAIL: {exc}")
        return False


def check_b_disclosures(dart: OpenDartReader) -> bool:
    """b) 최근 7일 공시 목록 — 삼성전자."""
    import datetime

    print("\n[b] 공시 목록 — 삼성전자 최근 7일")
    end = datetime.date.today()
    start = end - datetime.timedelta(days=7)
    try:
        df = dart.list(
            corp="삼성전자",
            start=start.strftime("%Y%m%d"),
            end=end.strftime("%Y%m%d"),
            kind="A",           # 정기공시
            final=False,
        )
        if df is None or df.empty:
            # 7일 내 정기공시 없을 수 있음 — kind 확장
            df = dart.list(
                corp="삼성전자",
                start=start.strftime("%Y%m%d"),
                end=end.strftime("%Y%m%d"),
                final=False,
            )
        count = len(df) if df is not None else 0
        print(f"    기간     : {start} ~ {end}")
        print(f"    건수     : {count}건")
        if count > 0:
            row = df.iloc[0]
            print(f"    최근 공시: [{row.get('report_nm', '')}] {row.get('rcept_dt', '')}")
        print(f"    PASS (0건도 정상 — 해당 기간 공시 없을 수 있음)")
        return True
    except Exception as exc:
        print(f"    FAIL: {exc}")
        return False


def check_c_financials(dart: OpenDartReader) -> bool:
    """c) 재무 정보 — 삼성전자 2024 사업보고서."""
    print("\n[c] 재무 정보 — 삼성전자 2024 사업보고서")
    SAMSUNG_CORP_CODE = "00126380"
    try:
        df = dart.finstate(SAMSUNG_CORP_CODE, 2024, reprt_code="11011")
        if df is None or df.empty:
            print("    FAIL: 빈 응답")
            return False

        # 매출액 / 영업이익 추출
        revenue_row = df[df["account_nm"].str.contains("매출액|수익", na=False)].head(1)
        op_row = df[df["account_nm"].str.contains("영업이익", na=False)].head(1)

        def _to_trillion(val_str: str) -> str:
            try:
                val = int(str(val_str).replace(",", "").strip())
                return f"{val / 1_000_000_000_000:.1f}조원"
            except Exception:
                return str(val_str)

        if not revenue_row.empty:
            amt = revenue_row.iloc[0].get("thstrm_amount", "N/A")
            print(f"    매출액   : {_to_trillion(amt)}")
        if not op_row.empty:
            amt = op_row.iloc[0].get("thstrm_amount", "N/A")
            print(f"    영업이익 : {_to_trillion(amt)}")

        print(f"    응답 행수: {len(df)}행")
        print(f"    PASS")
        return True
    except Exception as exc:
        print(f"    FAIL: {exc}")
        return False


def main() -> None:
    print("=" * 54)
    print("  DART OpenAPI smoke test — 단계 A")
    print("=" * 54)

    # 키 검증
    try:
        key = get_dart_api_key()
    except RuntimeError as exc:
        print(f"\nERROR: {exc}")
        sys.exit(1)

    print(f"\n[환경변수] DART_API_KEY: {_mask(key)}")

    dart = OpenDartReader(key)

    results = {
        "a_auth": check_a_auth(dart, key),
        "b_disclosures": check_b_disclosures(dart),
        "c_financials": check_c_financials(dart),
    }

    print("\n" + "=" * 54)
    passed = sum(results.values())
    total = len(results)
    print(f"  결과: {passed}/{total} 통과")
    print("=" * 54)

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
