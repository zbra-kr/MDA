"""
worker/enrichment/brand_metadata.py — Phase 1.5.1.

Brand 메타데이터 LLM 자동 분류.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import anthropic
from loguru import logger
from worker.enrichment.prompts import ENRICH_BRAND_PROMPT

_MODEL = 'claude-sonnet-4-6'
_MAX_TOKENS = 512
_API_DELAY_SEC = 1.0

_VALID_CATEGORY = {
    '스트릿', '캐주얼', '럭셔리', '아웃도어', '스포츠', '골프',
    '언더웨어', '아동', '액세서리', '슈즈', '백·가방', '기타',
}
_VALID_PRICE_TIER = {'저가', '중가', '프리미엄', '럭셔리'}
_VALID_GENDER = {'남성', '여성', '유니섹스', '아동'}
_VALID_COUNTRY = {'한국', '미국', '일본', '프랑스', '이탈리아', '독일', '영국', '중국', '기타'}
_VALID_CONFIDENCE = {'high', 'medium', 'low'}


@dataclass
class BrandMetadata:
    brand_id: str
    slug: str
    name: str
    description: str
    brand_category: str
    price_tier: str
    target_age: str
    target_gender: str
    hq_country: str
    confidence: Literal['high', 'medium', 'low']
    reasoning: str


def _load_env() -> None:
    env_path = Path(__file__).parent.parent / '.env'
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.split('#')[0].strip()
        if '=' not in line:
            continue
        k, _, v = line.partition('=')
        k, v = k.strip(), v.strip()
        if k:
            os.environ.setdefault(k, v)


def _get_client() -> anthropic.Anthropic:
    _load_env()
    key = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    if not key:
        raise RuntimeError('ANTHROPIC_API_KEY not set in worker/.env')
    return anthropic.Anthropic(api_key=key)


def _validate(raw: dict) -> dict | None:
    """enum 값 검증. 잘못된 값이면 None."""
    errors = []
    if raw.get('brand_category') not in _VALID_CATEGORY:
        errors.append(f'brand_category={raw.get("brand_category")!r}')
    if raw.get('price_tier') not in _VALID_PRICE_TIER:
        errors.append(f'price_tier={raw.get("price_tier")!r}')
    if raw.get('target_gender') not in _VALID_GENDER:
        errors.append(f'target_gender={raw.get("target_gender")!r}')
    if raw.get('hq_country') not in _VALID_COUNTRY:
        errors.append(f'hq_country={raw.get("hq_country")!r}')
    if raw.get('confidence') not in _VALID_CONFIDENCE:
        errors.append(f'confidence={raw.get("confidence")!r}')
    if errors:
        return None
    return raw


def classify_brand(
    brand_id: str,
    brand_slug: str,
    brand_name: str,
    *,
    client: anthropic.Anthropic | None = None,
) -> BrandMetadata | None:
    """Claude Sonnet 으로 brand 메타데이터 자동 분류.

    Args:
        brand_id:   brands.id (UUID)
        brand_slug: brands.slug
        brand_name: brands.name
        client:     재사용 Anthropic 클라이언트 (없으면 새로 생성)

    Returns:
        BrandMetadata 또는 None (파싱 실패·enum 오류 시)
    """
    if client is None:
        client = _get_client()

    prompt = ENRICH_BRAND_PROMPT.format(brand_name=brand_name, brand_slug=brand_slug)

    time.sleep(_API_DELAY_SEC)

    for attempt in range(2):
        try:
            msg = client.messages.create(
                model=_MODEL,
                max_tokens=_MAX_TOKENS,
                messages=[{'role': 'user', 'content': prompt}],
            )
            text = msg.content[0].text.strip()

            # JSON 블록 추출 (마크다운 펜스 있을 수 있음)
            if '```' in text:
                text = text.split('```')[1]
                if text.startswith('json'):
                    text = text[4:]

            raw = json.loads(text)
        except (json.JSONDecodeError, IndexError, anthropic.APIError) as exc:
            logger.bind(slug=brand_slug, attempt=attempt).warning(
                f'classify_brand_parse_error: {exc}'
            )
            if attempt == 0:
                time.sleep(2)
                continue
            return None

        validated = _validate(raw)
        if validated is None:
            logger.bind(slug=brand_slug, raw=raw).warning('classify_brand_invalid_enum')
            return None

        result = BrandMetadata(
            brand_id=brand_id,
            slug=brand_slug,
            name=brand_name,
            description=validated.get('description', ''),
            brand_category=validated['brand_category'],
            price_tier=validated['price_tier'],
            target_age=validated.get('target_age', ''),
            target_gender=validated['target_gender'],
            hq_country=validated['hq_country'],
            confidence=validated['confidence'],
            reasoning=validated.get('reasoning', ''),
        )
        logger.bind(slug=brand_slug, confidence=result.confidence).debug('classify_brand_ok')
        return result

    return None
