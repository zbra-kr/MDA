-- ============================================================
-- seed_companies.sql
-- companies 98건 INSERT + brands 매핑 업데이트
--
-- 실행 전 00006_companies.sql 마이그레이션이 적용돼 있어야 함.
-- 멱등성: companies ON CONFLICT DO NOTHING,
--         brands UPDATE 는 재실행해도 같은 결과.
-- ============================================================


-- ============================================================
-- 1. companies INSERT (98건)
-- ============================================================

insert into companies (
  name, name_alt, is_own, listing_type,
  revenue_2025_mkrw, revenue_2024_mkrw, revenue_yoy_pct,
  op_income_2025_mkrw, op_income_2024_mkrw, op_income_yoy_pct, op_margin_2025_pct,
  op_status_note, fiscal_note, notes
) values
-- ---- 상장 49 ----
  ('영원무역홀딩스',    null,           false, 'listed',   4895010, 4306038,  13.7,  735475,  517045,   42.2,  15.0, null,           null,               '영원무역·영원아웃도어 포함'),
  ('미스토홀딩스',      '휠라홀딩스',   false, 'listed',   4468646, 4268743,   4.7,  474781,  360804,   31.6,  10.6, null,           null,               '휠라·아쿠쉬네트 부문 포함'),
  ('삼성물산(패션부문)',null,           false, 'listed',   2019620, 2004233,   0.8,  123083,  170467,  -27.8,   6.1, null,           null,               null),
  ('한세실업',          null,           false, 'listed',   1941777, 1797796,   8.0,   83416,  142198,  -41.3,   4.3, null,           null,               null),
  ('F&F홀딩스',         null,           false, 'listed',   1933801, 1898302,   1.9,  434195,  416367,    4.3,  22.5, null,           null,               'F&F 실적 포함'),
  ('LF',                null,           false, 'listed',   1882430, 1956268,  -3.8,  168111,  126140,   33.3,   8.9, null,           null,               null),
  ('에이피알',          null,           false, 'listed',   1527345,  722753, 111.3,  365521,  122706,  197.9,  23.9, null,           null,               null),
  ('한섬',              null,           false, 'listed',   1491764, 1485264,   0.4,   52179,   63472,  -17.8,   3.5, null,           null,               null),
  ('신성통상',          null,           false, 'listed',   1476972, 1507869,  -2.0,   74488,  121792,  -38.8,   5.0, null,           '6월 말 결산법인',  null),
  ('코오롱인더스트리(FnC부문)', null,   false, 'listed',   1188745, 1233258,  -3.6,    3600,   21593,  -83.3,   0.3, null,           null,               null),
  ('신세계인터내셔날',  null,           false, 'listed',   1109969, 1073588,   3.4,  -11496,    7241, -258.8,  -1.0, '적자전환',     null,               null),
  ('신원',              null,           false, 'listed',   1092254,  939537,  16.3,   18779,   25318,  -25.8,   1.7, null,           null,               null),
  ('TP',                '구 태평양물산',false, 'listed',   1028989, 1064151,  -3.3,   62006,   48932,   26.7,   6.0, null,           null,               null),
  ('폰드그룹',          null,           false, 'listed',    485569,  368653,  31.7,   57377,   41323,   38.9,  11.8, null,           null,               null),
  ('더네이쳐홀딩스',    null,           false, 'listed',    477522,  516897,  -7.6,    6968,   30094,  -76.8,   1.5, null,           null,               null),
  ('크리스에프앤씨',    null,           false, 'listed',    311945,  331280,  -5.8,   -4727,   12139, -138.9,  -1.5, '적자전환',     null,               null),
  ('젝시믹스',          '구 브랜드엑스코퍼레이션', false, 'listed', 274097, 271594, 0.9, 17349, 24899, -30.3, 6.3, null, null, null),
  ('웰크론',            null,           false, 'listed',    268960,  329117, -18.3,  -11118,    2172, -611.9,  -4.1, '적자전환',     null,               null),
  ('감성코퍼레이션',    null,           false, 'listed',    250195,  220397,  13.5,   44631,   36053,   23.8,  17.8, null,           null,               null),
  ('한세엠케이',        null,           false, 'listed',    248888,  245074,   1.6,  -12139,  -17629,   31.1,  -4.9, '적자지속',     null,               null),
  ('대현',              null,           false, 'listed',    240544,  259285,  -7.2,    7078,   14373,  -50.8,   2.9, null,           null,               null),
  ('비비안',            null,           false, 'listed',    222445,  221743,   0.3,   -4642,     614, -856.0,  -2.1, '적자전환',     null,               null),
  ('그리티',            null,           false, 'listed',    201718,  194740,   3.6,    7853,   12310,  -36.2,   3.9, null,           null,               null),
  ('아가방컴퍼니',      null,           false, 'listed',    189078,  182743,   3.5,   13987,   15206,   -8.0,   7.4, null,           null,               null),
  ('신영와코루',        null,           false, 'listed',    185155,  196678,  -5.9,    1289,    2756,  -53.2,   0.7, null,           null,               null),
  ('티비에이치글로벌',  null,           false, 'listed',    182419,  178465,   2.2,    3150,    3360,   -6.3,   1.7, null,           null,               null),
  ('형지엘리트',        null,           false, 'listed',    166650,  132748,  25.5,    6641,    7009,   -5.3,   4.0, null,           '6월 말 결산법인',  null),
  ('에스제이그룹',      null,           false, 'listed',    163414,  181795, -10.1,  -15863,   -3238, -389.9,  -9.7, '적자지속',     null,               null),
  ('BYC',               null,           false, 'listed',    163167,  165208,  -1.2,   26574,   23833,   11.5,  16.3, null,           null,               null),
  ('SG세계물산',        null,           false, 'listed',    132348,  138802,  -4.6,   -1516,   -2757,   45.0,  -1.1, '적자지속',     null,               null),
  ('LS네트웍스(패션부문)', null,        false, 'listed',    113195,  150071, -24.6,  -16364,  -13634,  -20.0, -14.5, '적자지속',     null,               null),
  ('패션플랫폼',        null,           false, 'listed',    106300,  104601,   1.6,    8363,    1656,  405.0,   7.9, null,           null,               null),
  ('인디에프',          null,           false, 'listed',    104591,  114738,  -8.8,    1191,    -827,  244.0,   1.1, null,           null,               null),
  ('쌍방울',            null,           false, 'listed',     91612,   91990,  -0.4,   -2455,   -2290,   -7.2,  -2.7, '적자지속',     null,               null),
  ('지엔코',            null,           false, 'listed',     76647,   84061,  -8.8,     -99,   -2121,   95.3,  -0.1, '적자지속',     null,               null),
  ('좋은사람들',        null,           false, 'listed',     72599,   90184, -19.5,   -6083,    1297, -569.0,  -8.4, '적자전환',     null,               null),
  ('제이에스티나',      null,           false, 'listed',     72242,   74434,  -2.9,     706,   -2603,  127.1,   1.0, null,           null,               null),
  ('에스티오',          null,           false, 'listed',     71506,   70233,   1.8,   -1555,     285, -645.6,  -2.2, '적자전환',     null,               null),
  ('제로투세븐',        null,           false, 'listed',     70955,   66894,   6.1,    2516,    1526,   64.9,   3.5, null,           null,               null),
  ('에이유브랜즈',      null,           false, 'listed',     60009,   44601,  34.5,   10081,   12429,  -18.9,  16.8, null,           '2025년 4월 상장',  null),
  ('배럴',              null,           false, 'listed',     59193,   64446,  -8.2,    6645,    9080,  -26.8,  11.2, null,           null,               null),
  ('형지I&C',           null,           false, 'listed',     50809,   56747, -10.5,   -7045,   -5019,  -40.4, -13.9, '적자지속',     null,               null),
  ('메디앙스',          null,           false, 'listed',     48762,   46508,   4.8,      69,   -7331,  100.9,   0.1, null,           null,               null),
  ('토박스코리아',      null,           false, 'listed',     39700,   44151, -10.1,       4,    1724,  -99.8,   0.0, null,           null,               null),
  ('진도',              null,           false, 'listed',     47608,   44153,   7.8,    3983,    1144,  248.2,   8.4, null,           null,               null),
  ('코데즈컴바인',      null,           false, 'listed',     39723,   39601,   0.3,    2416,    1059,  128.1,   6.1, null,           null,               null),
  ('형지글로벌',        '구 까스텔바작',false, 'listed',     37683,   39800,  -5.3,   -8085,   -9386,   13.9, -21.5, '적자지속',     null,               null),
  ('원풍물산',          null,           false, 'listed',     16935,   22722, -25.5,   -7199,   -4699,  -53.2, -42.5, '적자지속',     null,               null),
  ('데코앤에프',        null,           false, 'listed',     14098,   26308, -46.4,    1170,   -7447,  115.7,   8.3, null,           null,               null),
-- ---- 비상장 49 ----
  ('이랜드월드',        null,           false, 'unlisted', 5543376, 5451983,   1.7,  333323,  271346,   22.8,   6.0, null,           null,               null),
  ('나이키코리아',      null,           false, 'unlisted', 1891306, 2004975,  -5.7,   37826,   39465,   -4.2,   2.0, null,           '5월 결산법인',     null),
  ('무신사',            null,           false, 'unlisted', 1467883, 1242727,  18.1,  140488,  102818,   36.6,   9.6, null,           null,               null),
  ('파크랜드',          null,           false, 'unlisted',  904048,  851361,   6.2,   30264,   41313,  -26.7,   3.3, null,           null,               null),
  ('데상트코리아',      null,           false, 'unlisted',  542956,  535034,   1.5,   33001,   37204,  -11.3,   6.1, null,           null,               null),
  ('에이션패션',        null,           false, 'unlisted',  385040,  405589,  -5.1,   30561,   49809,  -38.6,   7.9, null,           '6월 결산법인',     null),
  ('케이투코리아',      null,           false, 'unlisted',  367410,  374348,  -1.9,   48914,   54478,  -10.2,  13.3, null,           null,               null),
  ('동일라코스테',      null,           false, 'unlisted',  311018,  300554,   3.5,   21654,   23062,   -6.1,   7.0, null,           null,               null),
  ('인동에프엔',        null,           false, 'unlisted',  304050,  301497,   0.8,   28727,   35823,  -19.8,   9.4, null,           null,               null),
  ('안다르',            null,           false, 'unlisted',  298658,  236787,  26.1,   28503,   32766,  -13.0,   9.5, null,           null,               null),
  ('BYN블랙야크',       null,           false, 'unlisted',  291745,  297836,  -2.0,   -6438,   -4097,  -57.1,  -2.2, '적자지속',     null,               null),
  ('네파',              null,           false, 'unlisted',  288759,  297313,  -2.9,   -2148,    -765, -180.8,  -0.7, '적자지속',     null,               null),
  ('하이라이트브랜즈',  null,           false, 'unlisted',  283998,  248741,  14.2,   36988,   37044,   -0.2,  13.0, null,           null,               null),
  ('비케이브',          null,           true,  'unlisted',  274342,  318860, -14.0,    3224,   20005,  -83.9,   1.2, null,           null,               'B.CAVE 자사'),
  ('세정',              null,           false, 'unlisted',  265209,  290789,  -8.8,    3347,   -3504,  195.5,   1.3, null,           null,               null),
  ('패션그룹형지',      null,           false, 'unlisted',  252467,  301095, -16.2,   17751,    4734,  275.0,   7.0, null,           null,               null),
  ('바바패션',          null,           false, 'unlisted',  232109,  242575,  -4.3,    9325,   12606,  -26.0,   4.0, null,           null,               null),
  ('아이더',            null,           false, 'unlisted',  223185,  233854,  -4.6,   16456,   14132,   16.4,   7.4, null,           null,               null),
  ('피브이에이치코리아',null,           false, 'unlisted',  209490,  199435,   5.0,   18219,   12625,   44.3,   8.7, null,           '1월 결산법인',     null),
  ('서양네트웍스',      null,           false, 'unlisted',  206554,  194896,   6.0,    5144,   10328,  -50.2,   2.5, null,           null,               null),
  ('레이어',            null,           false, 'unlisted',  191943,  150685,  27.4,   39496,   33457,   18.1,  20.6, null,           null,               null),
  ('한성에프아이',      null,           false, 'unlisted',  189658,  204685,  -7.3,   -2077,   -6499,   68.0,  -1.1, '적자지속',     null,               null),
  ('시선인터내셔널',    null,           false, 'unlisted',  183640,  179051,   2.6,    8667,    6874,   26.1,   4.7, null,           null,               null),
  ('골든듀',            null,           false, 'unlisted',  170974,  164732,   3.8,    8556,    8062,    6.1,   5.0, null,           null,               null),
  ('베네통코리아',      null,           false, 'unlisted',  168627,  169348,  -0.4,     804,    5922,  -86.4,   0.5, null,           null,               null),
  ('다이나핏코리아',    null,           false, 'unlisted',  164866,  148826,  10.8,   -8898,   -3460, -157.2,  -5.4, '적자지속',     null,               null),
  ('위비스',            null,           false, 'unlisted',  163155,  165377,  -1.3,   -2438,    6860, -135.5,  -1.5, '적자전환',     null,               null),
  ('제이씨패밀리',      null,           false, 'unlisted',  160662,  171335,  -6.2,  -12992,   -6867,  -89.2,  -8.1, '적자지속',     null,               null),
  ('브이엘엔코',        null,           false, 'unlisted',  158037,  168604,  -6.3,   24244,   26292,   -7.8,  15.3, null,           null,               null),
  ('푸마코리아',        null,           false, 'unlisted',  150853,  147298,   2.4,    6674,    6614,    0.9,   4.4, null,           null,               null),
  ('한국캘러웨이골프',  null,           false, 'unlisted',  146071,  152228,  -4.0,    3982,    1521,  161.8,   2.7, null,           null,               null),
  ('케이투세이프티',    null,           false, 'unlisted',  144538,  145655,  -0.8,   36692,   39758,   -7.7,  25.4, null,           null,               null),
  ('마뗑킴',            null,           false, 'unlisted',  135683,  128788,   5.4,   36847,   38667,   -4.7,  27.2, null,           null,               null),
  ('더캐리',            null,           false, 'unlisted',  131987,  133657,  -1.2,    1730,    5560,  -68.9,   1.3, null,           null,               null),
  ('지오다노',          null,           false, 'unlisted',  131955,  147825, -10.7,   -2242,    5151, -143.5,  -1.7, '적자전환',     null,               null),
  ('독립문',            null,           false, 'unlisted',  130754,  121963,   7.2,  -16327,  -10421,  -56.7, -12.5, '적자지속',     null,               null),
  ('아이디룩',          null,           false, 'unlisted',  127196,  135527,  -6.1,    2088,    3147,  -33.7,   1.6, null,           null,               null),
  ('알레르망',          '이덕아이앤씨', false, 'unlisted',  123604,  129574,  -4.6,   26922,   26579,    1.3,  21.8, null,           null,               null),
  ('하이드어웨이',      null,           false, 'unlisted',  121153,  149464, -18.9,   11772,   24881,  -52.7,   9.7, null,           null,               null),
  ('피스피스스튜디오',  null,           false, 'unlisted',  117880,  113777,   3.6,   16726,   28158,  -40.6,  14.2, null,           null,               null),
  ('컬럼비아스포츠웨어코리아', null,   false, 'unlisted',  116369,  113969,   2.1,   -6163,   -5554,  -11.0,  -5.3, '적자지속',     null,               null),
  ('에스제이듀코',      null,           false, 'unlisted',  110328,  111003,  -0.6,   -3963,   -4164,    4.8,  -3.6, '적자지속',     null,               null),
  ('우림에프엠지',      null,           false, 'unlisted',  110007,  112045,  -1.8,    3632,    5631,  -35.5,   3.3, null,           null,               null),
  ('메디쿼터스',        null,           false, 'unlisted',  100040,   84648,  18.2,   -4899,  -15408,   68.2,  -4.9, '적자지속',     null,               null),
  ('탠디',              null,           false, 'unlisted',   95472,  102852,  -7.2,    4658,    1401,  232.5,   4.9, null,           null,               null),
  ('제이엔지코리아',    null,           false, 'unlisted',   93186,  102767,  -9.3,     825,    -109,  856.9,   0.9, null,           null,               null),
  ('로저나인',          null,           false, 'unlisted',   85065,   89087,  -4.5,    9654,   14580,  -33.8,  11.3, null,           null,               null),
  ('레드페이스',        null,           false, 'unlisted',   79168,   85930,  -7.9,    -345,     287, -220.2,  -0.4, '적자전환',     null,               null),
  ('원더플레이스',      null,           false, 'unlisted',   71824,   87118, -17.6,   -2187,   -3680,   40.6,  -3.0, '적자지속',     null,               null)
on conflict (name) do nothing;


-- ============================================================
-- 2. brands 매핑 (DO 블록 — 181건 시도, 정확 slug 일치만 업데이트)
--
-- 정책: 기존 brands 행에 company_id 를 붙이는 작업.
--       brands 에 없는 slug 는 SKIP (새 행 INSERT 금지).
-- ============================================================

do $$
declare
  r          record;
  v_cid      uuid;
  v_bid      uuid;
begin
  for r in (
    select *
    from (values
      ('영원무역홀딩스',          '노스페이스',           'the-north-face'::text,           'medium'::text),
      ('영원무역홀딩스',          '골드윈',               'goldwin',                        'low'),
      ('미스토홀딩스',            '휠라',                 'fila',                           'high'),
      ('미스토홀딩스',            '휠라키즈',             'fila-kids',                      'medium'),
      ('삼성물산(패션부문)',       '빈폴',                 'beanpole',                       'high'),
      ('삼성물산(패션부문)',       '빈폴아웃도어',         'beanpole-outdoor',               'medium'),
      ('삼성물산(패션부문)',       '빈폴키즈',             'beanpole-kids',                  'low'),
      ('삼성물산(패션부문)',       '갤럭시',               'galaxy-lifestyle',               'low'),
      ('삼성물산(패션부문)',       '구호',                 'kuho',                           'medium'),
      ('삼성물산(패션부문)',       '에잇세컨즈',           '8seconds',                       'high'),
      ('한세실업',                '',                     null,                             'low'),
      ('F&F홀딩스',               'MLB',                  'mlb',                            'high'),
      ('F&F홀딩스',               '디스커버리 익스페디션','discovery-expedition',           'high'),
      ('F&F홀딩스',               'MLB키즈',              'mlb-kids',                       'medium'),
      ('F&F홀딩스',               '스트레치엔젤스',       'stretch-angels',                 'medium'),
      ('LF',                      '헤지스',               'hazzys',                         'high'),
      ('LF',                      '닥스',                 'daks',                           'high'),
      ('LF',                      '질스튜어트',           'jill-stuart',                    'high'),
      ('LF',                      '질바이질스튜어트',     'jill-by-jill-stuart',            'medium'),
      ('LF',                      'TNGT',                 'tngt',                           'medium'),
      ('LF',                      '라푸마',               'lafuma',                         'medium'),
      ('LF',                      '헤지스키즈',           'hazzys-kids',                    'low'),
      ('에이피알',                '에이프릴스킨',         'april-skin',                     'low'),
      ('에이피알',                '널디',                 'nerdy',                          'high'),
      ('한섬',                    '시스템',               'system-homme',                   'medium'),
      ('한섬',                    '타임',                 'time',                           'medium'),
      ('한섬',                    '마인',                 'mine',                           'low'),
      ('한섬',                    '더캐시미어',           'the-cashmere',                   'low'),
      ('한섬',                    'SJSJ',                 'sjsj',                           'low'),
      ('신성통상',                '지오지아',             'ziozia',                         'high'),
      ('신성통상',                '탑텐',                 'topten',                         'high'),
      ('신성통상',                '올젠',                 'olzen',                          'medium'),
      ('신성통상',                '앤드지',               'andz',                           'medium'),
      ('신성통상',                '폴햄',                 'polham',                         'high'),
      ('코오롱인더스트리(FnC부문)','코오롱스포츠',        'kolon-sport',                    'high'),
      ('코오롱인더스트리(FnC부문)','럭키슈에뜨',          'lucky-chouette',                 'medium'),
      ('코오롱인더스트리(FnC부문)','쿠론',                'couronne',                       'low'),
      ('코오롱인더스트리(FnC부문)','시리즈',              'series',                         'medium'),
      ('코오롱인더스트리(FnC부문)','왁',                  'wac',                            'medium'),
      ('신세계인터내셔날',        '보브',                 'vov',                            'medium'),
      ('신세계인터내셔날',        '지컷',                 'g-cut',                          'medium'),
      ('신세계인터내셔날',        '스튜디오톰보이',       'studio-tomboy',                  'medium'),
      ('신세계인터내셔날',        '일라일',               'illail',                         'low'),
      ('신원',                    '베스띠벨리',           'bestibelli',                     'low'),
      ('신원',                    '씨',                   'si',                             'low'),
      ('신원',                    '비키',                 'vicki',                          'low'),
      ('TP',                      '',                     null,                             'low'),
      ('폰드그룹',                '로엠',                 'roem',                           'medium'),
      ('폰드그룹',                '모르간',               'morgan',                         'low'),
      ('폰드그룹',                '르까프',               'lecaf',                          'medium'),
      ('폰드그룹',                '케이스위스',           'k-swiss',                        'medium'),
      ('폰드그룹',                '프로스펙스',           'prospecs',                       'high'),
      ('더네이쳐홀딩스',          '내셔널지오그래픽',     'national-geographic-apparel',    'high'),
      ('더네이쳐홀딩스',          'NFL',                  'nfl',                            'medium'),
      ('더네이쳐홀딩스',          '헌터',                 'hunter',                         'low'),
      ('크리스에프앤씨',          '파리게이츠',           'pearlygates',                    'medium'),
      ('크리스에프앤씨',          '마스터바니',           'master-bunny',                   'medium'),
      ('크리스에프앤씨',          '핑',                   'ping',                           'low'),
      ('젝시믹스',                '젝시믹스',             'xexymix',                        'high'),
      ('웰크론',                  '',                     null,                             'low'),
      ('감성코퍼레이션',          '스노우피크어패럴',     'snow-peak-apparel',              'medium'),
      ('한세엠케이',              'NBA',                  'nba-apparel',                    'medium'),
      ('한세엠케이',              '프로스펙스키즈',       'prospecs-kids',                  'low'),
      ('한세엠케이',              '컬리수',               'curlysue',                       'low'),
      ('대현',                    '모조에스핀',           'mojo-spin',                      'low'),
      ('대현',                    '주크',                 'zooc',                           'low'),
      ('대현',                    '블루핏',               'blue-fit',                       'low'),
      ('비비안',                  '비비안',               'vivien',                         'low'),
      ('감성코퍼레이션',          '제이엠솔루션',         'jm-solution',                    'low'),
      ('젝시믹스',                'XEXYMIX MEN',          'xexymix-men',                    'medium'),
      ('신영와코루',              '와코루',               'wacoal',                         'low'),
      ('그리티',                  '바바리안',             'bavarian',                       'low'),
      ('아가방컴퍼니',            '아가방',               'agabang',                        'low'),
      ('아가방컴퍼니',            '에뜨와',               'etoile',                         'low'),
      ('티비에이치글로벌',        '행텐',                 'hang-ten',                       'medium'),
      ('티비에이치글로벌',        '센터폴',               'centerpole',                     'medium'),
      ('BYC',                     'BYC',                  'byc',                            'medium'),
      ('LS네트웍스(패션부문)',     '스케쳐스',             'skechers',                       'medium'),
      ('LS네트웍스(패션부문)',     '잭울프스킨',           'jack-wolfskin',                  'low'),
      ('SG세계물산',              '바쏘옴므',             'basso-homme',                    'low'),
      ('SG세계물산',              'SG세계물산',           'sg',                             'low'),
      ('형지엘리트',              '엘리트',               'elite-school',                   'low'),
      ('지엔코',                  '써스데이아일랜드',     'thursday-island',                'medium'),
      ('지엔코',                  '쿠아드로',             'quadro',                         'low'),
      ('인디에프',                '트루젠',               'trugen',                         'medium'),
      ('인디에프',                'JoinUs',               'join-us',                        'low'),
      ('패션플랫폼',              '29CM',                 null,                             'low'),
      ('쌍방울',                  '쌍방울',               'trywell',                        'low'),
      ('좋은사람들',              '예스',                 'yes',                            'low'),
      ('좋은사람들',              '보디가드',             'bodyguard',                      'low'),
      ('제이에스티나',            '제이에스티나',         'j-estina',                       'low'),
      ('에스티오',                'STCO',                 'stco',                           'low'),
      ('제로투세븐',              '알로앤루',             'allo-and-lugh',                  'low'),
      ('에이유브랜즈',            '(다수 브랜드)',         null,                             'low'),
      ('배럴',                    '배럴',                 'barrel',                         'medium'),
      ('형지I&C',                 '크로커다일',           'crocodile-ladies',               'low'),
      ('메디앙스',                '(유아용품)',            null,                             'low'),
      ('토박스코리아',            '토박스',               'toboxkids',                      'low'),
      ('진도',                    '진도모피',             'jindo-fur',                      'low'),
      ('코데즈컴바인',            '코데즈컴바인',         'codes-combine',                  'medium'),
      ('형지글로벌',              '까스텔바작',           'castelbajac',                    'low'),
      ('원풍물산',                '킹스맨',               'kingsman',                       'low'),
      ('데코앤에프',              '데코',                 'deco',                           'low'),
      ('이랜드월드',              '스파오',               'spao',                           'high'),
      ('이랜드월드',              '미쏘',                 'mixxo',                          'high'),
      ('이랜드월드',              '후아유',               'whoau',                          'high'),
      ('이랜드월드',              '뉴발란스',             'new-balance',                    'high'),
      ('이랜드월드',              '로엠',                 'roem',                           'low'),
      ('이랜드월드',              '쇼콜라',               'chocoolate',                     'low'),
      ('이랜드월드',              '후아유키즈',           'whoau-kids',                     'medium'),
      ('이랜드월드',              '로엠걸즈',             'roem-girls',                     'low'),
      ('이랜드월드',              '프롬비기닝',           'from-beginning',                 'medium'),
      ('나이키코리아',            '나이키',               'nike',                           'high'),
      ('나이키코리아',            '조던',                 'jordan',                         'medium'),
      ('나이키코리아',            '컨버스',               'converse',                       'medium'),
      ('무신사',                  '무신사 스탠다드',      'musinsa-standard',               'high'),
      ('무신사',                  '무신사 우먼',          'musinsa-standard-women',         'medium'),
      ('파크랜드',                '파크랜드',             'parkland',                       'low'),
      ('데상트코리아',            '데상트',               'descente',                       'high'),
      ('데상트코리아',            '르꼬끄',               'le-coq-sportif',                 'high'),
      ('데상트코리아',            '엄브로',               'umbro',                          'medium'),
      ('데상트코리아',            '먼싱웨어',             'munsingwear',                    'medium'),
      ('에이션패션',              '폴로 랄프로렌',        'polo-ralph-lauren',              'high'),
      ('케이투코리아',            '케이투',               'k2',                             'high'),
      ('케이투코리아',            '아이더',               'eider',                          'low'),
      ('동일라코스테',            '라코스테',             'lacoste',                        'high'),
      ('인동에프엔',              '쟈딕앤볼테르',         'zadig-et-voltaire',              'low'),
      ('인동에프엔',              '꾸레쥬',               'courreges',                      'low'),
      ('안다르',                  '안다르',               'andar',                          'high'),
      ('BYN블랙야크',             '블랙야크',             'black-yak',                      'high'),
      ('BYN블랙야크',             '나우',                 'nau',                            'low'),
      ('BYN블랙야크',             '마무트',               'mammut',                         'low'),
      ('네파',                    '네파',                 'nepa',                           'high'),
      ('하이라이트브랜즈',        '스탠리',               'stanley',                        'low'),
      ('하이라이트브랜즈',        '(핸드폰케이스 등)',     null,                             'low'),
      ('비케이브',                '커버낫',               'covernat',                       'high'),
      ('비케이브',                '리',                   'lee',                            'high'),
      ('비케이브',                '와키윌리',             'wakywilly',                      'high'),
      ('세정',                    '올리비아로렌',         'olivia-lauren',                  'low'),
      ('세정',                    '웰메이드',             'wellmade',                       'low'),
      ('세정',                    '인디안',               'indian',                         'low'),
      ('패션그룹형지',            '(까스텔바작 등)',       null,                             'low'),
      ('바바패션',                '(여성복 다수)',         null,                             'low'),
      ('아이더',                  '아이더',               'eider',                          'high'),
      ('피브이에이치코리아',      '캘빈클라인',           'calvin-klein',                   'high'),
      ('피브이에이치코리아',      '타미힐피거',           'tommy-hilfiger',                 'high'),
      ('서양네트웍스',            '블랭크',               'blank',                          'low'),
      ('서양네트웍스',            '(주얼리)',              null,                             'low'),
      ('레이어',                  '레이어',               'layer',                          'medium'),
      ('한성에프아이',            '(여성복)',              null,                             'low'),
      ('시선인터내셔널',          '쥬시꾸뛰르',           'juicy-couture',                  'low'),
      ('시선인터내셔널',          '데미안',               'demian',                         'low'),
      ('골든듀',                  '골든듀',               'goldendew',                      'low'),
      ('베네통코리아',            '베네통',               'benetton',                       'medium'),
      ('다이나핏코리아',          '다이나핏',             'dynafit',                        'low'),
      ('위비스',                  '에고이스트',           'egoist',                         'low'),
      ('위비스',                  '크레송',               'creson',                         'low'),
      ('제이씨패밀리',            '제이씨패밀리',         'jc-family',                      'low'),
      ('브이엘엔코',              '프라다',               'prada',                          'low'),
      ('푸마코리아',              '푸마',                 'puma',                           'high'),
      ('한국캘러웨이골프',        '캘러웨이',             'callaway-apparel',               'medium'),
      ('케이투세이프티',          '케이투세이프티',       'k2-safety',                      'low'),
      ('마뗑킴',                  '마뗑킴',               'matin-kim',                      'high'),
      ('더캐리',                  '더캐리',               'the-carrie',                     'low'),
      ('지오다노',                '지오다노',             'giordano',                       'high'),
      ('독립문',                  '크로커다일',           'crocodile',                      'low'),
      ('아이디룩',                '아이디룩',             'idlook',                         'low'),
      ('알레르망',                '알레르망',             'allerement',                     'low'),
      ('하이드어웨이',            '하이드어웨이',         'hideaway',                       'low'),
      ('피스피스스튜디오',        '피스피스스튜디오',     'piecepeace-studio',              'medium'),
      ('컬럼비아스포츠웨어코리아','컬럼비아',             'columbia',                       'high'),
      ('에스제이듀코',            '(여성복)',              null,                             'low'),
      ('우림에프엠지',            '(여성복)',              null,                             'low'),
      ('메디쿼터스',              '(라이프스타일)',        null,                             'low'),
      ('탠디',                    '탠디',                 'tandy',                          'low'),
      ('제이엔지코리아',          '(아동복)',              null,                             'low'),
      ('로저나인',                '로저나인',             'rogernine',                      'low'),
      ('레드페이스',              '레드페이스',           'redface',                        'medium'),
      ('원더플레이스',            '원더플레이스',         'wonder-place',                   'low'),
      ('에스제이그룹',            '카파',                 'kappa',                          'medium'),
      ('에스제이그룹',            '헬렌카민스키',         'helen-kaminski',                 'low')
    ) as t(company_name, brand_name, brand_slug_guess, confidence)
  ) loop
    -- company_id 조회
    select id into v_cid from companies where name = r.company_name;

    -- brand_id 조회 (slug 없으면 null)
    v_bid := null;
    if r.brand_slug_guess is not null then
      select id into v_bid from brands where slug = r.brand_slug_guess;
    end if;

    -- 매칭 성공 시에만 UPDATE (새 INSERT 금지)
    if v_cid is not null and v_bid is not null then
      update brands
      set company_id                 = v_cid,
          company_mapping_confidence = r.confidence
      where id = v_bid;
    end if;

    -- 결과 로그
    insert into company_brand_mapping_log
      (company_name, brand_name, brand_slug_guess, confidence, matched, brand_id)
    values
      (r.company_name, r.brand_name, r.brand_slug_guess, r.confidence,
       (v_cid is not null and v_bid is not null), v_bid);
  end loop;
end $$;


-- ============================================================
-- 3. B.CAVE 자사 브랜드 강제 매핑 (covernat / lee / wakywilly)
--    DO 블록에서 이미 처리됐으나 명시적으로 재확인
-- ============================================================

update brands
set company_id                 = (select id from companies where name = '비케이브'),
    company_mapping_confidence = 'high'
where slug in ('covernat', 'lee', 'wakywilly');


-- ============================================================
-- 검증 힌트 (실행 후 아래 쿼리로 결과 확인)
-- ============================================================
-- select count(*) from companies;                                    -- 98 예상
-- select * from companies where is_own = true;                       -- 비케이브 1건
-- select matched, count(*) from company_brand_mapping_log group by matched;
-- select b.slug, b.name, c.name, b.company_mapping_confidence
--   from brands b join companies c on c.id = b.company_id
--   order by c.name limit 20;
-- select count(*) from brands where company_id is null;
