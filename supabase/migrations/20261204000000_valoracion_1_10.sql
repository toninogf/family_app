-- Valoración de cada casa del 1 al 10 (antes 1–5): se pasan las que había (×2)
alter table public.home_ratings drop constraint if exists home_ratings_score_check;
update public.home_ratings set score = score * 2 where score <= 5;
alter table public.home_ratings add constraint home_ratings_score_check check (score between 1 and 10);
