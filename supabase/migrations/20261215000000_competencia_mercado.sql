-- Competencia: cuánto tardan en irse los pisos parecidos, reapariciones y avisos de mercado

alter table public.sale_competitors add column if not exists listed_on date;            -- publicación del anuncio (si se sabe)
alter table public.sale_competitors add column if not exists off_market_on date;        -- día en que vimos que ya no estaba
alter table public.sale_competitors add column if not exists off_market_after date;     -- última vez que lo vimos a la venta (la salida fue entre una y otra)
alter table public.sale_competitors add column if not exists relisted smallint not null default 0 check (relisted between 0 and 50);
alter table public.sale_competitors add column if not exists old_urls text[] not null default '{}' check (cardinality(old_urls) <= 20);

-- Los que ya estaban vendidos o retirados: la salida, el último día visto
update public.sale_competitors set off_market_on = last_seen where status <> 'activo' and off_market_on is null;

alter table public.notify_queue drop constraint notify_queue_kind_check;
alter table public.notify_queue add constraint notify_queue_kind_check check (kind in ('propuesta', 'bajada', 'competidor', 'retirada', 'comp_vendido', 'mercado'));

-- Aviso: se ha vendido un piso parecido (de los aceptados)
create or replace function private.queue_comp_sold() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'vendido' and old.status is distinct from 'vendido' and new.review is null then
    insert into notify_queue (household_id, kind, ref_id, title, detail)
    values (new.household_id, 'comp_vendido', new.id, left(coalesce(new.title, 'Piso'), 200),
      concat_ws(' · ',
        case when new.price_cents is not null then private.eur(new.price_cents) end,
        case when new.price_cents is not null and new.size_m2 > 0 then private.eur((new.price_cents / new.size_m2)::bigint) || '/m²' end,
        case when coalesce(new.listed_on, new.first_seen) is not null then 'unos ' || (current_date - coalesce(new.listed_on, new.first_seen)) || ' días a la venta' end));
  end if;
  return new;
end $$;
revoke all on function private.queue_comp_sold() from public;
drop trigger if exists z_queue_comp_sold on public.sale_competitors;
create trigger z_queue_comp_sold after update of status on public.sale_competitors
  for each row execute function private.queue_comp_sold();

-- Aviso semanal: 4 semanas sin que se vaya ningún piso parecido (con al menos 5 a la venta y 4 semanas de seguimiento)
create or replace function private.market_stall_check() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select c.household_id, count(*) filter (where c.status = 'activo') as active
    from sale_competitors c
    where c.review is null
    group by c.household_id
    having count(*) filter (where c.status = 'activo') >= 5
       and min(c.first_seen) <= current_date - 28
       and not coalesce(bool_or(c.off_market_on >= current_date - 28), false)
  loop
    if not exists (select 1 from notify_queue q where q.household_id = r.household_id and q.kind = 'mercado' and q.created_at > now() - interval '27 days') then
      insert into notify_queue (household_id, kind, title, detail)
      values (r.household_id, 'mercado', 'Mercado parado en vuestra zona',
        'En 4 semanas no se ha vendido ni retirado ningún piso parecido (' || r.active || ' a la venta). Vale la pena revisar precio o presentación.');
    end if;
  end loop;
end $$;
revoke all on function private.market_stall_check() from public;
select cron.schedule('market-stall-check', '7 10 * * 1', $c$select private.market_stall_check()$c$);

-- La búsqueda automática: fecha de publicación, salida con fechas y reapariciones (same_as = id del retirado)
create or replace function private.upsert_competitors(hh uuid, items jsonb, market jsonb default null::jsonb)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  it jsonb;
  cur public.sale_competitors;
  p bigint;
  st text;
  lst date;
  added int := 0; updated int := 0; skipped int := 0; n_relisted int := 0; gone jsonb := '[]'; drops jsonb := '[]'; errors jsonb := '[]';
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 20 then raise exception 'Máximo 20 competidores'; end if;
  if upsert_competitors.market is not null and jsonb_typeof(upsert_competitors.market) = 'object' then
    update public.sale_listing
      set market = coalesce(sale_listing.market, '{}'::jsonb)
        || case
             when coalesce(sale_listing.market->>'paid_note', '') ilike 'notariado%'
              and coalesce(upsert_competitors.market->>'paid_note', '') not ilike 'notariado%'
             then jsonb_strip_nulls(upsert_competitors.market) - 'paid_m2' - 'paid_note'
             else jsonb_strip_nulls(upsert_competitors.market)
           end
        || jsonb_build_object('at', current_date)
      where household_id = hh;
  end if;
  for it in select * from jsonb_array_elements(items) loop
    begin
      p := nullif(it->>'price_cents', '')::bigint;
      st := coalesce(nullif(it->>'status', ''), 'activo');
      lst := case when coalesce(it->>'listed_on', '') ~ '^\d{4}-\d{2}-\d{2}$' and (it->>'listed_on')::date <= current_date then (it->>'listed_on')::date end;
      select c.* into cur from public.sale_competitors c
      where c.household_id = hh and it->>'url' is not null and (private.norm_url(c.url) = private.norm_url(it->>'url')
        or exists (select 1 from unnest(c.old_urls) u where private.norm_url(u) = private.norm_url(it->>'url'))) limit 1;
      -- Reaparición: mismo piso con otro anuncio (lo dice la búsqueda con same_as)
      if not found and coalesce(it->>'same_as', '') ~ '^[0-9a-f-]{36}$' then
        select c.* into cur from public.sale_competitors c where c.household_id = hh and c.id = (it->>'same_as')::uuid;
        if found and cur.review is distinct from 'rechazado' then
          update public.sale_competitors set
            old_urls = (case when url is not null then array_append(old_urls, url) else old_urls end)[1:20],
            url = coalesce(nullif(it->>'url', ''), url),
            relisted = least(relisted + 1, 50),
            status = 'activo', off_market_on = null, off_market_after = null, last_seen = current_date,
            price_cents = coalesce(p, price_cents),
            price_history = case when p is not null and p <> coalesce(cur.price_cents, -1)
              then (price_history || jsonb_build_array(jsonb_build_object('date', current_date, 'cents', p))) else price_history end,
            listed_on = coalesce(listed_on, lst)
          where id = cur.id;
          n_relisted := n_relisted + 1;
          continue;
        end if;
      end if;
      if found and cur.review = 'rechazado' then
        skipped := skipped + 1;
      elsif found then
        update public.sale_competitors set
          last_seen = current_date,
          status = st,
          -- Sale del mercado: entre la última vez que lo vimos y hoy
          off_market_on = case when st <> 'activo' and cur.status = 'activo' then current_date when st = 'activo' then null else off_market_on end,
          off_market_after = case when st <> 'activo' and cur.status = 'activo' then cur.last_seen when st = 'activo' then null else off_market_after end,
          relisted = case when st = 'activo' and cur.status <> 'activo' then least(relisted + 1, 50) else relisted end,
          listed_on = coalesce(listed_on, lst),
          price_cents = coalesce(p, price_cents),
          price_history = case when p is not null and p <> coalesce(cur.price_cents, -1)
            then (price_history || jsonb_build_array(jsonb_build_object('date', current_date, 'cents', p))) else price_history end,
          community_fee_cents = coalesce(community_fee_cents, nullif(it->>'community_fee_cents', '')::bigint),
          heating_type = coalesce(heating_type, nullif(it->>'heating_type', '')),
          energy = coalesce(energy, nullif(it->>'energy', '')),
          building_state = coalesce(nullif(it->>'building_state', ''), building_state),
          derrama_cents = coalesce(nullif(it->>'derrama_cents', '')::bigint, derrama_cents),
          year_built = coalesce(year_built, private.year_or_null(it->>'year_built')),
          building_reform_year = coalesce(private.year_or_null(it->>'building_reform_year'), building_reform_year)
        where id = cur.id;
        updated := updated + 1;
        if st <> 'activo' and cur.status = 'activo' then gone := gone || jsonb_build_object('title', cur.title, 'status', st); end if;
        if p is not null and cur.price_cents is not null and p < cur.price_cents then
          drops := drops || jsonb_build_object('title', cur.title, 'from', cur.price_cents, 'to', p);
        end if;
      else
        insert into public.sale_competitors (household_id, title, url, zone, price_cents, first_price_cents, size_m2, rooms, baths, floor, features, reform_year, condition,
          community_fee_cents, heating_type, energy, building_state, derrama_cents, noise, light, notes, source, price_history, year_built, building_reform_year, review, listed_on)
        values (hh, left(coalesce(nullif(it->>'title', ''), 'Piso'), 160), nullif(it->>'url', ''), left(nullif(it->>'zone', ''), 80), p, p,
          nullif(it->>'size_m2', '')::numeric, nullif(it->>'rooms', '')::smallint, nullif(it->>'baths', '')::smallint, left(nullif(it->>'floor', ''), 40),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(it->'features', '[]')) x), '{}'),
          nullif(it->>'reform_year', '')::smallint, nullif(it->>'condition', ''),
          nullif(it->>'community_fee_cents', '')::bigint, nullif(it->>'heating_type', ''), nullif(it->>'energy', ''), nullif(it->>'building_state', ''),
          nullif(it->>'derrama_cents', '')::bigint, nullif(it->>'noise', ''), nullif(it->>'light', ''),
          left(nullif(it->>'notes', ''), 600), 'ia',
          case when p is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('date', current_date, 'cents', p)) end,
          private.year_or_null(it->>'year_built'), private.year_or_null(it->>'building_reform_year'),
          'propuesta', lst);
        added := added + 1;
      end if;
    exception when others then
      errors := errors || jsonb_build_object('title', it->>'title', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('added', added, 'updated', updated, 'relisted', n_relisted, 'gone', gone, 'skipped_rejected', skipped, 'price_drops', drops, 'errors', errors);
end;
$function$;

-- El contexto de la búsqueda incluye id, fechas y datos para reconocer reapariciones
do $do$
declare d text;
begin
  d := pg_get_functiondef('private.sale_context'::regproc);
  d := replace(d, 'jsonb_build_object(''title'', c.title, ''url'', c.url, ''price_cents'', c.price_cents, ''status'', c.status, ''size_m2'', c.size_m2,',
                  'jsonb_build_object(''id'', c.id, ''title'', c.title, ''url'', c.url, ''old_urls'', c.old_urls, ''zone'', c.zone, ''rooms'', c.rooms, ''floor'', c.floor, ''price_cents'', c.price_cents, ''status'', c.status, ''size_m2'', c.size_m2, ''listed_on'', c.listed_on, ''first_seen'', c.first_seen, ''off_market_on'', c.off_market_on,');
  if position('old_urls' in d) = 0 then raise exception 'sale_context: no se pudo ampliar'; end if;
  execute d;
end $do$;

do $do$
declare d text;
begin
  d := pg_get_functiondef('private.market_stall_check'::regproc);
  d := replace(d, '''Mercado parado en vuestra zona'',', '''Sin ventas de pisos parecidos'',');
  execute d;
end $do$;
