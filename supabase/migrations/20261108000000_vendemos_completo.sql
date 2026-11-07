-- Vendemos completo: ficha del anuncio, fotos y capturas, documentos, cuentas de la venta y pasos hasta la firma

-- ---------- Ficha del anuncio y cuentas (en la fila única de la venta) ----------
alter table public.sale_listing
  add column if not exists title text check (title is null or char_length(title) <= 120),
  add column if not exists property_type text check (property_type is null or char_length(property_type) <= 60),
  add column if not exists address text check (address is null or char_length(address) <= 120),
  add column if not exists zone text check (zone is null or char_length(zone) <= 60),
  add column if not exists municipality text check (municipality is null or char_length(municipality) <= 80),
  add column if not exists province text check (province is null or char_length(province) <= 40),
  add column if not exists size_m2 numeric(7,2) check (size_m2 is null or size_m2 > 0),
  add column if not exists useful_m2 numeric(7,2) check (useful_m2 is null or useful_m2 > 0),
  add column if not exists plot_m2 numeric(9,2) check (plot_m2 is null or plot_m2 > 0),
  add column if not exists rooms smallint check (rooms is null or rooms between 0 and 50),
  add column if not exists baths smallint check (baths is null or baths between 0 and 50),
  add column if not exists floor text check (floor is null or char_length(floor) <= 20),
  add column if not exists features text[] not null default '{}' check (cardinality(features) <= 30),
  add column if not exists energy text check (energy is null or energy in ('A', 'B', 'C', 'D', 'E', 'F', 'G')),
  add column if not exists community_fee_cents bigint check (community_fee_cents is null or community_fee_cents >= 0),
  add column if not exists ibi_cents bigint check (ibi_cents is null or ibi_cents >= 0),
  add column if not exists year_built smallint check (year_built is null or year_built between 1700 and 2100),
  add column if not exists description text check (description is null or char_length(description) <= 5000),
  add column if not exists listing_ref text check (listing_ref is null or char_length(listing_ref) <= 60),
  -- Cuentas: hipoteca pendiente y gastos de la venta [{label, cents}]
  add column if not exists mortgage_cents bigint check (mortgage_cents is null or mortgage_cents >= 0),
  add column if not exists costs jsonb not null default '[]' check (
    jsonb_typeof(costs) = 'array' and jsonb_array_length(costs) <= 20
  );

-- ---------- Fotos y capturas del anuncio propio (bucket house-photos, carpeta <hogar>/venta/) ----------
create table if not exists public.sale_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  path text not null check (char_length(path) <= 300),
  kind text not null default 'foto' check (kind in ('foto', 'anuncio')),
  created_at timestamptz not null default now()
);
create index if not exists sale_photos_household_idx on public.sale_photos(household_id);

-- ---------- Documentos para vender (bucket privado sale-docs, carpeta <hogar>/) ----------
create table if not exists public.sale_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  doc_key text check (doc_key is null or char_length(doc_key) <= 40),
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'falta' check (status in ('falta', 'pedido', 'ok', 'no_aplica')),
  expires_on date,
  path text check (path is null or char_length(path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  notes text check (notes is null or char_length(notes) <= 500),
  position smallint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists sale_documents_household_idx on public.sale_documents(household_id);

-- ---------- Pasos de la venta (reserva, arras, firma…), con su fecha en la Agenda ----------
create table if not exists public.sale_steps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('reserva', 'arras', 'firma', 'otro')),
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
create index if not exists sale_steps_household_idx on public.sale_steps(household_id);

-- Hogar siempre el propio, y los ficheros solo dentro de la carpeta del hogar
create or replace function private.sale_row_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then new.household_id := coalesce(new.household_id, private.my_household());
  else new.household_id := old.household_id; end if;
  if tg_table_name in ('sale_photos', 'sale_documents') and new.path is not null
     and split_part(new.path, '/', 1) <> new.household_id::text then
    raise exception 'Archivo no válido';
  end if;
  if tg_table_name = 'sale_documents' then new.updated_at := now(); end if;
  return new;
end;
$$;
revoke all on function private.sale_row_defaults() from public, anon, authenticated;

drop trigger if exists a_defaults on public.sale_photos;
drop trigger if exists a_defaults on public.sale_documents;
drop trigger if exists a_defaults on public.sale_steps;
create trigger a_defaults before insert or update on public.sale_photos for each row execute function private.sale_row_defaults();
create trigger a_defaults before insert or update on public.sale_documents for each row execute function private.sale_row_defaults();
create trigger a_defaults before insert or update on public.sale_steps for each row execute function private.sale_row_defaults();

-- Cada paso con fecha tiene su actividad en la Agenda (categoría Mudanza); sin fecha, se quita
create or replace function private.sync_sale_step_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_cat uuid; v_id uuid; v_title text;
begin
  if new.step_date is null then
    if new.event_id is not null then delete from public.events where id = new.event_id; end if;
    new.event_id := null;
    return new;
  end if;
  v_title := left('🏠 ' || new.title || case when new.done then ' ✓' else '' end, 80);
  select c.id into v_cat from public.event_categories c where c.household_id = new.household_id and c.key = 'mudanza';
  if new.event_id is not null and exists (select 1 from public.events e where e.id = new.event_id) then
    update public.events set title = v_title, location = new.location, start_date = new.step_date,
      start_time = coalesce(new.step_time, '10:00'), origin = 'venta', category_id = coalesce(category_id, v_cat)
    where id = new.event_id;
  else
    insert into public.events (household_id, child_id, title, location, start_time, repeat, weekdays, start_date, origin, category_id)
    values (new.household_id, null, v_title, new.location, coalesce(new.step_time, '10:00'), 'none', '{}', new.step_date, 'venta', v_cat)
    returning id into v_id;
    new.event_id := v_id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_sale_step_event() from public, anon, authenticated;

drop trigger if exists b_sync_event on public.sale_steps;
drop trigger if exists delete_event on public.sale_steps;
create trigger b_sync_event before insert or update on public.sale_steps for each row execute function private.sync_sale_step_event();
create trigger delete_event after delete on public.sale_steps for each row execute function private.delete_visit_event();

-- ---------- Seguridad: solo el propio hogar y con 2FA ----------
alter table public.sale_photos enable row level security;
alter table public.sale_documents enable row level security;
alter table public.sale_steps enable row level security;
do $$
declare t text;
begin
  foreach t in array array['sale_photos', 'sale_documents', 'sale_steps'] loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
        with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
    $p$, t || '_all', t);
  end loop;
end $$;
revoke all on public.sale_photos, public.sale_documents, public.sale_steps from anon;

-- Bucket privado para los documentos (PDF o fotos, hasta 15 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sale-docs', 'sale-docs', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "sale_docs_select" on storage.objects;
drop policy if exists "sale_docs_insert" on storage.objects;
drop policy if exists "sale_docs_delete" on storage.objects;
create policy "sale_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'sale-docs' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));
create policy "sale_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'sale-docs' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));
create policy "sale_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'sale-docs' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));

do $$
begin
  alter publication supabase_realtime add table public.sale_photos, public.sale_documents, public.sale_steps;
exception when duplicate_object then null;
end $$;
