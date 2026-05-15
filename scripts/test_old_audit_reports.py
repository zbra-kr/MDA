"""
Phase 1.7 사전 테스트: 가장 오래된 감사보고서 5건의 DART document() 응답 형식 확인.
XML 정상이면 fallback (Vision API) 불필요.
"""

import os
import time

from dotenv import load_dotenv

load_dotenv('worker/.env')

import OpenDartReader

dart = OpenDartReader(os.environ['DART_API_KEY'])

# 2016년 최초 제출 감사보고서 5건 (FY2015 결산)
test_cases = [
    ('20160406000374', '20160406', '파크랜드'),
    ('20160415000205', '20160415', '패션그룹형지'),
    ('20160406000728', '20160406', '위비스'),
    ('20160414000227', '20160414', '네파'),
    ('20160407000895', '20160407', 'BYN블랙야크'),
]

print(f"=== {len(test_cases)} 건 테스트 ===\n")

for rcept_no, rcept_dt, name in test_cases:
    print(f"--- {rcept_dt} {name} (rcept_no={rcept_no}) ---")
    time.sleep(0.5)
    try:
        result = dart.document(rcept_no)

        print(f"타입: {type(result).__name__}")

        if isinstance(result, bytes):
            print(f"bytes 길이: {len(result)}")
            head = result[:200]
            print(f"앞 50 bytes hex: {head[:50].hex()}")
            if head.startswith(b'PK'):
                print("판정: ZIP 파일")
            elif head.startswith(b'%PDF'):
                print("판정: PDF 파일")
            elif b'<?xml' in head:
                print("판정: XML (bytes)")
            else:
                print(f"판정: 미상 (head={head[:100]!r})")

        elif isinstance(result, str):
            print(f"str 길이: {len(result)}")
            head = result[:200]
            if head.strip().startswith('<?xml') or '<DOCUMENT' in head:
                print("판정: XML")
                if 'TOT_SALES' in result or 'TOT_ASSETS' in result:
                    print("재무 추출 가능: YES (TOT_SALES 또는 TOT_ASSETS 발견)")
                elif '매출' in result or '자산총계' in result:
                    print("재무 추출 가능: 한글 텍스트 (별도 파싱 필요)")
                else:
                    print("재무 추출 가능: 확인 필요 (구조 다름)")
            else:
                print(f"판정: 일반 텍스트 (head={head!r})")

        else:
            print(f"기타 타입: {result}")

    except Exception as e:
        print(f"에러: {type(e).__name__}: {e}")

    print()
