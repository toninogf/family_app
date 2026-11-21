-- «🏁 Ya no está a la venta»: casas que nos interesaban y se vendieron o se retiraron, con fechas e historial de precio

-- 1. Estado propio y fechas
alter table public.homes drop constraint homes_status_check;
alter table public.homes add constraint homes_status_check check (status = any (array['propuesta','interesa','llamar','visita_pedida','visitado','favorito','descartado','oferta','fuera']));
alter table public.homes add column if not exists listed_on date;          -- alta del anuncio (aprox.)
alter table public.homes add column if not exists off_market_on date;      -- cuándo dejó de estar a la venta
alter table public.homes add column if not exists off_market_kind text check (off_market_kind is null or off_market_kind in ('vendida', 'retirada'));
alter table public.homes add column if not exists off_market_suspect jsonb check (off_market_suspect is null or (jsonb_typeof(off_market_suspect) = 'object' and pg_column_size(off_market_suspect) < 1000));
alter table public.homes add constraint homes_off_market_dates check (off_market_on is null or listed_on is null or off_market_on >= listed_on);

-- 2. Historial de precio de cada casa (lo escribe un trigger; la app solo lo lee)
create table if not exists public.home_price_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  price_cents bigint not null check (price_cents >= 0),
  changed_on date not null default (now() at time zone 'Europe/Madrid')::date,
  created_at timestamptz not null default now()
);
create index if not exists home_price_history_home on public.home_price_history (home_id, changed_on);
alter table public.home_price_history enable row level security;
create policy home_price_history_read on public.home_price_history for select to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
grant select on public.home_price_history to authenticated;

create or replace function private.track_home_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.price_cents is not null and (tg_op = 'INSERT' or new.price_cents is distinct from old.price_cents) then
    insert into home_price_history (household_id, home_id, price_cents) values (new.household_id, new.id, new.price_cents);
  end if;
  return new;
end $$;
revoke all on function private.track_home_price() from public;
drop trigger if exists z_price_history on public.homes;
create trigger z_price_history after insert or update of price_cents on public.homes
  for each row execute function private.track_home_price();

-- Precio de partida de las que ya había (fecha en que se añadieron)
insert into public.home_price_history (household_id, home_id, price_cents, changed_on, created_at)
select h.household_id, h.id, h.price_cents, (h.created_at at time zone 'Europe/Madrid')::date, h.created_at
from public.homes h where h.price_cents is not null and not exists (select 1 from public.home_price_history x where x.home_id = h.id);

alter publication supabase_realtime add table public.home_price_history;

-- 3. Aviso cuando la búsqueda automática cree que un anuncio ya no está
alter table public.notify_queue drop constraint notify_queue_kind_check;
alter table public.notify_queue add constraint notify_queue_kind_check check (kind in ('propuesta', 'bajada', 'competidor', 'retirada'));

create or replace function private.queue_suspect_notice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.off_market_suspect is not null and old.off_market_suspect is null then
    insert into notify_queue (household_id, kind, ref_id, title, detail)
    values (new.household_id, 'retirada', new.id, left(coalesce(new.title, 'Casa'), 200), left(new.off_market_suspect->>'note', 300));
  end if;
  return new;
end $$;
revoke all on function private.queue_suspect_notice() from public;
drop trigger if exists z_queue_suspect on public.homes;
create trigger z_queue_suspect after update of off_market_suspect on public.homes
  for each row execute function private.queue_suspect_notice();

-- 4. Para la búsqueda automática: marcar como «parece retirada» (no cambia el estado: lo confirmáis en la app)
create or replace function private.flag_off_market(hh uuid, items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it jsonb; n int := 0; errors jsonb := '[]';
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 30 then raise exception 'Máximo 30'; end if;
  for it in select * from jsonb_array_elements(items) loop
    begin
      update public.homes set off_market_suspect = jsonb_build_object(
          'on', (now() at time zone 'Europe/Madrid')::date,
          'sold', coalesce((it->>'sold')::boolean, false),
          'note', left(coalesce(nullif(it->>'note', ''), 'El anuncio ya no aparece'), 200))
      where id = (it->>'id')::uuid and household_id = hh and status not in ('descartado', 'fuera', 'propuesta') and off_market_suspect is null;
      if found then n := n + 1; end if;
    exception when others then errors := errors || jsonb_build_object('id', it->>'id', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('flagged', n, 'errors', errors);
end $$;
revoke all on function private.flag_off_market(uuid, jsonb) from public;

-- 5. La búsqueda automática guarda la fecha de alta del anuncio y ve qué casas seguís
do $do$
declare d text;
begin
  d := pg_get_functiondef('private.propose_homes'::regproc);
  d := replace(d, 'features, heating_type, cooling, energy, agency, advertiser, listing_ref, contact_phone, links, notes, reform)',
                  'features, heating_type, cooling, energy, agency, advertiser, listing_ref, contact_phone, links, notes, reform, listed_on)');
  d := replace(d, 'coalesce(it->''links'', ''[]''), left(note, 1000), coalesce(it->''reform'', ''{}''))',
                  'coalesce(it->''links'', ''[]''), left(note, 1000), coalesce(it->''reform'', ''{}''), case when coalesce(it->>''listed_on'', '''') ~ ''^\d{4}-\d{2}-\d{2}$'' and (it->>''listed_on'')::date <= current_date then (it->>''listed_on'')::date end)');
  if position('listed_on)' in d) = 0 then raise exception 'propose_homes: no se pudo añadir listed_on'; end if;
  execute d;

  d := pg_get_functiondef('private.search_context'::regproc);
  d := replace(d, '''discard_category'', h.discard_category, ''discard_reason'', h.discard_reason,',
                  '''discard_category'', h.discard_category, ''discard_reason'', h.discard_reason, ''listed_on'', h.listed_on, ''off_market_on'', h.off_market_on, ''off_market_suspect'', h.off_market_suspect,');
  if position('off_market_suspect' in d) = 0 then raise exception 'search_context: no se pudo añadir'; end if;
  execute d;
end $do$;
