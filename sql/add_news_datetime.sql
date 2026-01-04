-- Add datetime column to news table for link -> news sync.
alter table public.news
  add column if not exists datetime timestamp;
