-- Fase 5: avisos push (agenda diaria y resumen semanal)
-- Los secretos (claves VAPID y cron_secret) se guardaron en el Vault de Supabase y NO están en el repositorio:
--   select vault.create_secret('<vapid_private>', 'vapid_private');
--   select vault.create_secret('<vapid_public>', 'vapid_public');
--   select vault.create_secret('<cron_secret>', 'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  daily boolean not null default true,
  weekly boolean not null default true,
  created_at timestamptz not null default now()
);
create index push_subscriptions_member_idx on public.push_subscriptions(member_id);
create index push_subscriptions_household_idx on public.push_subscriptions(household_id);

create or replace function private.push_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.member_id := private.current_member_id();
  select m.household_id into new.household_id from public.members m where m.id = new.member_id;
  return new;
end;
$$;
revoke all on function private.push_defaults() from public, anon, authenticated;
create trigger push_subscriptions_defaults before insert or update on public.push_subscriptions
  for each row execute function private.push_defaults();

alter table public.push_subscriptions enable row level security;
create policy "push_own" on public.push_subscriptions for all to authenticated
  using ((select private.has_mfa()) and member_id = (select private.current_member_id()))
  with check ((select private.has_mfa()) and member_id = (select private.current_member_id()));
revoke all on public.push_subscriptions from anon;

create or replace function public.push_config()
returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    'cron', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
  )
$$;
revoke all on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- UTC: agenda 06:00 (8:00 verano / 7:00 invierno en Madrid); resumen domingo 18:00
select cron.schedule('notify-daily', '0 6 * * *', $cron$
  select net.http_post(
    url := 'https://oszaykaerxzwslvdwssa.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"mode":"daily"}'::jsonb)
$cron$);
select cron.schedule('notify-weekly', '0 18 * * 0', $cron$
  select net.http_post(
    url := 'https://oszaykaerxzwslvdwssa.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"mode":"weekly"}'::jsonb)
$cron$);
