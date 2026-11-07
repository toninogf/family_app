-- Las fotos de un piso pueden ser de la visita o capturas del anuncio (para conservarlo aunque lo borren del portal)
alter table public.home_photos add column if not exists kind text not null default 'foto' check (kind in ('foto', 'anuncio'));
