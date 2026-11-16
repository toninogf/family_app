-- Fase 2 «Uso a dos»: Mudanza en vivo entre los dos móviles y avisos de la mudanza
alter publication supabase_realtime add table public.sale_competitors, public.home_rejections;

-- Avisos de la mudanza activables por dispositivo
alter table public.push_subscriptions add column if not exists mudanza boolean not null default true;

-- «Visitas de mañana»: una vez por persona y día
alter table public.notify_log drop constraint if exists notify_log_kind_check;
alter table public.notify_log add constraint notify_log_kind_check check (kind = any (array['daily','evening','weekly','visitas']));

-- Cola de avisos de la mudanza (la vacía la función notify cada 15 min; solo service role)
create table if not exists public.notify_queue (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('propuesta', 'bajada', 'competidor')),
  ref_id uuid,
  title text not null check (char_length(title) <= 200),
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notify_queue_pending on public.notify_queue (household_id) where sent_at is null;
alter table public.notify_queue enable row level security;
revoke all on public.notify_queue from anon, authenticated;

create or replace function private.eur(c bigint) returns text language sql immutable set search_path = '' as $$
  select replace(to_char(c / 100, 'FM999G999G999'), ',', '.') || ' €'
$$;

create or replace function private.queue_home_notice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'propuesta' then
    insert into notify_queue (household_id, kind, ref_id, title, detail)
    values (new.household_id, 'propuesta', new.id, left(coalesce(new.title, 'Casa'), 200),
            nullif(concat_ws(' · ', new.municipality, case when new.price_cents is not null then private.eur(new.price_cents) end), ''));
  elsif tg_op = 'UPDATE' and new.status <> 'descartado' and old.price_cents is not null and new.price_cents is not null
        and new.price_cents < old.price_cents then
    insert into notify_queue (household_id, kind, ref_id, title, detail)
    values (new.household_id, 'bajada', new.id, left(coalesce(new.title, 'Casa'), 200),
            private.eur(old.price_cents) || ' → ' || private.eur(new.price_cents));
  end if;
  return new;
end $$;
revoke all on function private.queue_home_notice() from public;
drop trigger if exists z_queue_notice on public.homes;
create trigger z_queue_notice after insert or update of price_cents on public.homes
  for each row execute function private.queue_home_notice();

create or replace function private.queue_competitor_notice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.review = 'propuesta' then
    insert into notify_queue (household_id, kind, ref_id, title, detail)
    values (new.household_id, 'competidor', new.id, left(coalesce(new.title, 'Piso'), 200),
            case when new.price_cents is not null then private.eur(new.price_cents) end);
  end if;
  return new;
end $$;
revoke all on function private.queue_competitor_notice() from public;
drop trigger if exists z_queue_notice on public.sale_competitors;
create trigger z_queue_notice after insert on public.sale_competitors
  for each row execute function private.queue_competitor_notice();

-- Cada 15 min: avisos de la mudanza (función notify-mudanza)
select cron.schedule('notify-mudanza', '*/15 * * * *', $c$select net.http_post(url := 'https://oszaykaerxzwslvdwssa.supabase.co/functions/v1/notify-mudanza', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')), body := '{}'::jsonb)$c$);
select cron.schedule('notify-queue-cleanup', '50 3 * * *', $c$delete from public.notify_queue where sent_at < now() - interval '30 days'$c$);
