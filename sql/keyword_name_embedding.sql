-- keyword 테이블에 이름 전용 임베딩 컬럼을 추가합니다.
-- Supabase SQL Editor나 psql에서 실행하세요.

create extension if not exists vector;

alter table public.keyword
  add column if not exists name_embedding vector(1536);
