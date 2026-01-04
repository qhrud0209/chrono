-- keyword 테이블에 description 컬럼을 추가합니다.
-- Supabase SQL Editor나 psql에서 실행하세요.

alter table public.keyword
  add column if not exists description text;
