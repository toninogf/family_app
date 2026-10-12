-- Mudanza: vender nuestro piso (por nuestra cuenta) y buscar casa nueva.
-- Las visitas se reflejan automáticamente como actividades familiares en la Agenda (tabla events).

-- ---------- Utilidades ----------
create or replace function private.my_household()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.household_id from public.members m where m.id = private.current_member_id()
$$;
revoke all on function private.my_household() from public, anon, authenticated;

-- Lista de enlaces [{label, url}] solo con https
create or replace function private.links_ok(j jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= 10 and not exists (
    select 1 from jsonb_array_elements(j) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e->>'url', '') !~ '^https://'
       or char_length(e->>'url') > 500
       or char_length(coalesce(e->>'label', '')) > 40
  )
$$;

-- Las visitas aparecen en la Agenda como actividades de la familia
alter table public.events add column if not exists origin text check (origin in ('venta', 'compra'));

-- ---------- Vendemos ----------
create table public.sale_listing (
  household_id uuid primary key references public.households(id) on delete cascade,
  price_cents bigint check (price_cents is null or price_cents between 0 and 100000000000),
  published_on date,
  links jsonb not null default '[]' check (private.links_ok(links)),
  notes text check (notes is null or char_length(notes) <= 1000),
  updated_at timestamptz not null default now()
);

create table public.sale_price_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  price_cents bigint not null,
  changed_on date not null default current_date,
  changed_at timestamptz not null default now()
);
create index sale_price_history_household_idx on public.sale_price_history(household_id, changed_at);

create table public.buyer_visits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  visit_date date not null,
  start_time time not null,
  end_time time,
  contact_name text check (contact_name is null or char_length(contact_name) <= 80),
  contact_phone text check (contact_phone is null or contact_phone ~ '^[0-9 +().-]{3,30}$'),
  source text check (source in ('idealista', 'fotocasa', 'habitaclia', 'wallapop', 'cartel', 'conocidos', 'otro')),
  host_id uuid references public.members(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'no_show')),
  interest text check (interest in ('high', 'medium', 'low')),
  liked text check (liked is null or char_length(liked) <= 500),
  objections text[] not null default '{}' check (cardinality(objections) <= 12 and char_length(array_to_string(objections, '|')) <= 600),
  notes text check (notes is null or char_length(notes) <= 1000),
  prep_done text[] not null default '{}' check (cardinality(prep_done) <= 20),
  event_id uuid,   -- actividad espejo en la Agenda (sin clave foránea: la gestiona el trigger)
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint buyer_visits_end_after_start check (end_time is null or end_time > start_time)
);
create index buyer_visits_household_idx on public.buyer_visits(household_id, visit_date);
create index buyer_visits_host_idx on public.buyer_visits(host_id);
create index buyer_visits_event_idx on public.buyer_visits(event_id);
create index buyer_visits_created_by_idx on public.buyer_visits(created_by);

create table public.buyer_offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  visit_id uuid references public.buyer_visits(id) on delete set null,
  buyer_name text check (buyer_name is null or char_length(buyer_name) <= 80),
  offer_date date not null default current_date,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  financing text not null default 'unknown' check (financing in ('cash', 'mortgage_approved', 'mortgage_pending', 'unknown')),
  proposed_signing date,
  response_deadline date,
  status text not null default 'pending' check (status in ('pending', 'countered', 'rejected', 'accepted', 'withdrawn')),
  counter_cents bigint check (counter_cents is null or counter_cents > 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index buyer_offers_household_idx on public.buyer_offers(household_id);
create index buyer_offers_visit_idx on public.buyer_offers(visit_id);
create index buyer_offers_created_by_idx on public.buyer_offers(created_by);

-- ---------- Buscamos ----------
create table public.search_criteria (
  household_id uuid primary key references public.households(id) on delete cascade,
  max_price_cents bigint check (max_price_cents is null or max_price_cents > 0),
  min_rooms smallint check (min_rooms is null or min_rooms between 0 and 20),
  min_m2 integer check (min_m2 is null or min_m2 between 0 and 2000),
  zones text[] not null default '{}' check (cardinality(zones) <= 15 and char_length(array_to_string(zones, '|')) <= 600),
  must_haves text[] not null default '{}' check (cardinality(must_haves) <= 20),
  updated_at timestamptz not null default now()
);

create table public.homes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 500)),
  address text check (address is null or char_length(address) <= 120),
  zone text check (zone is null or char_length(zone) <= 60),
  price_cents bigint check (price_cents is null or price_cents between 0 and 100000000000),
  size_m2 numeric(6,1) check (size_m2 is null or size_m2 between 0 and 5000),
  rooms smallint check (rooms is null or rooms between 0 and 20),
  baths smallint check (baths is null or baths between 0 and 20),
  floor text check (floor is null or char_length(floor) <= 20),
  features text[] not null default '{}' check (cardinality(features) <= 20),
  community_fee_cents integer check (community_fee_cents is null or community_fee_cents >= 0),
  ibi_cents integer check (ibi_cents is null or ibi_cents >= 0),
  energy text check (energy is null or energy ~ '^[A-G]$'),
  maps_url text check (
    maps_url is null or (
      length(maps_url) <= 500 and
      maps_url ~ '^https://(maps\.app\.goo\.gl/|goo\.gl/maps/|maps\.google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})/|(www\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})/maps)'
    )
  ),
  contact text check (contact is null or char_length(contact) <= 120),
  minutes_to_school smallint check (minutes_to_school is null or minutes_to_school between 0 and 600),
  status text not null default 'interesa' check (status in ('interesa', 'visita_pedida', 'visitado', 'favorito', 'descartado', 'oferta')),
  discard_reason text check (discard_reason is null or char_length(discard_reason) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index homes_household_idx on public.homes(household_id);
create index homes_created_by_idx on public.homes(created_by);

create table public.home_visits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  visit_date date not null,
  start_time time not null,
  end_time time,
  attendee_id uuid references public.members(id) on delete set null,   -- null = vamos los dos
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  checklist jsonb not null default '{}' check (jsonb_typeof(checklist) = 'object' and pg_column_size(checklist) < 20000),
  notes text check (notes is null or char_length(notes) <= 2000),
  event_id uuid,   -- actividad espejo en la Agenda (sin clave foránea: la gestiona el trigger)
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint home_visits_end_after_start check (end_time is null or end_time > start_time)
);
create index home_visits_household_idx on public.home_visits(household_id, visit_date);
create index home_visits_home_idx on public.home_visits(home_id);
create index home_visits_attendee_idx on public.home_visits(attendee_id);
create index home_visits_event_idx on public.home_visits(event_id);
create index home_visits_created_by_idx on public.home_visits(created_by);

-- Nota de cada adulto por piso (cada uno solo puede poner o cambiar la suya)
create table public.home_ratings (
  home_id uuid not null references public.homes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  best text check (best is null or char_length(best) <= 300),
  worst text check (worst is null or char_length(worst) <= 300),
  updated_at timestamptz not null default now(),
  primary key (home_id, member_id)
);
create index home_ratings_member_idx on public.home_ratings(member_id);
create index home_ratings_household_idx on public.home_ratings(household_id);

create table public.home_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  path text not null check (char_length(path) <= 300),
  created_at timestamptz not null default now()
);
create index home_photos_home_idx on public.home_photos(home_id);
create index home_photos_household_idx on public.home_photos(household_id);

create table public.home_offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  offer_date date not null default current_date,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  response_deadline date,
  status text not null default 'pending' check (status in ('pending', 'countered', 'rejected', 'accepted', 'withdrawn')),
  counter_cents bigint check (counter_cents is null or counter_cents > 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index home_offers_home_idx on public.home_offers(home_id);
create index home_offers_household_idx on public.home_offers(household_id);
create index home_offers_created_by_idx on public.home_offers(created_by);

-- ---------- Validación: hogar, autor y coherencia ----------
create or replace function private.validate_house_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  hh uuid;
begin
  -- Filas que cuelgan de un piso: el hogar es siempre el del piso
  if tg_table_name in ('home_visits', 'home_ratings', 'home_photos', 'home_offers') then
    if tg_op = 'UPDATE' and new.home_id <> old.home_id then raise exception 'No se puede cambiar de piso'; end if;
    select h.household_id into hh from public.homes h where h.id = new.home_id;
    if hh is null then raise exception 'Piso no válido'; end if;
    new.household_id := hh;
  elsif tg_op = 'INSERT' then
    new.household_id := coalesce(new.household_id, private.my_household());
  else
    new.household_id := old.household_id;
  end if;

  if tg_table_name in ('buyer_visits', 'buyer_offers', 'homes', 'home_visits', 'home_offers') then
    if tg_op = 'INSERT' then new.created_by := private.current_member_id();
    else new.created_by := old.created_by; end if;
  end if;

  if tg_table_name = 'buyer_visits' then
    if not private.member_ok(new.host_id, new.household_id, 'adult') then raise exception 'Quién atiende no es válido'; end if;
  elsif tg_table_name = 'buyer_offers' then
    if new.visit_id is not null and not exists (select 1 from public.buyer_visits v where v.id = new.visit_id and v.household_id = new.household_id) then
      raise exception 'Visita no válida';
    end if;
  elsif tg_table_name = 'home_visits' then
    if not private.member_ok(new.attendee_id, new.household_id, 'adult') then raise exception 'Quién va no es válido'; end if;
  elsif tg_table_name = 'home_ratings' then
    if tg_op = 'INSERT' then
      new.member_id := private.current_member_id();
    elsif old.member_id is distinct from private.current_member_id() then
      raise exception 'Solo puedes cambiar tu propia nota';
    else
      new.member_id := old.member_id;
    end if;
    if new.member_id is null then raise exception 'Sin miembro'; end if;
    new.updated_at := now();
  elsif tg_table_name in ('sale_listing', 'search_criteria') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.validate_house_row() from public, anon, authenticated;

create trigger a_validate before insert or update on public.sale_listing for each row execute function private.validate_house_row();
create trigger a_validate before insert or update on public.buyer_visits for each row execute function private.validate_house_row();
create trigger a_validate before insert or update on public.buyer_offers for each row execute function private.validate_house_row();
create trigger a_validate before insert or update on public.search_criteria for each row execute function private.validate_house_row();
create trigger a_validate before insert or update on public.homes for each row execute function private.validate_house_row();
create trigger a_validate before insert or update on public.home_visits for each row execute function private.validate_house_row();
create trigger a_validate before insert or update on public.home_ratings for each row execute function private.validate_house_row();
create trigger a_validate before insert or update on public.home_photos for each row execute function private.validate_house_row();
create trigger a_validate before insert or update on public.home_offers for each row execute function private.validate_house_row();

-- El historial de precios se rellena solo
create or replace function private.sale_price_log()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.price_cents is not null and (tg_op = 'INSERT' or new.price_cents is distinct from old.price_cents) then
    insert into public.sale_price_history (household_id, price_cents) values (new.household_id, new.price_cents);
  end if;
  return null;
end;
$$;
revoke all on function private.sale_price_log() from public, anon, authenticated;
create trigger sale_price_log after insert or update on public.sale_listing for each row execute function private.sale_price_log();

-- ---------- Visitas ↔ Agenda ----------
create or replace function private.sync_visit_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_title text; v_location text; v_maps text; v_person uuid; v_origin text; v_id uuid;
begin
  if new.status = 'cancelled' then
    if new.event_id is not null then delete from public.events where id = new.event_id; end if;
    new.event_id := null;
    return new;
  end if;

  if tg_table_name = 'buyer_visits' then
    v_title := left('Visita compradores' || coalesce(' · ' || nullif(new.contact_name, ''), ''), 80);
    v_location := null; v_maps := null; v_person := new.host_id; v_origin := 'venta';
  else
    select left('Visita piso · ' || h.title, 80), left(coalesce(h.address, h.zone), 80), h.maps_url
      into v_title, v_location, v_maps
      from public.homes h where h.id = new.home_id;
    v_person := new.attendee_id; v_origin := 'compra';
  end if;

  if new.event_id is not null and exists (select 1 from public.events e where e.id = new.event_id) then
    update public.events set title = v_title, location = v_location, maps_url = v_maps, start_time = new.start_time, end_time = new.end_time,
      start_date = new.visit_date, drop_off_id = v_person, pick_up_id = null, origin = v_origin
    where id = new.event_id;
  else
    insert into public.events (household_id, child_id, title, location, maps_url, start_time, end_time, repeat, weekdays, start_date, drop_off_id, origin)
    values (new.household_id, null, v_title, v_location, v_maps, new.start_time, new.end_time, 'none', '{}', new.visit_date, v_person, v_origin)
    returning id into v_id;
    new.event_id := v_id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_visit_event() from public, anon, authenticated;

create or replace function private.delete_visit_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.event_id is not null then delete from public.events where id = old.event_id; end if;
  return null;
end;
$$;
revoke all on function private.delete_visit_event() from public, anon, authenticated;

create trigger b_sync_event before insert or update on public.buyer_visits for each row execute function private.sync_visit_event();
create trigger b_sync_event before insert or update on public.home_visits for each row execute function private.sync_visit_event();
create trigger delete_event after delete on public.buyer_visits for each row execute function private.delete_visit_event();
create trigger delete_event after delete on public.home_visits for each row execute function private.delete_visit_event();

-- Si cambia el nombre, dirección o mapa del piso, se actualizan sus visitas en la Agenda
create or replace function private.sync_home_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.title, new.address, new.zone, new.maps_url) is distinct from (old.title, old.address, old.zone, old.maps_url) then
    update public.events e set
      title = left('Visita piso · ' || new.title, 80),
      location = left(coalesce(new.address, new.zone), 80),
      maps_url = new.maps_url
    from public.home_visits v
    where v.home_id = new.id and e.id = v.event_id;
  end if;
  return null;
end;
$$;
revoke all on function private.sync_home_events() from public, anon, authenticated;
create trigger sync_home_events after update on public.homes for each row execute function private.sync_home_events();

-- Al borrar un piso, sus visitas se borran en cascada y el trigger delete_event quita sus actividades de la Agenda

-- ---------- Seguridad (solo el propio hogar y con 2FA) ----------
alter table public.sale_listing enable row level security;
alter table public.sale_price_history enable row level security;
alter table public.buyer_visits enable row level security;
alter table public.buyer_offers enable row level security;
alter table public.search_criteria enable row level security;
alter table public.homes enable row level security;
alter table public.home_visits enable row level security;
alter table public.home_ratings enable row level security;
alter table public.home_photos enable row level security;
alter table public.home_offers enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sale_listing', 'buyer_visits', 'buyer_offers', 'search_criteria', 'homes', 'home_visits', 'home_photos', 'home_offers'] loop
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
        with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
    $p$, t || '_all', t);
  end loop;
end $$;

-- El historial de precios solo se lee (lo escribe el sistema)
create policy "sale_price_history_select" on public.sale_price_history for select to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
revoke insert, update, delete on public.sale_price_history from authenticated;

-- Notas: las ven los dos; cada uno escribe y borra solo la suya
create policy "home_ratings_select" on public.home_ratings for select to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "home_ratings_insert" on public.home_ratings for insert to authenticated
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "home_ratings_update" on public.home_ratings for update to authenticated
  using ((select private.has_mfa()) and member_id = (select private.current_member_id()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "home_ratings_delete" on public.home_ratings for delete to authenticated
  using ((select private.has_mfa()) and member_id = (select private.current_member_id()));

revoke all on public.sale_listing, public.sale_price_history, public.buyer_visits, public.buyer_offers, public.search_criteria,
  public.homes, public.home_visits, public.home_ratings, public.home_photos, public.home_offers from anon;

alter publication supabase_realtime add table public.sale_listing, public.sale_price_history, public.buyer_visits, public.buyer_offers,
  public.search_criteria, public.homes, public.home_visits, public.home_ratings, public.home_photos, public.home_offers;

-- ---------- Fotos de las visitas (bucket privado) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('house-photos', 'house-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "house_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'house-photos' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));
create policy "house_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'house-photos' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));
create policy "house_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'house-photos' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));

-- ---------- Categoría de gasto para la operación ----------
insert into public.expense_categories (household_id, name, position)
select h.id, 'Casa nueva', 90 from public.households h
where not exists (select 1 from public.expense_categories c where c.household_id = h.id and c.name = 'Casa nueva');
