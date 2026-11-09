-- Búsqueda programada de pisos (martes y viernes): estado «propuesta» y funciones para que la tarea lea el contexto y proponga pisos
alter table public.homes drop constraint if exists homes_status_check;
alter table public.homes add constraint homes_status_check check (status in ('propuesta', 'interesa', 'llamar', 'visita_pedida', 'visitado', 'favorito', 'descartado', 'oferta'));

-- Contexto para la búsqueda: criterios y pisos ya guardados (para no repetir), de un hogar
create or replace function private.search_context(hh uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'criteria', (select to_jsonb(c) - 'household_id' from public.search_criteria c where c.household_id = hh),
    'homes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'title', h.title, 'url', h.url, 'status', h.status, 'municipality', h.municipality, 'zone', h.zone, 'address', h.address,
      'price_cents', h.price_cents, 'size_m2', h.size_m2, 'plot_m2', h.plot_m2, 'rooms', h.rooms, 'listing_ref', h.listing_ref, 'agency', h.agency,
      'links', (select coalesce(jsonb_agg(l->>'url'), '[]') from jsonb_array_elements(h.links) l)) order by h.created_at desc)
      from public.homes h where h.household_id = hh), '[]')
  )
$$;
revoke all on function private.search_context(uuid) from public, anon, authenticated;

-- Normaliza un enlace para comparar (sin parámetros, sin barra final, sin www)
create or replace function private.norm_url(u text)
returns text
language sql immutable set search_path = ''
as $$ select lower(regexp_replace(regexp_replace(regexp_replace(coalesce(u, ''), '[?#].*$', ''), '/+$', ''), '^https?://(www\.)?', '')) $$;

-- Guarda propuestas (array JSON). Cada una: title, url, price_cents, size_m2, plot_m2, useful_m2, rooms, baths, year_built, municipality,
-- province, zone, address, features[], heating_type, cooling, energy, agency, advertiser, listing_ref, contact_phone, links[], notes, reform{}.
-- Repetidos (mismo enlace o referencia, o misma localidad con metros y precio casi iguales) no se crean: si bajan de precio se anota en el existente.
create or replace function private.propose_homes(hh uuid, items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  it jsonb;
  dup public.homes;
  created int := 0;
  drops jsonb := '[]';
  skipped int := 0;
  errors jsonb := '[]';
  newid uuid;
  p bigint;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 15 then raise exception 'Máximo 15 propuestas'; end if;
  for it in select * from jsonb_array_elements(items) loop
    begin
      p := nullif(it->>'price_cents', '')::bigint;
      select h.* into dup from public.homes h
      where h.household_id = hh and (
        (it->>'url' is not null and (private.norm_url(h.url) = private.norm_url(it->>'url')
          or exists (select 1 from jsonb_array_elements(h.links) l where private.norm_url(l->>'url') = private.norm_url(it->>'url'))))
        or (coalesce(it->>'listing_ref', '') <> '' and h.listing_ref = it->>'listing_ref' and h.municipality is not distinct from it->>'municipality')
        or (h.municipality = it->>'municipality' and h.size_m2 is not null and nullif(it->>'size_m2', '') is not null
            and abs(h.size_m2 - (it->>'size_m2')::numeric) <= greatest(3, h.size_m2 * 0.03)
            and (h.plot_m2 is null or nullif(it->>'plot_m2', '') is null or abs(h.plot_m2 - (it->>'plot_m2')::numeric) <= greatest(10, h.plot_m2 * 0.05))
            and (h.rooms is null or nullif(it->>'rooms', '') is null or h.rooms = (it->>'rooms')::int))
      ) limit 1;
      if found then
        if p is not null and dup.price_cents is not null and p < dup.price_cents then
          update public.homes set
            notes = left(concat_ws(E'\n', format('🤖 %s: ha bajado de %s € a %s €', to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY'),
              replace(to_char(dup.price_cents / 100, 'FM999,999,999'), ',', '.'), replace(to_char(p / 100, 'FM999,999,999'), ',', '.')), notes), 1000),
            price_cents = p
          where id = dup.id;
          drops := drops || jsonb_build_object('id', dup.id, 'title', dup.title, 'status', dup.status, 'from', dup.price_cents, 'to', p);
        else
          skipped := skipped + 1;
        end if;
        continue;
      end if;
      insert into public.homes (household_id, status, title, url, price_cents, size_m2, plot_m2, useful_m2, rooms, baths, year_built, municipality, province, zone, address,
        features, heating_type, cooling, energy, agency, advertiser, listing_ref, contact_phone, links, notes, reform)
      values (hh, 'propuesta', left(coalesce(nullif(it->>'title', ''), 'Propuesta'), 120), nullif(it->>'url', ''), p,
        nullif(it->>'size_m2', '')::numeric, nullif(it->>'plot_m2', '')::numeric, nullif(it->>'useful_m2', '')::numeric,
        nullif(it->>'rooms', '')::int, nullif(it->>'baths', '')::int, nullif(it->>'year_built', '')::int,
        nullif(it->>'municipality', ''), coalesce(nullif(it->>'province', ''), 'Madrid'), left(nullif(it->>'zone', ''), 60), left(nullif(it->>'address', ''), 120),
        coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(it->'features', '[]')) x), '{}'),
        nullif(it->>'heating_type', ''), nullif(it->>'cooling', ''), nullif(it->>'energy', ''), left(nullif(it->>'agency', ''), 120),
        nullif(it->>'advertiser', ''), left(nullif(it->>'listing_ref', ''), 60), left(nullif(it->>'contact_phone', ''), 30),
        coalesce(it->'links', '[]'), left(nullif(it->>'notes', ''), 1000), coalesce(it->'reform', '{}'))
      returning id into newid;
      created := created + 1;
    exception when others then
      errors := errors || jsonb_build_object('title', it->>'title', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('created', created, 'price_drops', drops, 'duplicates', skipped, 'errors', errors);
end;
$$;
revoke all on function private.propose_homes(uuid, jsonb) from public, anon, authenticated;
