-- Recordatorio de la tarde (17:00 en Madrid) con las tareas de hoy que quedan, activable por dispositivo
alter table public.push_subscriptions add column if not exists evening boolean not null default true;

-- pg_cron va en UTC: se lanza a las 15 y a las 16 UTC y la función solo envía cuando en Madrid son las 17
select cron.unschedule('notify-evening') where exists (select 1 from cron.job where jobname = 'notify-evening');
select cron.schedule('notify-evening', '0 15,16 * * *', $job$select net.http_post(url := 'https://oszaykaerxzwslvdwssa.supabase.co/functions/v1/notify', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')), body := '{"mode":"evening"}'::jsonb)$job$);
