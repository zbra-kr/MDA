"""worker/enrichment/prompts.py — LLM 분류 프롬프트."""

from __future__ import annotations

ENRICH_BRAND_PROMPT = """당신은 한국 패션·소비재 업계 전문가입니다.

다음 무신사 입점 브랜드를 분석해서 메타데이터를 분류해주세요.

브랜드: {brand_name} (slug: {brand_slug})

다음 6가지를 분류하세요:

1. description (자유 텍스트, 한 줄, 한국어): 브랜드 핵심 정체성·역사·특징
   예: "1990년대 LA 발 스트릿웨어, 데님 강세"

2. brand_category (enum, 정확히 하나만):
   '스트릿', '캐주얼', '럭셔리', '아웃도어', '스포츠', '골프', '언더웨어', '아동', '액세서리', '슈즈', '백·가방', '기타'

3. price_tier (enum):
   '저가' (1~3만원대), '중가' (3~10만원대), '프리미엄' (10~30만원대), '럭셔리' (30만원+)

4. target_age (자유 텍스트, 한국어): 주 타겟 연령대
   예: "20대~30대", "30대 후반~40대 중반", "전 연령"

5. target_gender (enum):
   '남성', '여성', '유니섹스', '아동'

6. hq_country (enum):
   '한국', '미국', '일본', '프랑스', '이탈리아', '독일', '영국', '중국', '기타'

추가:
- confidence: 'high' (잘 알려진 글로벌·국내 메이저 브랜드), 'medium' (어느 정도 인지), 'low' (생소한 브랜드)
- reasoning: 분류 근거 한 줄

⚠️ 주의:
- enum 값은 정확히 위 목록에서만 골라야 함
- 확실하지 않으면 '기타' 또는 confidence='low' 로 표시
- 브랜드 이름이 모호하면 (예: 동명 다른 회사) confidence='low'

JSON 형식만 반환:
{{
  "description": "...",
  "brand_category": "...",
  "price_tier": "...",
  "target_age": "...",
  "target_gender": "...",
  "hq_country": "...",
  "confidence": "high|medium|low",
  "reasoning": "..."
}}"""
