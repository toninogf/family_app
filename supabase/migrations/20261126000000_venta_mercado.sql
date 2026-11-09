-- ¿Estamos en precio? Datos de nuestro piso que pesan en la comparación, referencias de la zona y la competencia
alter table public.sale_listing add column if not exists reform_year smallint check (reform_year is null or reform_year between 1900 and 2100);
alter table public.sale_listing add column if not exists orientation text check (orientation is null or orientation in ('norte', 'sur', 'este', 'oeste', 'noreste', 'noroeste', 'sureste', 'suroeste'));
-- Referencias de la zona: { paid_m2, asking_m2, avg_days, source, at } (las rellena la búsqueda o a mano)
alter table public.sale_listing add column if not exists market jsonb not null default '{}' check (jsonb_typeof(market) = 'object' and pg_column_size(market) < 4000);

-- Pisos parecidos al nuestro en venta (la competencia)
create table if not exists public.sale_competitors (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 500)),
  zone text check (zone is null or char_length(zone) <= 80),
  price_cents bigint check (price_cents is null or price_cents between 0 and 10000000000),
  first_price_cents bigint check (first_price_cents is null or first_price_cents between 0 and 10000000000),
  size_m2 numeric check (size_m2 is null or size_m2 between 1 and 100000),
  rooms smallint check (rooms is null or rooms between 0 and 50),
  baths smallint check (baths is null or baths between 0 and 50),
  floor text check (floor is null or char_length(floor) <= 40),
  features text[] not null default '{}' check (cardinality(features) <= 60),
  reform_year smallint check (reform_year is null or reform_year between 1900 and 2100),
  condition text check (condition is null or condition in ('nuevo', 'reformado', 'buen_estado', 'a_reformar')),
  status text not null default 'activo' check (status in ('activo', 'vendido', 'retirado')),
  first_seen date not null default current_date,
  last_seen date not null default current_date,
  price_history jsonb not null default '[]' check (jsonb_typeof(price_history) = 'array' and jsonb_array_length(price_history) <= 60),
  notes text check (notes is null or char_length(notes) <= 600),
  source text not null default 'manual' check (source in ('manual', 'ia')),
  created_at timestamptz not null default now()
);
create index if not exists sale_competitors_household_idx on public.sale_competitors(household_id);
alter table public.sale_competitors enable row level security;
revoke all on public.sale_competitors from anon;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_competitors' and policyname = 'sale_competitors_all') then
    create policy sale_competitors_all on public.sale_competitors for all to authenticated
      using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
      with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
  end if;
end $$;

-- Para la búsqueda programada: guarda o actualiza competidores (por enlace) y las referencias de la zona
create or replace function private.upsert_competitors(hh uuid, items jsonb, market jsonb default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  it jsonb;
  cur public.sale_competitors;
  p bigint;
  added int := 0; updated int := 0; drops jsonb := '[]'; errors jsonb := '[]';
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 20 then raise exception 'Máximo 20 competidores'; end if;
  if market is not null and jsonb_typeof(market) = 'object' then
    update public.sale_listing set market = (market || jsonb_build_object('at', current_date)) where household_id = hh;
  end if;
  for it in select * from jsonb_array_elements(items) loop
    begin
      p := nullif(it->>'price_cents', '')::bigint;
      select c.* into cur from public.sale_competitors c
      where c.household_id = hh and it->>'url' is not null and private.norm_url(c.url) = private.norm_url(it->>'url') limit 1;
      if found then
        update public.sale_competitors set
          last_seen = current_date,
          status = coalesce(nullif(it->>'status', ''), 'activo'),
          price_cents = coalesce(p, price_cents),
          price_history = case when p is not null and p <> coalesce(cur.price_cents, -1)
            then (price_history || jsonb_build_array(jsonb_build_object('date', current_date, 'cents', p))) else price_history end
        where id = cur.id;
        updated := updated + 1;
        if p is not null and cur.price_cents is not null and p < cur.price_cents then
          drops := drops || jsonb_build_object('title', cur.title, 'from', cur.price_cents, 'to', p);
        end if;
      else
        insert into public.sale_competitors (household_id, title, url, zone, price_cents, first_price_cents, size_m2, rooms, baths, floor, features, reform_year, condition, notes, source, price_history)
        values (hh, left(coalesce(nullif(it->>'title', ''), 'Piso'), 160), nullif(it->>'url', ''), left(nullif(it->>'zone', ''), 80), p, p,
          nullif(it->>'size_m2', '')::numeric, nullif(it->>'rooms', '')::smallint, nullif(it->>'baths', '')::smallint, left(nullif(it->>'floor', ''), 40),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(it->'features', '[]')) x), '{}'),
          nullif(it->>'reform_year', '')::smallint, nullif(it->>'condition', ''), left(nullif(it->>'notes', ''), 600), 'ia',
          case when p is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('date', current_date, 'cents', p)) end);
        added := added + 1;
      end if;
    exception when others then
      errors := errors || jsonb_build_object('title', it->>'title', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('added', added, 'updated', updated, 'price_drops', drops, 'errors', errors);
end;
$$;
revoke all on function private.upsert_competitors(uuid, jsonb, jsonb) from public, anon, authenticated;

-- Contexto de venta para la búsqueda: nuestro piso y la competencia que ya hay
create or replace function private.sale_context(hh uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'listing', (select to_jsonb(l) - 'household_id' - 'mortgage_cents' - 'costs' - 'notes' - 'description' from public.sale_listing l where l.household_id = hh),
    'competitors', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'url', c.url, 'price_cents', c.price_cents, 'status', c.status, 'size_m2', c.size_m2, 'last_seen', c.last_seen))
      from public.sale_competitors c where c.household_id = hh), '[]')
  )
$$;
revoke all on function private.sale_context(uuid) from public, anon, authenticated;
