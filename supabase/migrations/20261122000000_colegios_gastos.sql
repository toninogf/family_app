-- 1) Gastos de compra estimados por piso: valor de referencia del Catastro (base del ITP si es mayor) y obra nueva
alter table public.homes add column if not exists ref_value_cents bigint check (ref_value_cents is null or ref_value_cents between 0 and 10000000000);
alter table public.homes add column if not exists new_build boolean not null default false;

-- 2) Colegios de la Comunidad de Madrid (datos abiertos: centros educativos + opciones lingüísticas), para buscar los cercanos.
--    Coordenadas UTM ETRS89 huso 30 (metros), como vienen en el fichero.
create table if not exists public.schools (
  code integer primary key,
  name text not null,
  kind text not null check (kind in ('infantil', 'primaria', 'prim_sec', 'secundaria', 'internacional')),
  type_abbr text not null,
  type_desc text,
  ownership text not null check (ownership in ('publico', 'concertado', 'privado')),
  municipality text,
  address text,
  phone text,
  web text,
  email text,
  utm_x integer not null,
  utm_y integer not null,
  bilingual text,
  updated_at timestamptz not null default now()
);
create index if not exists schools_utm on public.schools (utm_x, utm_y);
alter table public.schools enable row level security;
revoke all on public.schools from anon;
revoke insert, update, delete, truncate on public.schools from authenticated;
grant select on public.schools to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'schools' and policyname = 'schools_read') then
    create policy schools_read on public.schools for select to authenticated using ((select private.has_mfa()));
  end if;
end $$;

-- Descarga mensual de los datos abiertos (pg_net es asíncrono: se pide y unos minutos después se carga)
create table if not exists private.school_fetch (kind text primary key, request_id bigint not null, at timestamptz not null default now());

create or replace function private.fetch_schools()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.school_fetch (kind, request_id) values
    ('centros', net.http_get(url := 'https://datos.comunidad.madrid/dataset/c750856d-3166-4dac-8e80-d1b824c968b5/resource/28d60557-1d73-4281-ab08-6cfd3b2f5f83/download/centros_educativos.csv', timeout_milliseconds := 60000)),
    ('idiomas', net.http_get(url := 'https://datos.comunidad.madrid/dataset/444208d8-8658-40ab-a5f2-665b353a4ffe/resource/1040659c-2d0c-4074-9e78-7e81c76bb6a9/download/opciones_linguisticas.csv', timeout_milliseconds := 60000))
  on conflict (kind) do update set request_id = excluded.request_id, at = now();
end;
$$;

create or replace function private.load_schools()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  c text;
  i text;
  n integer;
begin
  select r.content into c from net._http_response r join private.school_fetch f on f.request_id = r.id where f.kind = 'centros' and r.status_code = 200;
  if c is null or length(c) < 100000 then return 0; end if;
  select r.content into i from net._http_response r join private.school_fetch f on f.request_id = r.id where f.kind = 'idiomas' and r.status_code = 200;

  with lrows as (
    select string_to_array(regexp_replace(l, E'\r$', ''), ';') a
    from regexp_split_to_table(coalesce(i, ''), E'\n') with ordinality t(l, k) where k > 1 and l <> ''
  ), ling as (
    select a[1]::integer code, nullif(concat_ws(', ',
      case a[11] when 'IN' then 'bilingüe en inglés' when 'FR' then 'bilingüe en francés' when 'AL' then 'bilingüe en alemán' else null end,
      case when a[12] = 'S' then 'British Council' end,
      case when a[13] = 'S' then 'sección de inglés' end,
      case when a[14] = 'S' then 'sección de francés' end,
      case when a[15] = 'S' then 'sección de alemán' end), '') bil
    from lrows where a[1] ~ '^\d+$'
  ), crows as (
    select string_to_array(regexp_replace(l, E'\r$', ''), ';') a
    from regexp_split_to_table(c, E'\n') with ordinality t(l, k) where k > 1 and l <> ''
  ), src as (
    select a[1]::integer code, trim(a[2]) name, trim(a[4]) abbr, trim(a[5]) tdesc, trim(a[6]) tit, trim(a[17]) muni,
      nullif(trim(concat_ws(' ', nullif(a[12], ''), a[13], nullif(a[14], ''))), '') addr, nullif(nullif(trim(a[20]), ''), '0') phone,
      nullif(trim(a[25]), '') web, nullif(trim(a[26]), '') email, a[28] x, a[29] y, a[30] sit,
      case
        when trim(a[4]) in ('EEI', 'EEI-CN', 'EIPR', 'CPR INF', 'ZNAS.CN.') then 'infantil'
        when trim(a[4]) in ('CP INF-PRI', 'CPR INF-PRI', 'CPR PRI') then 'primaria'
        when trim(a[4]) in ('CP INF-PRI-SEC', 'CPR INF-PRI-SEC', 'CPR PRI-SEC') then 'prim_sec'
        when trim(a[4]) in ('IES', 'CPR ES') then 'secundaria'
        when trim(a[4]) = 'CEXTRAN ESP' then 'internacional'
      end kind
    from crows where a[1] ~ '^\d+$' and array_length(a, 1) >= 30
  )
  insert into public.schools (code, name, kind, type_abbr, type_desc, ownership, municipality, address, phone, web, email, utm_x, utm_y, bilingual, updated_at)
  select s.code, left(s.name, 200), s.kind, left(s.abbr, 40), left(s.tdesc, 200),
    case when s.tit like 'PÚBLICO%' or s.tit like 'PUBLICO%' then 'publico' when s.tit like '%CONCERTADO%' then 'concertado' else 'privado' end,
    left(s.muni, 100), left(s.addr, 200), left(s.phone, 30), left(s.web, 300), left(s.email, 200), s.x::integer, s.y::integer, l.bil, now()
  from src s left join ling l on l.code = s.code
  where s.sit = 'ALTA' and s.kind is not null and s.x ~ '^\d+$' and s.y ~ '^\d+$'
  on conflict (code) do update set name = excluded.name, kind = excluded.kind, type_abbr = excluded.type_abbr, type_desc = excluded.type_desc,
    ownership = excluded.ownership, municipality = excluded.municipality, address = excluded.address, phone = excluded.phone, web = excluded.web,
    email = excluded.email, utm_x = excluded.utm_x, utm_y = excluded.utm_y, bilingual = excluded.bilingual, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  -- Solo se borran los que ya no están si la carga ha ido bien (no vaciar por un fichero roto)
  if n > 1000 then delete from public.schools where updated_at < now(); end if;
  return n;
end;
$$;
revoke all on function private.fetch_schools() from public, anon, authenticated;
revoke all on function private.load_schools() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'schools-fetch') then
    perform cron.schedule('schools-fetch', '17 3 2 * *', 'select private.fetch_schools()');
    perform cron.schedule('schools-load', '37 3 2 * *', 'select private.load_schools()');
  end if;
end $$;
