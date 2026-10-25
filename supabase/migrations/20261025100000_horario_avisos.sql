-- Horario de los avisos por persona y listas de la compra que se ven en Hoy
alter table public.member_preferences
  add column if not exists morning_weekday time default '08:00',   -- null = sin resumen entre semana
  add column if not exists morning_weekend time default '08:00',   -- null = sin resumen el fin de semana
  add column if not exists evening_time time not null default '17:00',
  add column if not exists evening_days smallint[] not null default '{1,2,3,4,5,6,7}',
  add column if not exists weekly_day smallint not null default 7,
  add column if not exists weekly_time time not null default '20:00',
  add column if not exists home_lists uuid[];                       -- null = todas las listas
alter table public.member_preferences drop constraint if exists notify_schedule_check;
alter table public.member_preferences add constraint notify_schedule_check check (
  evening_days <@ array[1,2,3,4,5,6,7]::smallint[] and weekly_day between 1 and 7
  and extract(minute from coalesce(morning_weekday, '00:00')) in (0, 15, 30, 45)
  and extract(minute from coalesce(morning_weekend, '00:00')) in (0, 15, 30, 45)
  and extract(minute from evening_time) in (0, 15, 30, 45)
  and extract(minute from weekly_time) in (0, 15, 30, 45)
);

-- Registro de avisos enviados: cada aviso, una sola vez por persona y día (solo lo usa el servidor)
create table if not exists public.notify_log (
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('daily', 'evening', 'weekly')),
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (member_id, kind, day)
);
alter table public.notify_log enable row level security;
revoke all on public.notify_log from anon, authenticated;

-- Un único trabajo cada 15 minutos que decide a quién le toca cada aviso
select cron.unschedule(j) from unnest(array['notify-daily', 'notify-weekly', 'notify-evening']) j where exists (select 1 from cron.job where jobname = j);
select cron.unschedule('notify-scheduled') where exists (select 1 from cron.job where jobname = 'notify-scheduled');
select cron.schedule('notify-scheduled', '*/15 * * * *', $job$select net.http_post(url := 'https://oszaykaerxzwslvdwssa.supabase.co/functions/v1/notify', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')), body := '{"mode":"scheduled"}'::jsonb)$job$);

-- Limpieza del registro
select cron.unschedule('notify-log-cleanup') where exists (select 1 from cron.job where jobname = 'notify-log-cleanup');
select cron.schedule('notify-log-cleanup', '45 3 * * *', $job$delete from public.notify_log where day < current_date - 14$job$);
