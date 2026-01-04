-- news 테이블에 임베딩 컬럼을 직접 추가하고, 매칭 함수를 생성합니다.
-- Supabase SQL Editor나 psql에서 실행하세요.

create extension if not exists vector;

-- news 테이블에 임베딩 컬럼 추가
alter table public.news
  add column if not exists embedding vector(1536);

-- 선택: 검색 속도 향상을 위한 ivfflat 인덱스 (데이터가 충분히 있을 때 생성)
-- create index if not exists news_embedding_idx
--   on public.news
--   using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);

-- 임베딩이 news 테이블에 직접 들어간다고 가정하고 매칭 함수 생성
create or replace function public.match_news_embeddings(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  news_id bigint,
  title text,
  content text,
  similarity double precision
)
language sql stable as $$
  select
    id as news_id,
    title,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from public.news
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- 권한: 익명 키로 호출할 수 있도록 RPC를 공개 (필요 시 주석 처리)
grant execute on function public.match_news_embeddings(vector, int) to anon, authenticated;
