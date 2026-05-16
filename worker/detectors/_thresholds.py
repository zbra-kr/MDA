# ADR-024: 임계값은 코드 상수. 변경 시 PR 필수. DB 설정 테이블로 이동은 Phase 4 이후.
RANK_SURGE_MIN_DELTA      = 20      # 20위 이상 상승
PRICE_CHANGE_MIN_PCT      = 10.0    # 10% 이상 변동
REVIEW_VELOCITY_RATIO     = 3.0     # 14일 평균 3배 초과
REVIEW_VELOCITY_MIN_COUNT = 10      # 절대 최소 10건
NEW_ENTRANT_TOP_N         = 100     # Top 100 기준
PROMO_START_TRIGGER       = "new"   # 어제 없던 상품의 신규 프로모션
WISHLIST_SURGE_MIN_PCT    = 30.0    # 30% 이상 증가
WISHLIST_SURGE_MIN_ABS    = 100     # 절대 100 이상 증가
