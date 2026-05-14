-- ============================================================
-- Seed data
-- 적용 시기: 00001, 00002 마이그레이션 후
-- 운영 중 갱신: 상품기획팀과 협의하여 월 1회
-- ============================================================

-- ====================================
-- 자사 브랜드 (B.CAVE)
-- ====================================
insert into brands (name, slug, tier, is_own, is_competitor, notes) values
  ('커버낫',     'covernat',  'casual', true, true,  'B.CAVE 주력 브랜드. 무신사 페이지도 모니터링 대상.'),
  ('리',         'lee',       'casual', true, false, 'B.CAVE 산하 데님 브랜드'),
  ('와키윌리',   'wakywilly', 'casual', true, false, 'B.CAVE 산하 라이프스타일 브랜드')
on conflict (slug) do nothing;

-- ====================================
-- 경쟁 브랜드 (초기 30개)
-- 상품기획팀과 협의하여 갱신
-- ====================================
insert into brands (name, slug, tier, is_competitor, notes) values
  ('LMC',                  'lmc',                 'street',   true, '커버낫 직접 경쟁'),
  ('디스이즈네버댓',       'thisisneverthat',     'street',   true, '커버낫 직접 경쟁'),
  ('메인부스',             'mainbooth',           'street',   true, ''),
  ('파르티멘토',           'partimento',          'casual',   true, ''),
  ('비바스튜디오',         'vivastudio',          'casual',   true, ''),
  ('예스아이씨',           'yesic',               'street',   true, ''),
  ('내셔널지오그래픽',     'national-geographic', 'casual',   true, ''),
  ('디스커버리',           'discovery',           'casual',   true, ''),
  ('칼하트',               'carhartt-wip',        'street',   true, ''),
  ('스투시',               'stussy',              'street',   true, ''),
  ('폴로 랄프로렌',        'polo-ralph-lauren',   'classic',  true, ''),
  ('타미힐피거',           'tommy-hilfiger',      'classic',  true, ''),
  ('FCMM',                 'fcmm',                'casual',   true, ''),
  ('인사일런스',           'insilence',           'designer', true, ''),
  ('포터리',               'pottery',             'designer', true, ''),
  ('아디다스 오리지널스',  'adidas-originals',    'sports',   true, ''),
  ('나이키',               'nike',                'sports',   true, ''),
  ('뉴발란스',             'new-balance',         'sports',   true, ''),
  ('샌프란시스코마켓',     'sfmarket',            'street',   true, ''),
  ('마하그리드',           'mahagrid',            'street',   true, ''),
  ('오아이오아이',         'oioi',                'casual',   true, ''),
  ('오프닝프로젝트',       'opening-project',     'designer', true, ''),
  ('어반드레스',           'urbandress',          'casual',   true, ''),
  ('에스피오나지',         'espionage',           'casual',   true, ''),
  ('블랙야크',             'black-yak',           'outdoor',  true, ''),
  ('아크테릭스',           'arcteryx',            'outdoor',  true, ''),
  ('파타고니아',           'patagonia',           'outdoor',  true, ''),
  ('노스페이스',           'the-north-face',      'outdoor',  true, ''),
  ('헬리한센',             'helly-hansen',        'outdoor',  true, ''),
  ('마뗑킴',               'matin-kim',           'casual',   true, '')
on conflict (slug) do nothing;

-- ====================================
-- 카테고리 (대분류 + 주요 중분류)
-- 무신사 카테고리 트리에 맞춰 수동 시드.
-- 실제 musinsa_code는 무신사 사이트에서 확인 후 갱신 필요.
-- ====================================
insert into categories (musinsa_code, name_kr, parent_path, depth, is_active) values
  -- 대분류
  ('001',    '상의',                              '상의', 1, true),
  ('002',    '아우터',                            '아우터', 1, true),
  ('003',    '바지',                              '바지', 1, true),
  ('022',    '원피스/스커트',                     '원피스/스커트', 1, true),
  ('018',    '신발',                              '신발', 1, true),
  ('004',    '가방',                              '가방', 1, true),
  ('005',    '모자',                              '모자', 1, true),
  ('017',    '액세서리',                          '액세서리', 1, true),
  ('020',    '디지털/라이프',                     '디지털/라이프', 1, true),

  -- 상의 중분류
  ('001001', '반소매 티셔츠',                     '상의 > 반소매 티셔츠', 2, true),
  ('001010', '긴소매 티셔츠',                     '상의 > 긴소매 티셔츠', 2, true),
  ('001005', '맨투맨/스웨트',                     '상의 > 맨투맨/스웨트', 2, true),
  ('001004', '후드 티셔츠',                       '상의 > 후드 티셔츠', 2, true),
  ('001002', '셔츠/블라우스',                     '상의 > 셔츠/블라우스', 2, true),
  ('001003', '피케/카라 티셔츠',                  '상의 > 피케/카라 티셔츠', 2, true),
  ('001011', '니트/스웨터',                       '상의 > 니트/스웨터', 2, true),
  ('001006', '민소매 티셔츠',                     '상의 > 민소매 티셔츠', 2, true),

  -- 아우터 중분류
  ('002022', '후드 집업',                         '아우터 > 후드 집업', 2, true),
  ('002001', '블루종/MA-1',                       '아우터 > 블루종/MA-1', 2, true),
  ('002002', '레더/라이더스 재킷',                '아우터 > 레더/라이더스 재킷', 2, true),
  ('002003', '트러커 재킷',                       '아우터 > 트러커 재킷', 2, true),
  ('002017', '슈트/블레이저',                     '아우터 > 슈트/블레이저', 2, true),
  ('002025', '플리스/뽀글이',                     '아우터 > 플리스/뽀글이', 2, true),
  ('002007', '숏패딩/숏헤비 아우터',              '아우터 > 숏패딩', 2, true),
  ('002013', '롱패딩/롱헤비 아우터',              '아우터 > 롱패딩', 2, true),
  ('002016', '겨울 더블 코트',                    '아우터 > 겨울 코트', 2, true),
  ('002020', '겨울 싱글 코트',                    '아우터 > 겨울 싱글', 2, true),

  -- 바지 중분류
  ('003002', '데님 팬츠',                         '바지 > 데님 팬츠', 2, true),
  ('003007', '코튼 팬츠',                         '바지 > 코튼 팬츠', 2, true),
  ('003008', '슈트 팬츠/슬랙스',                  '바지 > 슈트 팬츠', 2, true),
  ('003004', '트레이닝/조거 팬츠',                '바지 > 트레이닝/조거', 2, true),
  ('003005', '숏 팬츠',                           '바지 > 숏 팬츠', 2, true),
  ('003003', '점프 슈트/오버올',                  '바지 > 점프 슈트', 2, true)
on conflict (musinsa_code) do nothing;

-- ====================================
-- 다음 단계
-- ====================================
-- 1. 무신사 사이트에서 실제 카테고리 트리 확인 후 musinsa_code 검증·갱신
-- 2. 상품기획팀과 경쟁브랜드 리스트 확정
-- 3. 자사 무신사 페이지의 brand_id 확인 후 brands.musinsa_brand_id 채우기
