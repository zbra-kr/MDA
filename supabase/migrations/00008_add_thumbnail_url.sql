-- 00008_add_thumbnail_url.sql
-- 랭킹 API 에서 항상 존재하는 작은 썸네일 URL 컬럼 추가.
-- main_image_url (00007) 보다 해상도가 낮지만 랭킹 수집 시점부터 채워진다.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

COMMENT ON COLUMN products.thumbnail_url IS
  '랭킹 API 의 작은 썸네일 (약 200×200). main_image_url 보다 먼저 채워짐.';
