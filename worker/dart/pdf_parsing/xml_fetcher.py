"""
worker/dart/pdf_parsing/xml_fetcher.py — Phase 1.7 단계 D.

DART document() API 호출 → 감사보고서 XML str 반환.
"""

from __future__ import annotations

import time

from loguru import logger

_API_DELAY_SEC = 0.5


def fetch_audit_xml(dart, rcept_no: str) -> str | None:
    """DART document() API 로 감사보고서 XML 가져오기.

    Args:
        dart:     OpenDartReader 인스턴스
        rcept_no: DART 공시 접수번호 14자리

    Returns:
        XML 문자열. 파일 없음(status:014) 또는 오류 시 None.
    """
    time.sleep(_API_DELAY_SEC)
    try:
        result = dart.document(rcept_no)
    except ValueError as exc:
        err_str = str(exc)
        if '014' in err_str:
            logger.bind(rcept_no=rcept_no).warning(
                'fetch_audit_xml_014: 파일 없음 (정정공시 원본 삭제) — skip'
            )
        else:
            logger.bind(rcept_no=rcept_no).warning(f'fetch_audit_xml_value_error: {exc}')
        return None
    except Exception as exc:
        logger.bind(rcept_no=rcept_no).warning(f'fetch_audit_xml_error: {exc}')
        return None

    if not isinstance(result, str):
        logger.bind(rcept_no=rcept_no, result_type=type(result).__name__).warning(
            'fetch_audit_xml_unexpected_type'
        )
        return None

    if not result.strip().startswith('<?xml'):
        logger.bind(rcept_no=rcept_no, head=result[:80]).warning(
            'fetch_audit_xml_not_xml'
        )
        return None

    logger.bind(rcept_no=rcept_no, xml_len=len(result)).debug('fetch_audit_xml_ok')
    return result
