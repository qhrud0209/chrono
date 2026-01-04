-- keyword 테이블에서 이름/본문 임베딩을 이용해 유사 키워드를 찾는 함수입니다.
-- Supabase SQL Editor나 psql에서 실행하세요.

create extension if not exists vector;

create or replace function public.match_keyword_embeddings(
  query_embedding vector(1536),
  match_count int default 12,
  use_name boolean default true,
  exclude_id bigint default null
)
returns table (
  id bigint,
  keyword text,
  description text,
  similarity double precision
)
language sql stable as $$
  with source as (
    select
      id,
      keyword,
      description,
      case
        when use_name and name_embedding is not null then name_embedding
        else embedding
      end as embedding_to_use
    from public.keyword
  )
  select
    id,
    keyword,
    description,
    1 - (embedding_to_use <=> query_embedding) as similarity
  from source
  where embedding_to_use is not null
    and (exclude_id is null or id <> exclude_id)
  order by embedding_to_use <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_keyword_embeddings(vector, int, boolean, bigint) to anon, authenticated;
