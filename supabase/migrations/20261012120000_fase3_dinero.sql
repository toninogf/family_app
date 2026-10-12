-- Fase 3: dinero. Partes: Cuenta común (null), Toni, Rebeca.
-- Un gasto genera deuda cuando quien paga no es quien se beneficia:
--   pagador -> acreedor, beneficiario -> deudor (null = cuenta común / familia).

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  monthly_budget_cents integer not null default 0 check (monthly_budget_cents >= 0),
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index expense_categories_household_idx on public.expense_categories(household_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents < 100000000),
  description text not null check (char_length(description) between 1 and 80),
  category_id uuid references public.expense_categories(id) on delete set null,
  spent_on date not null default current_date,
  payer_id uuid references public.members(id) on delete restrict,        -- null = cuenta común
  beneficiary_id uuid references public.members(id) on delete restrict,  -- null = familia
  child_id uuid references public.members(id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_household_date_idx on public.expenses(household_id, spent_on desc);
create index expenses_category_idx on public.expenses(category_id);
create index expenses_payer_idx on public.expenses(payer_id);
create index expenses_beneficiary_idx on public.expenses(beneficiary_id);
create index expenses_child_idx on public.expenses(child_id);
create index expenses_created_by_idx on public.expenses(created_by);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_id uuid references public.members(id) on delete restrict,  -- quien paga (null = cuenta común)
  to_id uuid references public.members(id) on delete restrict,    -- quien recibe (null = cuenta común)
  amount_cents integer not null check (amount_cents > 0 and amount_cents < 100000000),
  settled_on date not null default current_date,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint settlement_distinct_parties check (from_id is distinct from to_id)
);
create index settlements_household_idx on public.settlements(household_id, settled_on desc);
create index settlements_from_idx on public.settlements(from_id);
create index settlements_to_idx on public.settlements(to_id);
create index settlements_created_by_idx on public.settlements(created_by);

create table public.audit_log (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  table_name text not null,
  row_id uuid not null,
  action text not null,
  member_id uuid references public.members(id) on delete set null,
  at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_household_idx on public.audit_log(household_id, at desc);
create index audit_log_member_idx on public.audit_log(member_id);

-- Validación: personas del mismo hogar y del tipo correcto
create or replace function private.validate_money_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ok boolean;
begin
  if tg_op = 'INSERT' then
    new.created_by := private.current_member_id();
  else
    new.created_by := old.created_by;
    new.household_id := old.household_id;
  end if;

  if tg_table_name = 'expenses' then
    new.updated_at := now();
    if new.payer_id is not null then
      select exists(select 1 from public.members m where m.id = new.payer_id and m.household_id = new.household_id and m.kind = 'adult') into ok;
      if not ok then raise exception 'Pagador no válido'; end if;
    end if;
    if new.beneficiary_id is not null then
      select exists(select 1 from public.members m where m.id = new.beneficiary_id and m.household_id = new.household_id and m.kind = 'adult') into ok;
      if not ok then raise exception 'Beneficiario no válido'; end if;
    end if;
    if new.child_id is not null then
      select exists(select 1 from public.members m where m.id = new.child_id and m.household_id = new.household_id and m.kind = 'child') into ok;
      if not ok then raise exception 'Niño no válido'; end if;
    end if;
    if new.category_id is not null then
      select exists(select 1 from public.expense_categories c where c.id = new.category_id and c.household_id = new.household_id) into ok;
      if not ok then raise exception 'Categoría no válida'; end if;
    end if;
  else
    if new.from_id is not null then
      select exists(select 1 from public.members m where m.id = new.from_id and m.household_id = new.household_id and m.kind = 'adult') into ok;
      if not ok then raise exception 'Origen no válido'; end if;
    end if;
    if new.to_id is not null then
      select exists(select 1 from public.members m where m.id = new.to_id and m.household_id = new.household_id and m.kind = 'adult') into ok;
      if not ok then raise exception 'Destino no válido'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_money_row() from public, anon, authenticated;

create trigger expenses_validate before insert or update on public.expenses
  for each row execute function private.validate_money_row();
create trigger settlements_validate before insert or update on public.settlements
  for each row execute function private.validate_money_row();

-- Auditoría
create or replace function private.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
begin
  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  insert into public.audit_log (household_id, table_name, row_id, action, member_id, old_data, new_data)
  values (
    (r ->> 'household_id')::uuid,
    tg_table_name,
    (r ->> 'id')::uuid,
    lower(tg_op),
    private.current_member_id(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;
revoke all on function private.audit_row() from public, anon, authenticated;

create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function private.audit_row();
create trigger settlements_audit after insert or update or delete on public.settlements
  for each row execute function private.audit_row();
create trigger expense_categories_audit after insert or update or delete on public.expense_categories
  for each row execute function private.audit_row();

-- RLS
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.audit_log enable row level security;

create policy "expense_categories_all" on public.expense_categories for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "expenses_all" on public.expenses for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "settlements_all" on public.settlements for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "audit_log_select" on public.audit_log for select to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()));

revoke all on public.expense_categories, public.expenses, public.settlements, public.audit_log from anon;
revoke insert, update, delete on public.audit_log from authenticated;

-- Saldos por pareja de partes. 'common' = cuenta común.
-- owed_cents > 0: party_b debe a party_a; < 0: party_a debe a party_b.
create view public.money_balances with (security_invoker = true) as
with moves as (
  select household_id, coalesce(payer_id::text, 'common') as creditor, coalesce(beneficiary_id::text, 'common') as debtor, amount_cents
  from public.expenses
  where payer_id is distinct from beneficiary_id
  union all
  select household_id, coalesce(from_id::text, 'common'), coalesce(to_id::text, 'common'), amount_cents
  from public.settlements
)
select household_id,
  least(creditor, debtor) as party_a,
  greatest(creditor, debtor) as party_b,
  sum(case when creditor < debtor then amount_cents else -amount_cents end)::bigint as owed_cents
from moves
group by household_id, least(creditor, debtor), greatest(creditor, debtor);
revoke all on public.money_balances from anon;
grant select on public.money_balances to authenticated;

alter publication supabase_realtime add table public.expenses, public.settlements, public.expense_categories;

-- Categorías iniciales
insert into public.expense_categories (household_id, name, position)
select h.id, v.name, v.pos from public.households h,
  (values ('Supermercado', 0), ('Vivienda', 1), ('Suministros', 2), ('Niños', 3), ('Transporte', 4),
          ('Salud', 5), ('Restaurantes y ocio', 6), ('Ropa', 7), ('Educación', 8), ('Seguros', 9),
          ('Regalos', 10), ('Otros', 11)) as v(name, pos);
