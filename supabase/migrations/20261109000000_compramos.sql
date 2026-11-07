-- Compramos: desde la oferta hasta las llaves (comprobaciones, hipoteca, pasos, cuentas, contactos y documentos)

-- ---------- La compra (una por hogar, ligada al piso elegido de Buscamos) ----------
create table if not exists public.purchase (
  household_id uuid primary key references public.households(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  conditions text check (conditions is null or char_length(conditions) <= 2000),
  subject_to_mortgage boolean not null default false,
  subject_to_sale boolean not null default false,
  arras_type text check (arras_type is null or arras_type in ('penitenciales', 'confirmatorias', 'penales')),
  delivery_date date,
  savings_cents bigint check (savings_cents is null or savings_cents >= 0),
  loan_cents bigint check (loan_cents is null or loan_cents >= 0),
  -- Gastos [{label, cents}] y contactos [{role, name, phone, email}]
  costs jsonb not null default '[]' check (jsonb_typeof(costs) = 'array' and jsonb_array_length(costs) <= 20),
  contacts jsonb not null default '[]' check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 20),
  mortgage_phase text check (mortgage_phase is null or mortgage_phase in ('preaprobacion', 'tasacion', 'fein', 'oferta_vinculante', 'firmada')),
  fein_date date,
  updated_at timestamptz not null default now()
);

-- ---------- Comprobaciones, documentos del banco y documentos finales ----------
create table if not exists public.purchase_docs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  grp text not null check (grp in ('comprobacion', 'banco', 'final')),
  doc_key text check (doc_key is null or char_length(doc_key) <= 40),
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'pendiente' check (status in ('pendiente', 'pedido', 'ok', 'problema', 'no_aplica')),
  expires_on date,
  path text check (path is null or char_length(path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  notes text check (notes is null or char_length(notes) <= 500),
  position smallint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists purchase_docs_household_idx on public.purchase_docs(household_id);

-- ---------- Pasos de la compra (con su fecha en la Agenda) ----------
create table if not exists public.purchase_steps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('reserva', 'arras', 'hipoteca', 'firma', 'registro', 'suministros', 'otro')),
  title text not null check (char_length(title) between 1 and 80),
  step_date date,
  step_time time,
  location text check (location is null or char_length(location) <= 120),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  checklist jsonb not null default '{}' check (jsonb_typeof(checklist) = 'object'),
  done boolean not null default false,
  event_id uuid,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists purchase_steps_household_idx on public.purchase_steps(household_id);

-- ---------- Ofertas de hipoteca de cada banco ----------
create table if not exists public.mortgage_offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  bank text not null check (char_length(bank) between 1 and 60),
  rate_type text not null default 'fijo' check (rate_type in ('fijo', 'variable', 'mixto')),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  years smallint check (years is null or years between 1 and 40),
  tin numeric(5,3) check (tin is null or tin between 0 and 20),
  tae numeric(5,3) check (tae is null or tae between 0 and 20),
  monthly_cents bigint check (monthly_cents is null or monthly_cents >= 0),
  ties text check (ties is null or char_length(ties) <= 300),
  fees text check (fees is null or char_length(fees) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  chosen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists mortgage_offers_household_idx on public.mortgage_offers(household_id);

-- ---------- Hogar siempre el propio; archivos solo en su carpeta; el piso, uno del hogar ----------
create or replace function private.sale_row_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then new.household_id := coalesce(new.household_id, private.my_household());
  else new.household_id := old.household_id; end if;
  -- (anidado: no todas las tablas tienen «path» o «home_id» y plpgsql evaluaría el campo igualmente)
  if tg_table_name in ('sale_photos', 'sale_documents', 'purchase_docs') then
    if new.path is not null and split_part(new.path, '/', 1) <> new.household_id::text then
      raise exception 'Archivo no válido';
    end if;
  end if;
  if tg_table_name = 'purchase' then
    if new.home_id is not null and not exists (select 1 from public.homes h where h.id = new.home_id and h.household_id = new.household_id) then
      raise exception 'Piso no válido';
    end if;
  end if;
  if tg_table_name in ('sale_documents', 'purchase_docs', 'purchase') then new.updated_at := now(); end if;
  return new;
end;
$$;
revoke all on function private.sale_row_defaults() from public, anon, authenticated;

drop trigger if exists a_defaults on public.purchase;
drop trigger if exists a_defaults on public.purchase_docs;
drop trigger if exists a_defaults on public.purchase_steps;
drop trigger if exists a_defaults on public.mortgage_offers;
create trigger a_defaults before insert or update on public.purchase for each row execute function private.sale_row_defaults();
create trigger a_defaults before insert or update on public.purchase_docs for each row execute function private.sale_row_defaults();
create trigger a_defaults before insert or update on public.purchase_steps for each row execute function private.sale_row_defaults();
create trigger a_defaults before insert or update on public.mortgage_offers for each row execute function private.sale_row_defaults();

-- Un paso con fecha tiene su actividad en la Agenda (venta: «🏠», compra: «🔑»); sin fecha, se quita
create or replace function private.sync_sale_step_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_cat uuid; v_id uuid; v_title text; v_origin text; v_icon text;
begin
  if tg_table_name = 'purchase_steps' then v_origin := 'compra'; v_icon := '🔑 ';
  else v_origin := 'venta'; v_icon := '🏠 '; end if;
  if new.step_date is null then
    if new.event_id is not null then delete from public.events where id = new.event_id; end if;
    new.event_id := null;
    return new;
  end if;
  v_title := left(v_icon || new.title || case when new.done then ' ✓' else '' end, 80);
  select c.id into v_cat from public.event_categories c where c.household_id = new.household_id and c.key = 'mudanza';
  if new.event_id is not null and exists (select 1 from public.events e where e.id = new.event_id) then
    update public.events set title = v_title, location = new.location, start_date = new.step_date,
      start_time = coalesce(new.step_time, '10:00'), origin = v_origin, category_id = coalesce(category_id, v_cat)
    where id = new.event_id;
  else
    insert into public.events (household_id, child_id, title, location, start_time, repeat, weekdays, start_date, origin, category_id)
    values (new.household_id, null, v_title, new.location, coalesce(new.step_time, '10:00'), 'none', '{}', new.step_date, v_origin, v_cat)
    returning id into v_id;
    new.event_id := v_id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_sale_step_event() from public, anon, authenticated;

drop trigger if exists b_sync_event on public.purchase_steps;
drop trigger if exists delete_event on public.purchase_steps;
create trigger b_sync_event before insert or update on public.purchase_steps for each row execute function private.sync_sale_step_event();
create trigger delete_event after delete on public.purchase_steps for each row execute function private.delete_visit_event();

-- ---------- Seguridad: solo el propio hogar y con 2FA ----------
alter table public.purchase enable row level security;
alter table public.purchase_docs enable row level security;
alter table public.purchase_steps enable row level security;
alter table public.mortgage_offers enable row level security;
do $$
declare t text;
begin
  foreach t in array array['purchase', 'purchase_docs', 'purchase_steps', 'mortgage_offers'] loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
        with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
    $p$, t || '_all', t);
  end loop;
end $$;
revoke all on public.purchase, public.purchase_docs, public.purchase_steps, public.mortgage_offers from anon;

do $$
begin
  alter publication supabase_realtime add table public.purchase, public.purchase_docs, public.purchase_steps, public.mortgage_offers;
exception when duplicate_object then null;
end $$;
