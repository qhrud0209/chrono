-- Drop unused media column from news table.
alter table public.news
drop column if exists media;
