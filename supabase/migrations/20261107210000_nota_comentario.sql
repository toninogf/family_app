-- La nota de cada uno pasa a tener un único comentario (en vez de «lo mejor» y «lo peor»)
alter table public.home_ratings add column if not exists comment text check (comment is null or char_length(comment) <= 1000);
-- Se conserva lo que ya hubiera escrito
update public.home_ratings
  set comment = nullif(concat_ws(E'\n', case when best is not null then '👍 ' || best end, case when worst is not null then '👎 ' || worst end), '')
  where comment is null and (best is not null or worst is not null);
