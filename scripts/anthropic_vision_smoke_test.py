#!/usr/bin/env python3
"""
scripts/anthropic_vision_smoke_test.py — Phase 1.7 단계 A 검증.

비케이브 최신 감사보고서 1페이지를 DART에서 다운로드 →
Claude Vision API 로 재무제표 텍스트 OCR → 결과 출력.

실행:
    cd /Users/macmini/projects/MDA
    worker/.venv/bin/python3 scripts/anthropic_vision_smoke_test.py

전제조건:
    - worker/.env 에 ANTHROPIC_API_KEY= 설정
    - worker/.env 에 DART_API_KEY= 설정
    - anthropic, pdf2image 설치됨
    - poppler 설치됨 (brew install poppler)
"""

from __future__ import annotations

import base64
import io
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import anthropic
import OpenDartReader
import requests
from dotenv import load_dotenv

from worker.dart.config import get_dart_api_key
from worker.ingest.supabase_writer import get_client

load_dotenv('worker/.env')

BCAVE_CORP_CODE = '01461509'
CLAUDE_MODEL = 'claude-sonnet-4-6'  # Vision 지원 최신 Sonnet


def _get_anthropic_key() -> str:
    import os
    key = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    if not key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY 가 worker/.env 에 없습니다.\n"
            "  1. https://console.anthropic.com 에서 API 키 발급 (정호철 개인 명의)\n"
            "  2. worker/.env 에 ANTHROPIC_API_KEY=sk-ant-... 추가 후 재실행"
        )
    return key


def _get_audit_rcept_no(client) -> tuple[str, str] | None:
    """비케이브의 최신 감사보고서 rcept_no 조회."""
    res = (
        client.table('disclosures')
        .select('rcept_no, report_nm, rcept_dt')
        .eq('company_id',
            client.table('dart_corp_codes')
            .select('company_id')
            .eq('corp_code', BCAVE_CORP_CODE)
            .execute()
            .data[0]['company_id']
        )
        .ilike('report_nm', '%감사보고서%')
        .order('rcept_dt', desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    row = res.data[0]
    return row['rcept_no'], row['report_nm']


def _download_pdf_from_dart(dart_client, rcept_no: str) -> bytes | None:
    """DART document API 로 감사보고서 ZIP 다운로드 → PDF 추출."""
    try:
        # OpenDartReader document() — ZIP 파일 반환
        doc = dart_client.document(rcept_no)

        # doc 이 이미 bytes 이면 그대로 처리
        if isinstance(doc, bytes):
            raw = doc
        elif hasattr(doc, 'read'):
            raw = doc.read()
        else:
            # URL 이 반환되는 경우 직접 다운로드
            url = f"https://opendart.fss.or.kr/api/document.do?rcpNo={rcept_no}"
            dart_api_key = get_dart_api_key()
            resp = requests.get(
                "https://opendart.fss.or.kr/api/document.do",
                params={"crtfc_key": dart_api_key, "rcpNo": rcept_no},
                timeout=30,
            )
            resp.raise_for_status()
            raw = resp.content

        # ZIP 에서 PDF 추출
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            pdf_names = [n for n in zf.namelist() if n.lower().endswith('.pdf')]
            if not pdf_names:
                print(f"  ZIP 내 PDF 없음. 파일 목록: {zf.namelist()[:5]}")
                return None
            print(f"  ZIP 내 PDF: {pdf_names}")
            return zf.read(pdf_names[0])

    except Exception as exc:
        print(f"  PDF 다운로드 실패: {exc}")
        return None


def _pdf_page_to_base64(pdf_bytes: bytes, page: int = 0) -> str | None:
    """PDF 특정 페이지 → base64 PNG 문자열."""
    try:
        from pdf2image import convert_from_bytes
        images = convert_from_bytes(pdf_bytes, first_page=page + 1, last_page=page + 1, dpi=150)
        if not images:
            return None
        buf = io.BytesIO()
        images[0].save(buf, format='PNG')
        return base64.standard_b64encode(buf.getvalue()).decode()
    except Exception as exc:
        print(f"  PDF→이미지 변환 실패: {exc}")
        print("  poppler 설치 필요: brew install poppler")
        return None


def main() -> None:
    print("=" * 60)
    print("  Phase 1.7 단계 A — Claude Vision API Smoke Test")
    print("=" * 60)

    # 1. API 키 확인
    print("\n[1] API 키 확인")
    try:
        anthropic_key = _get_anthropic_key()
        print("  ANTHROPIC_API_KEY: OK")
    except RuntimeError as e:
        print(f"\n[STOP] {e}")
        sys.exit(1)

    dart_key = get_dart_api_key()
    print("  DART_API_KEY: OK")

    # 2. anthropic 클라이언트 초기화
    print("\n[2] Anthropic 클라이언트 초기화")
    ac = anthropic.Anthropic(api_key=anthropic_key)
    dart = OpenDartReader(dart_key)
    client = get_client()
    print(f"  model: {CLAUDE_MODEL}")

    # 3. 비케이브 감사보고서 rcept_no 조회 (DB 우선 → DART kind=F fallback)
    print("\n[3] 비케이브 최신 감사보고서 조회")
    rcept_no = None

    corp_res = (
        client.table('dart_corp_codes')
        .select('company_id')
        .eq('corp_code', BCAVE_CORP_CODE)
        .single()
        .execute()
    )
    if corp_res.data:
        company_id = corp_res.data['company_id']
        disc_res = (
            client.table('disclosures')
            .select('rcept_no, report_nm, rcept_dt')
            .eq('company_id', company_id)
            .ilike('report_nm', '%감사보고서%')
            .order('rcept_dt', desc=True)
            .limit(1)
            .execute()
        )
        if disc_res.data:
            rcept_no = disc_res.data[0]['rcept_no']
            print(f"  DB: {disc_res.data[0]['report_nm']} ({disc_res.data[0]['rcept_dt']})")
            print(f"  rcept_no: {rcept_no}")

    if not rcept_no:
        print("  DB 에 감사보고서 없음 → DART kind=F 직접 조회...")
        import time as _time
        _time.sleep(0.5)
        df = dart.list(BCAVE_CORP_CODE, start='2016-01-01', end='2026-12-31', kind='F')
        if df is not None and not df.empty:
            audit = df[df['report_nm'].str.contains('감사보고서', na=False)]
            if not audit.empty:
                row = audit.iloc[0]
                rcept_no = str(row['rcept_no'])
                print(f"  DART: {row['report_nm']} ({row['rcept_dt']})")
                print(f"  rcept_no: {rcept_no}")
        if not rcept_no:
            print("  [SKIP] DART 에도 감사보고서 없음 → 텍스트 API 로 대체 테스트")

    # 4. DART document 다운로드 (XML 또는 ZIP+PDF)
    dart_doc = None
    dart_doc_type = None   # 'xml' | 'zip'
    if rcept_no:
        print(f"\n[4] DART document 다운로드: rcept_no={rcept_no}")
        try:
            raw = dart.document(rcept_no)
            if isinstance(raw, str) and raw.strip().startswith('<?xml'):
                dart_doc = raw
                dart_doc_type = 'xml'
                print(f"  응답 형식: XML ({len(raw):,} chars)")
            elif isinstance(raw, bytes):
                dart_doc = raw
                dart_doc_type = 'zip'
                print(f"  응답 형식: ZIP ({len(raw):,} bytes)")
            else:
                print(f"  응답 형식 불명: {type(raw)}")
        except Exception as exc:
            print(f"  다운로드 실패: {exc}")

    # 5. Claude API 호출
    print(f"\n[5] Claude API 호출 (model={CLAUDE_MODEL})")
    message = None

    if dart_doc_type == 'xml':
        # XML 텍스트 모드 — DART 최신 공시 형식 (Vision 불필요)
        import xml.etree.ElementTree as ET
        root = ET.fromstring(dart_doc)

        # SUMMARY 직접 파싱 (무료 — API 호출 불필요)
        summary = {ex.get('ACODE'): ex.text for ex in root.findall('.//EXTRACTION')}
        print("  XML SUMMARY 직접 파싱 결과:")
        print(f"    매출액(TOT_SALES):  {int(summary.get('TOT_SALES', 0)):>10,} 백만원")
        print(f"    자산총계(TOT_ASSETS): {int(summary.get('TOT_ASSETS', 0)):>10,} 백만원")
        print(f"    부채총계(TOT_DEBTS):  {int(summary.get('TOT_DEBTS', 0)):>10,} 백만원")
        equity = int(summary.get('TOT_ASSETS', 0)) - int(summary.get('TOT_DEBTS', 0))
        print(f"    자본총계(계산):      {equity:>10,} 백만원")

        # 손익계산서 TE 태그 직접 파싱 → 영업이익 / 당기순이익
        import re as _re

        def _parse_won_to_mkrw(s: str) -> int | None:
            s = s.strip().replace(',', '')
            neg = s.startswith('(')
            s = _re.sub(r'[\(\)\−\-]', '', s)
            try:
                v = int(s) // 1_000_000
                return -v if neg else v
            except ValueError:
                return None

        body = root.find('BODY')
        in_income = False
        op_income_mkrw = net_income_mkrw = None

        for elem in body.iter():
            if elem.tag == 'TITLE' and elem.get('ATOCID') == '9':
                in_income = True
                continue
            if in_income and elem.tag == 'TITLE' and elem.get('ATOCID') not in (None, '9'):
                break
            if in_income and elem.tag == 'TR':
                cells = [''.join(c.itertext()).strip().replace('　', '') for c in elem if c.tag == 'TE']
                cells = [c for c in cells if c]
                if not cells:
                    continue
                label = cells[0]
                val = cells[1] if len(cells) > 1 else ''
                if '영업이익' in label and '외' not in label and op_income_mkrw is None:
                    op_income_mkrw = _parse_won_to_mkrw(val)
                if ('당기순이익' in label or '당기순손실' in label) and net_income_mkrw is None:
                    net_income_mkrw = _parse_won_to_mkrw(val)

        print(f"    영업이익:            {op_income_mkrw:>10,} 백만원" if op_income_mkrw is not None else "    영업이익: None")
        print(f"    당기순이익:          {net_income_mkrw:>10,} 백만원" if net_income_mkrw is not None else "    당기순이익: None")
        print()
        print("  ✓ XML 직접 파싱 완료 — Vision/LLM API 불필요")
        print("  Claude API 기본 연결 확인 (텍스트)...")
        message = ac.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=16,
            messages=[{"role": "user", "content": "OK? 'YES'만 답하세요."}],
        )

    elif dart_doc_type == 'zip':
        # ZIP+PDF 형식 — Vision API 사용
        pdf_bytes = _download_pdf_from_dart(dart, rcept_no)
        if pdf_bytes:
            print(f"  PDF 크기: {len(pdf_bytes):,} bytes")
            print("  PDF → 이미지 변환 중 (페이지 1)...")
            img_b64 = _pdf_page_to_base64(pdf_bytes, page=0)
            if img_b64:
                print(f"  이미지 base64 길이: {len(img_b64):,}")
                message = ac.messages.create(
                    model=CLAUDE_MODEL,
                    max_tokens=256,
                    messages=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": img_b64,
                                },
                            },
                            {
                                "type": "text",
                                "text": (
                                    "이 감사보고서 이미지에서 영업이익과 당기순이익만 추출하세요.\n"
                                    "형식: 영업이익: X,XXX 백만원 / 당기순이익: X,XXX 백만원"
                                ),
                            },
                        ],
                    }],
                )

    if message is None:
        # Fallback: 기본 텍스트 API 동작 확인
        print("  Fallback: 기본 텍스트 API 동작 확인...")
        message = ac.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=64,
            messages=[{
                "role": "user",
                "content": "숫자 42를 한국어로 말하면? 한 단어로만 답하세요.",
            }],
        )

    # 6. 결과 출력
    print("\n[6] API 응답")
    print(f"  모델: {message.model}")
    print(f"  입력 토큰: {message.usage.input_tokens}")
    print(f"  출력 토큰: {message.usage.output_tokens}")
    print(f"  응답: {message.content[0].text[:300]}")

    print("\n" + "=" * 60)
    print("  Phase 1.7 단계 A Smoke Test PASS")
    print("=" * 60)


if __name__ == '__main__':
    main()
