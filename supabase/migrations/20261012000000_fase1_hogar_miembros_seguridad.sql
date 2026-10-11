-- Aplicada en el proyecto family-app (oszaykaerxzwslvdwssa) el 2026-10-12.
-- Esquema privado para funciones de seguridad (no expuesto por la API)
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Hogar
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

-- Miembros: adultos (con login) y niños (sin login)
create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('adult', 'child')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  email text unique,
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint children_have_no_login check (kind = 'adult' or (email is null and user_id is null)),
  constraint adults_have_email check (kind = 'child' or email is not null)
);
create index members_household_idx on public.members(household_id);

-- Funciones de seguridad
create or replace function private.current_household_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.household_id from public.members m where m.user_id = (select auth.uid())
$$;

create or replace function private.has_mfa()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
$$;

revoke all on function private.current_household_ids() from public, anon;
revoke all on function private.has_mfa() from public, anon;
grant execute on function private.current_household_ids() to authenticated;
grant execute on function private.has_mfa() to authenticated;

-- RLS: solo miembros del hogar y con 2FA completado
alter table public.households enable row level security;
alter table public.members enable row level security;

create policy "households_select" on public.households for select to authenticated
  using ((select private.has_mfa()) and id in (select private.current_household_ids()));
create policy "households_update" on public.households for update to authenticated
  using ((select private.has_mfa()) and id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and id in (select private.current_household_ids()));

create policy "members_select" on public.members for select to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "members_insert_child" on public.members for insert to authenticated
  with check ((select private.has_mfa()) and kind = 'child' and household_id in (select private.current_household_ids()));
create policy "members_update" on public.members for update to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));

-- Nadie puede cambiar email ni user_id desde la app
revoke update on public.members from authenticated;
grant update (display_name, color) on public.members to authenticated;
revoke all on public.households, public.members from anon;

-- Solo los emails dados de alta como adultos pueden crear cuenta
create or replace function private.only_invited_emails()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.members m where lower(m.email) = lower(new.email) and m.kind = 'adult') then
    raise exception 'Registro no permitido';
  end if;
  return new;
end;
$$;

create or replace function private.link_member_on_signup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.members set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

revoke all on function private.only_invited_emails() from public, anon, authenticated;
revoke all on function private.link_member_on_signup() from public, anon, authenticated;

create trigger only_invited_emails before insert on auth.users
  for each row execute function private.only_invited_emails();
create trigger link_member_on_signup after insert on auth.users
  for each row execute function private.link_member_on_signup();

-- Datos iniciales del hogar
with h as (
  insert into public.households (name) values ('Familia') returning id
)
insert into public.members (household_id, kind, display_name, color, email)
select h.id, v.kind, v.display_name, v.color, v.email from h,
(values
  ('adult', 'Toni',   '#6A4FB3', 'toninogf@gmail.com'),
  ('adult', 'Pareja', '#C77A12', 'riukaab@gmail.com'),
  ('child', 'Andrés', '#4CAF6E', null),
  ('child', 'Enol',   '#B3261E', null)
) as v(kind, display_name, color, email);
