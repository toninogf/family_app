-- «🙅 No nos interesa» en las propuestas automáticas: la ficha se borra y queda una huella para no volver a proponerla
-- (salvo bajada de precio ≥ 5 %) y para que la búsqueda aprenda del motivo.
create table if not exists public.home_rejections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  url text,
  links text[] not null default '{}',
  listing_ref text,
  municipality text,
  zone text,
  title text,
  price_cents bigint,
  size_m2 numeric,
  plot_m2 numeric,
  rooms int,
  reason text check (reason is null or reason in ('precio', 'ubicacion', 'parcela', 'estado', 'no_gusta', 'otro')),
  snapshot jsonb not null default '{}',
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  reproposed_at timestamptz
);
create index if not exists home_rejections_household_idx on public.home_rejections(household_id);
create index if not exists home_rejections_created_by_idx on public.home_rejections(created_by);
alter table public.home_rejections enable row level security;
revoke all on public.home_rejections from anon;
revoke insert, update on public.home_rejections from authenticated;
grant select, delete on public.home_rejections to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'home_rejections' and policyname = 'home_rejections_select') then
    create policy home_rejections_select on public.home_rejections for select to authenticated
      using ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
    create policy home_rejections_delete on public.home_rejections for delete to authenticated
      using ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
  end if;
end $$;

-- Rechazar una propuesta: guarda la huella (la app borra después la ficha con sus permisos normales)
create or replace function public.reject_proposal(p_home uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  h public.homes;
  rid uuid;
begin
  if not private.has_mfa() then raise exception 'Hace falta la verificación en dos pasos'; end if;
  select * into h from public.homes where id = p_home and household_id in (select private.current_household_ids());
  if not found then raise exception 'Piso no encontrado'; end if;
  if h.status <> 'propuesta' then raise exception 'Solo se pueden rechazar propuestas'; end if;
  if p_reason is not null and p_reason not in ('precio', 'ubicacion', 'parcela', 'estado', 'no_gusta', 'otro') then raise exception 'Motivo no válido'; end if;
  insert into public.home_rejections (household_id, url, links, listing_ref, municipality, zone, title, price_cents, size_m2, plot_m2, rooms, reason, snapshot, created_by)
  values (h.household_id, h.url, coalesce((select array_agg(l->>'url') from jsonb_array_elements(h.links) l where l->>'url' is not null), '{}'),
    h.listing_ref, h.municipality, h.zone, h.title, h.price_cents, h.size_m2, h.plot_m2, h.rooms, p_reason,
    to_jsonb(h) - 'id' - 'household_id' - 'created_by' - 'created_at' - 'cover_photo_id', private.current_member_id())
  returning id into rid;
  return rid;
end;
$$;
revoke all on function public.reject_proposal(uuid, text) from public, anon;
grant execute on function public.reject_proposal(uuid, text) to authenticated;

-- Volver a proponer una rechazada: recrea la ficha tal como estaba (la app borra después la huella)
create or replace function public.restore_rejection(p_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.home_rejections;
  nid uuid := gen_random_uuid();
begin
  if not private.has_mfa() then raise exception 'Hace falta la verificación en dos pasos'; end if;
  select * into r from public.home_rejections where id = p_id and household_id in (select private.current_household_ids());
  if not found then raise exception 'No encontrada'; end if;
  insert into public.homes
  select (jsonb_populate_record(null::public.homes, r.snapshot || jsonb_build_object('id', nid, 'household_id', r.household_id, 'status', 'propuesta', 'created_at', now()))).*;
  return nid;
end;
$$;
revoke all on function public.restore_rejection(uuid) from public, anon;
grant execute on function public.restore_rejection(uuid) to authenticated;

-- El contexto de la búsqueda incluye las rechazadas (para no repetir y aprender del motivo)
create or replace function private.search_context(hh uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'criteria', (select to_jsonb(c) - 'household_id' from public.search_criteria c where c.household_id = hh),
    'homes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'title', h.title, 'url', h.url, 'status', h.status, 'municipality', h.municipality, 'zone', h.zone, 'address', h.address,
      'price_cents', h.price_cents, 'size_m2', h.size_m2, 'plot_m2', h.plot_m2, 'rooms', h.rooms, 'listing_ref', h.listing_ref, 'agency', h.agency,
      'discard_reason', h.discard_reason,
      'links', (select coalesce(jsonb_agg(l->>'url'), '[]') from jsonb_array_elements(h.links) l)) order by h.created_at desc)
      from public.homes h where h.household_id = hh), '[]'),
    'rejected', coalesce((select jsonb_agg(jsonb_build_object(
      'title', r.title, 'url', r.url, 'municipality', r.municipality, 'zone', r.zone, 'price_cents', r.price_cents, 'size_m2', r.size_m2,
      'plot_m2', r.plot_m2, 'rooms', r.rooms, 'reason', r.reason, 'date', r.created_at::date) order by r.created_at desc)
      from (select * from public.home_rejections where household_id = hh order by created_at desc limit 150) r), '[]')
  )
$$;
revoke all on function private.search_context(uuid) from public, anon, authenticated;

-- Propuestas: no repetir las rechazadas (salvo bajada ≥ 5 %)
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
  rej public.home_rejections;
  rejected int := 0;
  again jsonb := '[]';
  note text;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 15 then raise exception 'Máximo 15 propuestas'; end if;
  for it in select * from jsonb_array_elements(items) loop
    begin
      p := nullif(it->>'price_cents', '')::bigint;
      note := nullif(it->>'notes', '');
      -- ¿La rechazasteis? Solo vuelve si ha bajado al menos un 5 %
      select r.* into rej from public.home_rejections r
      where r.household_id = hh and r.reproposed_at is null and (
        (it->>'url' is not null and (private.norm_url(r.url) = private.norm_url(it->>'url')
          or exists (select 1 from unnest(r.links) u where private.norm_url(u) = private.norm_url(it->>'url'))))
        or (coalesce(it->>'listing_ref', '') <> '' and r.listing_ref = it->>'listing_ref' and r.municipality is not distinct from it->>'municipality')
        or (r.municipality = it->>'municipality' and r.size_m2 is not null and nullif(it->>'size_m2', '') is not null
            and abs(r.size_m2 - (it->>'size_m2')::numeric) <= greatest(3, r.size_m2 * 0.03)
            and (r.plot_m2 is null or nullif(it->>'plot_m2', '') is null or abs(r.plot_m2 - (it->>'plot_m2')::numeric) <= greatest(10, r.plot_m2 * 0.05))
            and (r.rooms is null or nullif(it->>'rooms', '') is null or r.rooms = (it->>'rooms')::int))
      ) order by r.created_at desc limit 1;
      if found then
        if p is not null and rej.price_cents is not null and p <= rej.price_cents * 0.95 then
          note := concat_ws(E'\n', format('🙅 Lo rechazasteis el %s a %s €; ahora %s €.', to_char(rej.created_at at time zone 'Europe/Madrid', 'DD/MM'),
            replace(to_char(rej.price_cents / 100, 'FM999,999,999'), ',', '.'), replace(to_char(p / 100, 'FM999,999,999'), ',', '.')), note);
          update public.home_rejections set reproposed_at = now() where id = rej.id;
          again := again || jsonb_build_object('title', it->>'title', 'from', rej.price_cents, 'to', p);
        else
          rejected := rejected + 1;
          continue;
        end if;
      end if;
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
        coalesce(it->'links', '[]'), left(note, 1000), coalesce(it->'reform', '{}'))
      returning id into newid;
      created := created + 1;
    exception when others then
      errors := errors || jsonb_build_object('title', it->>'title', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('created', created, 'price_drops', drops, 'duplicates', skipped, 'rejected_skipped', rejected, 'rejected_again_cheaper', again, 'errors', errors);
end;
$$;
revoke all on function private.propose_homes(uuid, jsonb) from public, anon, authenticated;
