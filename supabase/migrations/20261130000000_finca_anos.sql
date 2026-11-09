-- Año de construcción de la finca y de su rehabilitación (fachada, cubierta, instalaciones comunes…): pesan en la comparación
alter table public.sale_listing add column if not exists building_reform_year smallint check (building_reform_year between 1800 and 2100);
alter table public.sale_competitors add column if not exists year_built smallint check (year_built between 1700 and 2100);
alter table public.sale_competitors add column if not exists building_reform_year smallint check (building_reform_year between 1800 and 2100);

-- Año válido o null (lo que venga de la IA no debe romper la fila)
create or replace function private.year_or_null(x text)
returns smallint language sql immutable set search_path = ''
as $$ select case when x ~ '^\d{4}$' and x::int between 1700 and 2100 then x::smallint end $$;
revoke all on function private.year_or_null(text) from public, anon, authenticated;

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
  if upsert_competitors.market is not null and jsonb_typeof(upsert_competitors.market) = 'object' then
    -- Se suma a lo que ya había (si esta vez solo encuentra una referencia, no se pierde la otra)
    update public.sale_listing
      set market = coalesce(sale_listing.market, '{}'::jsonb)
        || case
             -- El dato notarial (lo pone Toni o la IA desde penotariado) no lo pisa una referencia peor (tasación, boletín…)
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
      select c.* into cur from public.sale_competitors c
      where c.household_id = hh and it->>'url' is not null and private.norm_url(c.url) = private.norm_url(it->>'url') limit 1;
      if found then
        update public.sale_competitors set
          last_seen = current_date,
          status = coalesce(nullif(it->>'status', ''), 'activo'),
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
        if p is not null and cur.price_cents is not null and p < cur.price_cents then
          drops := drops || jsonb_build_object('title', cur.title, 'from', cur.price_cents, 'to', p);
        end if;
      else
        insert into public.sale_competitors (household_id, title, url, zone, price_cents, first_price_cents, size_m2, rooms, baths, floor, features, reform_year, condition,
          community_fee_cents, heating_type, energy, building_state, derrama_cents, noise, light, notes, source, price_history, year_built, building_reform_year)
        values (hh, left(coalesce(nullif(it->>'title', ''), 'Piso'), 160), nullif(it->>'url', ''), left(nullif(it->>'zone', ''), 80), p, p,
          nullif(it->>'size_m2', '')::numeric, nullif(it->>'rooms', '')::smallint, nullif(it->>'baths', '')::smallint, left(nullif(it->>'floor', ''), 40),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(it->'features', '[]')) x), '{}'),
          nullif(it->>'reform_year', '')::smallint, nullif(it->>'condition', ''),
          nullif(it->>'community_fee_cents', '')::bigint, nullif(it->>'heating_type', ''), nullif(it->>'energy', ''), nullif(it->>'building_state', ''),
          nullif(it->>'derrama_cents', '')::bigint, nullif(it->>'noise', ''), nullif(it->>'light', ''),
          left(nullif(it->>'notes', ''), 600), 'ia',
          case when p is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('date', current_date, 'cents', p)) end,
          private.year_or_null(it->>'year_built'), private.year_or_null(it->>'building_reform_year'));
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
