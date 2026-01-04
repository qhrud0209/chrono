-- Delete all rows from news table.
-- Use TRUNCATE for fast removal; CASCADE if you have FKs referencing news.
truncate table public.news;
