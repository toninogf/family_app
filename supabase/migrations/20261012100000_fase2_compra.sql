-- Fase 2: lista de la compra compartida

-- Miembro actual (para "añadido por")
create or replace function private.current_member_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from public.members m where m.user_id = (select auth.uid()) limit 1
$$;
revoke all on function private.current_member_id() from public, anon;
grant execute on function private.current_member_id() to authenticated;

-- Listas
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index shopping_lists_household_idx on public.shopping_lists(household_id);

-- Artículos
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  quantity text check (quantity is null or char_length(quantity) <= 20),
  category text not null default 'Otros' check (char_length(category) <= 30),
  checked boolean not null default false,
  checked_at timestamptz,
  archived boolean not null default false,
  added_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index shopping_items_list_idx on public.shopping_items(list_id) where not archived;
create index shopping_items_household_idx on public.shopping_items(household_id);
create index shopping_items_added_by_idx on public.shopping_items(added_by);

-- Rellena household_id desde la lista, added_by desde el usuario y la fecha al marcar
create or replace function private.shopping_items_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select l.household_id into new.household_id from public.shopping_lists l where l.id = new.list_id;
    new.added_by := private.current_member_id();
  else
    new.household_id := old.household_id;
    new.added_by := old.added_by;
    new.list_id := old.list_id;
  end if;
  if new.checked and (tg_op = 'INSERT' or not old.checked) then
    new.checked_at := now();
  elsif not new.checked then
    new.checked_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.shopping_items_defaults() from public, anon, authenticated;
create trigger shopping_items_defaults before insert or update on public.shopping_items
  for each row execute function private.shopping_items_defaults();

-- RLS: solo el hogar propio y con 2FA
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

create policy "shopping_lists_all" on public.shopping_lists for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));

create policy "shopping_items_all" on public.shopping_items for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));

revoke all on public.shopping_lists, public.shopping_items from anon;

-- Frecuentes: lo más comprado en los últimos 90 días (respeta RLS)
create view public.shopping_frequent with (security_invoker = true) as
  select list_id, lower(name) as key, min(name) as name, min(category) as category, count(*) as times
  from public.shopping_items
  where archived and created_at > now() - interval '90 days'
  group by list_id, lower(name);
revoke all on public.shopping_frequent from anon;
grant select on public.shopping_frequent to authenticated;

-- Tiempo real
alter publication supabase_realtime add table public.shopping_items, public.shopping_lists;

-- Listas iniciales
insert into public.shopping_lists (household_id, name, position)
select h.id, v.name, v.pos from public.households h,
  (values ('Súper', 0), ('Farmacia', 1)) as v(name, pos);
