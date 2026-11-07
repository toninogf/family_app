-- Posición de cada piso para el mapa de Buscamos
alter table public.homes
  add column if not exists lat double precision check (lat is null or lat between -90 and 90),
  add column if not exists lng double precision check (lng is null or lng between -180 and 180),
  add column if not exists geo_precision text check (geo_precision is null or geo_precision in ('exacta', 'calle', 'zona', 'localidad')),
  add column if not exists geo_query text check (geo_query is null or char_length(geo_query) <= 400);
