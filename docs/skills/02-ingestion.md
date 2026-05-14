# Skill 02: Ingestion (Supabase 적재)

> 스크래퍼가 반환한 dict를 Supabase 스키마로 정규화하여 적재한다. 이미지·임베딩까지 본 모듈이 담당.

## 1. 디렉토리

```
worker/ingest/
├── __init__.py
├── supabase_writer.py   테이블별 upsert/insert 함수
├── image_pipeline.py    이미지 다운로드·해시·Storage 업로드
└── embedder.py          bge-m3로 텍스트 임베딩
```

## 2. 기술 스택

```toml
dependencies = [
  "supabase>=2.7",
  "httpx>=0.27",          # 이미지 다운로드
  "Pillow>=10.3",
  "imagehash>=4.3",
  "ollama>=0.3",          # 임베딩 호출 (Ollama Python SDK)
  "pydantic>=2.6",
]
```

## 3. Supabase 클라이언트 (`supabase_writer.py`)

### 3.1 초기화

```python
from supabase import create_client, Client
import os

def get_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],  # service_role, RLS bypass
    )
```

### 3.2 핵심 함수 (각 테이블별 1개씩)

**브랜드 upsert**:
```python
def upsert_brand(client: Client, slug: str, name: str, **kwargs) -> str:
    """slug 기준 upsert, brand_id 반환"""
```

**상품 upsert**:
```python
def upsert_product(client: Client, musinsa_no: str, brand_id: str, **fields) -> str:
    """
    musinsa_no 기준 upsert.
    embedding은 별도 함수에서 갱신 (cost 큰 작업이라 분리).
    product_id 반환.
    """
```

**스냅샷 insert** (가장 빈번):
```python
def insert_snapshot(client: Client, snapshot: dict) -> None:
    """
    (product_id, snapshot_date) UNIQUE.
    이미 있으면 conflict 무시 (ON CONFLICT DO NOTHING).
    Supabase의 .upsert(..., on_conflict='product_id,snapshot_date', ignore_duplicates=True) 사용.
    """
```

**bulk insert 패턴**:
```python
def insert_snapshots_bulk(client: Client, snapshots: list[dict], batch_size: int = 500) -> int:
    """
    500건씩 묶어서 insert. 반환은 적재 성공 건수.
    실패한 배치는 로깅 후 계속 진행 (다른 배치 영향 없도록).
    """
```

### 3.3 트랜잭션 패턴

Supabase는 REST API라 트랜잭션이 약하다. 대안:
- 동일 product에 대한 product/image/snapshot은 application 레벨에서 순서 보장
- 실패 시 보상 트랜잭션 (예: snapshot 실패 → image 롤백 안 함, 다음날 재시도)

### 3.4 멱등성

본 시스템은 **재실행 안전**이 핵심. 같은 날 2번 돌려도 같은 결과:
- `products`: musinsa_no UNIQUE → upsert
- `product_snapshots`: (product_id, snapshot_date) UNIQUE → insert + on_conflict ignore
- `product_images`: (product_id, perceptual_hash) UNIQUE 추가 권장

## 4. 이미지 파이프라인 (`image_pipeline.py`)

### 4.1 흐름
```
스크래퍼가 준 image_url 리스트
  ↓ httpx 다운로드
  ↓ Pillow로 WebP 변환, max 1024px 리사이즈
  ↓ imagehash (phash) 계산
  ↓ 같은 product 내 중복 phash 제거
  ↓ Supabase Storage 업로드
  ↓ cdn_url 받아서 product_images 테이블에 저장
```

### 4.2 함수 시그니처

```python
async def process_product_images(
    client: Client,
    product_id: str,
    musinsa_no: str,
    brand_slug: str,
    image_urls: list[ImageMeta],
) -> list[str]:
    """
    이미지를 다운로드→리사이즈→해시→업로드까지 수행.
    이미 같은 phash가 product_images에 있으면 스킵.
    반환: 적재된 image_id 리스트.
    """
```

### 4.3 Storage 경로 규약

```
competitor-images/
  {brand_slug}/
    {musinsa_no}/
      main_0.webp
      main_1.webp
      detail_0.webp
      detail_1.webp
```

### 4.4 비용 관리
- 매일 신규 상품의 이미지만 다운 (이미 product_images에 있는 musinsa_no는 스킵)
- 30일 후 cold storage 이동 (Phase 3 자동화, Phase 1은 수동)
- max 이미지 크기 200KB 목표 (WebP quality=80)

### 4.5 실패 처리
- 다운로드 실패: 3회 재시도 후 포기, 로그만 남김 (다음날 재시도 가능)
- Storage 업로드 실패: 디스크에 임시 저장 후 다음 배치에서 재업로드

## 5. 임베딩 (`embedder.py`)

### 5.1 모델
- `bge-m3` (Ollama)
- 차원: 1024
- 다국어 (한·영 혼합 가능)

### 5.2 입력 텍스트 정규화

```python
def build_embedding_text(brand_name: str, product_name: str,
                         category_path: str, description: str) -> str:
    """
    임베딩 입력은 일관된 포맷이어야 의미 비교가 의미 있음.
    """
    desc_short = (description or "")[:200]
    return f"브랜드: {brand_name}\n상품명: {product_name}\n카테고리: {category_path}\n설명: {desc_short}"
```

### 5.3 호출

```python
import ollama

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://ollama:11434")
client = ollama.Client(host=OLLAMA_HOST)

def embed(text: str) -> list[float]:
    """bge-m3 임베딩, 1024 dim"""
    resp = client.embeddings(model="bge-m3", prompt=text)
    return resp["embedding"]
```

### 5.4 배치 임베딩

```python
async def embed_pending_products(client: Client, limit: int = 500) -> int:
    """
    products.embedding IS NULL 인 row를 limit개 가져와 임베딩 채움.
    반환: 처리 건수.
    """
```

이 함수를 매일 적재 후 호출 → 신규 상품만 임베딩.

### 5.5 임베딩 갱신 정책
- 신규 상품: 즉시
- 기존 상품: 상품명·설명 변경 감지 시 (Phase 2에서 변경 감지 로직 추가)
- 모델 변경 시: 전체 재임베딩 (마이그레이션 절차 필요)

## 6. main 진입 예시

```python
# worker/main.py 발췌
async def scrape_and_ingest_ranking(category_code: str):
    from worker.scrapers.musinsa_ranking import MusinsaRankingScraper
    from worker.ingest.supabase_writer import get_client, upsert_brand, upsert_product, insert_snapshots_bulk

    sb = get_client()
    async with MusinsaRankingScraper() as scraper:
        items = await scraper.scrape(category_code=category_code)

    # brand, product upsert
    snapshots = []
    for item in items:
        brand_id = upsert_brand(sb, item["brand_slug"], item["brand_name"])
        product_id = upsert_product(sb, item["musinsa_no"], brand_id,
                                     name=item["product_name"],
                                     list_price=item["list_price"],
                                     # ...
                                    )
        snapshots.append({
            "product_id": product_id,
            "snapshot_date": item["scraped_at"].date(),
            "rank_main": item["rank_main"],
            "current_price": item["current_price"],
            "discount_rate": item["discount_rate"],
        })

    insert_snapshots_bulk(sb, snapshots)
```

## 7. 거버넌스 강제 사항
- service_role 키는 절대 로그 출력 금지
- 이미지 EXIF는 stripping (Pillow `image.info` 제거)
- 리뷰 텍스트는 작성자 식별 가능 정보가 있으면 적재 전 마스킹

## 8. 단위 테스트
- Supabase는 로컬 supabase CLI로 띄워서 통합 테스트
- 임베딩은 mock (실제 ollama 호출 없이 길이 1024 random vector)
- 이미지 파이프라인은 fixture 이미지 사용
