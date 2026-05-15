"""
worker/dart/config.py — DART OpenAPI 설정·인증키 검증.
"""

from __future__ import annotations

import os
from pathlib import Path


def _load_env() -> None:
    """worker/.env 를 os.environ 에 로드 (이미 설정된 변수는 덮어쓰지 않음)."""
    env_path = Path(__file__).parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip()
        if k:
            os.environ.setdefault(k, v)


def get_dart_api_key() -> str:
    """DART_API_KEY 로드 및 최소 길이 검증.

    Returns:
        40자 이상의 API 키 문자열

    Raises:
        RuntimeError: 키가 없거나 비어있거나 너무 짧은 경우
    """
    _load_env()
    key = os.environ.get("DART_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "DART_API_KEY 가 설정되지 않았습니다. "
            "worker/.env 에 DART_API_KEY=<인증키> 를 추가하세요. "
            "발급: https://opendart.fss.or.kr"
        )
    if len(key) < 32:
        raise RuntimeError(
            f"DART_API_KEY 길이({len(key)}자)가 너무 짧습니다. "
            "올바른 인증키를 확인하세요."
        )
    return key
