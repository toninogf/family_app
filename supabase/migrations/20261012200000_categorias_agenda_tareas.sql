-- Agenda familiar y tareas: categorías editables, actividades de cualquier miembro, pausa y localidad de los pisos.

-- ---------- Categorías ----------
create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  icon text not null default '📌' check (char_length(icon) between 1 and 8),
  color text not null default '#5B6662' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position int not null default 0,
  archived boolean not null default false,
  key text check (key in ('mudanza', 'otros')),     -- categorías que usa el sistema (no se pueden borrar)
  created_at timestamptz not null default now(),
  unique (household_id, key)
);
create index event_categories_household_idx on public.event_categories(household_id);

create table public.task_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  icon text not null default '📌' check (char_length(icon) between 1 and 8),
  color text not null default '#5B6662' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index task_categories_household_idx on public.task_categories(household_id);

alter table public.events add column category_id uuid references public.event_categories(id) on delete set null;
alter table public.events add column paused boolean not null default false;
create index events_category_idx on public.events(category_id);
alter table public.tasks add column category_id uuid references public.task_categories(id) on delete set null;
create index tasks_category_idx on public.tasks(category_id);

-- Localidad de los pisos y localidades buscadas
alter table public.homes add column province text check (province is null or char_length(province) <= 60);
alter table public.homes add column municipality text check (municipality is null or char_length(municipality) <= 80);
alter table public.search_criteria add column municipalities text[] not null default '{}'
  check (cardinality(municipalities) <= 40 and char_length(array_to_string(municipalities, '|')) <= 2000);

-- ---------- Validación ----------
create or replace function private.validate_category_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.household_id := coalesce(new.household_id, private.my_household());
    -- Desde la app no se pueden crear categorías «de sistema»
    if tg_table_name = 'event_categories' and private.current_member_id() is not null then new.key := null; end if;
  else
    new.household_id := old.household_id;
    if tg_table_name = 'event_categories' then new.key := old.key; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_category_row() from public, anon, authenticated;
create trigger a_validate before insert or update on public.event_categories for each row execute function private.validate_category_row();
create trigger a_validate before insert or update on public.task_categories for each row execute function private.validate_category_row();

-- Las categorías de sistema no se pueden borrar
create or replace function private.protect_system_category()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.key is not null and private.current_member_id() is not null then raise exception 'Esta categoría la usa la app y no se puede borrar (puedes ocultarla)'; end if;
  return old;
end;
$$;
revoke all on function private.protect_system_category() from public, anon, authenticated;
create trigger protect_system before delete on public.event_categories for each row execute function private.protect_system_category();

-- Actividades: ahora pueden ser de cualquier miembro (adulto o niño) y llevan categoría
create or replace function private.validate_family_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'tasks' then
    if tg_op = 'INSERT' then new.created_by := private.current_member_id();
    else new.created_by := old.created_by; new.household_id := old.household_id; end if;
    if not private.member_ok(new.assignee_id, new.household_id, 'adult') then raise exception 'Responsable no válido'; end if;
    if new.category_id is not null and not exists (select 1 from public.task_categories c where c.id = new.category_id and c.household_id = new.household_id) then
      raise exception 'Categoría no válida';
    end if;

  elsif tg_table_name = 'task_completions' then
    select t.household_id into new.household_id from public.tasks t where t.id = new.task_id;
    new.done_by := private.current_member_id();
    new.done_at := now();

  elsif tg_table_name = 'events' then
    if tg_op = 'INSERT' then new.created_by := private.current_member_id();
    else new.created_by := old.created_by; new.household_id := old.household_id; end if;
    if not (private.member_ok(new.child_id, new.household_id, 'child') or private.member_ok(new.child_id, new.household_id, 'adult')) then
      raise exception 'Persona no válida';
    end if;
    if not private.member_ok(new.drop_off_id, new.household_id, 'adult') then raise exception 'Quién lleva no válido'; end if;
    if not private.member_ok(new.pick_up_id, new.household_id, 'adult') then raise exception 'Quién recoge no válido'; end if;
    if new.category_id is not null and not exists (select 1 from public.event_categories c where c.id = new.category_id and c.household_id = new.household_id) then
      raise exception 'Categoría no válida';
    end if;

  elsif tg_table_name = 'event_exceptions' then
    select e.household_id into new.household_id from public.events e where e.id = new.event_id;
    if not private.member_ok(new.drop_off_id, new.household_id, 'adult') then raise exception 'Quién lleva no válido'; end if;
    if not private.member_ok(new.pick_up_id, new.household_id, 'adult') then raise exception 'Quién recoge no válido'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_family_row() from public, anon, authenticated;

-- Las visitas de la mudanza entran en la categoría «Mudanza»
create or replace function private.sync_visit_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_title text; v_location text; v_maps text; v_person uuid; v_origin text; v_id uuid; v_cat uuid;
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
    select left('Visita piso · ' || h.title, 80), left(coalesce(h.address, h.municipality, h.zone), 80), h.maps_url
      into v_title, v_location, v_maps
      from public.homes h where h.id = new.home_id;
    v_person := new.attendee_id; v_origin := 'compra';
  end if;
  select c.id into v_cat from public.event_categories c where c.household_id = new.household_id and c.key = 'mudanza';

  if new.event_id is not null and exists (select 1 from public.events e where e.id = new.event_id) then
    update public.events set title = v_title, location = v_location, maps_url = v_maps, start_time = new.start_time, end_time = new.end_time,
      start_date = new.visit_date, drop_off_id = v_person, pick_up_id = null, origin = v_origin, category_id = coalesce(category_id, v_cat)
    where id = new.event_id;
  else
    insert into public.events (household_id, child_id, title, location, maps_url, start_time, end_time, repeat, weekdays, start_date, drop_off_id, origin, category_id)
    values (new.household_id, null, v_title, v_location, v_maps, new.start_time, new.end_time, 'none', '{}', new.visit_date, v_person, v_origin, v_cat)
    returning id into v_id;
    new.event_id := v_id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_visit_event() from public, anon, authenticated;

-- ---------- Seguridad ----------
alter table public.event_categories enable row level security;
alter table public.task_categories enable row level security;
create policy "event_categories_all" on public.event_categories for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "task_categories_all" on public.task_categories for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
revoke all on public.event_categories, public.task_categories from anon;
alter publication supabase_realtime add table public.event_categories, public.task_categories;

-- ---------- Categorías iniciales ----------
insert into public.event_categories (household_id, name, icon, color, position, key)
select h.id, c.name, c.icon, c.color, c.pos, c.key
from public.households h
cross join (values
  ('Deporte', '⚽', '#2E8B57', 1, null), ('Música', '🎵', '#7A4FB3', 2, null), ('Idiomas', '🗣️', '#2F5FC4', 3, null),
  ('Colegio', '🏫', '#C77A12', 4, null), ('Médico', '🩺', '#B3261E', 5, null), ('Cumpleaños', '🎂', '#C2417A', 6, null),
  ('Familia', '👪', '#0E8A8A', 7, null), ('Mudanza', '🏠', '#8A6A2F', 8, 'mudanza'), ('Otros', '📌', '#5B6662', 9, 'otros')
) as c(name, icon, color, pos, key);

insert into public.task_categories (household_id, name, icon, color, position)
select h.id, c.name, c.icon, c.color, c.pos
from public.households h
cross join (values
  ('Limpieza', '🧹', '#2F5FC4', 1), ('Cocina', '🍳', '#C77A12', 2), ('Ropa', '👕', '#7A4FB3', 3),
  ('Basura y reciclaje', '♻️', '#2E8B57', 4), ('Plantas', '🪴', '#4CAF6E', 5), ('Mantenimiento', '🔧', '#5B6662', 6),
  ('Papeles', '📄', '#8A6A2F', 7), ('Coche', '🚗', '#B3261E', 8), ('Niños', '🧒', '#C2417A', 9), ('Compras', '🛒', '#0E8A8A', 10)
) as c(name, icon, color, pos);

-- Lo que ya existía: visitas → Mudanza, resto → Otros
update public.events e set category_id = c.id
from public.event_categories c
where c.household_id = e.household_id and e.category_id is null
  and c.key = case when e.origin is not null then 'mudanza' else 'otros' end;
