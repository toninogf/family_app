-- Aviso de fin de descanso del gimnasio aunque la app esté en segundo plano:
-- la app programa la hora de fin y pg_cron (cada 5 s) pide a «notify» que mande el push cuando toca.

create table if not exists public.gym_timers (
  member_id uuid primary key references public.members(id) on delete cascade,
  fire_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists gym_timers_fire_idx on public.gym_timers(fire_at);

alter table public.gym_timers enable row level security;
-- Solo lectura de lo propio; se escribe con las funciones de abajo
drop policy if exists "gym_timers_own" on public.gym_timers;
create policy "gym_timers_own" on public.gym_timers for select to authenticated
  using ((select private.has_mfa()) and member_id = (select private.current_member_id()));
revoke all on public.gym_timers from anon;
revoke insert, update, delete on public.gym_timers from authenticated;

create or replace function public.gym_rest_start(p_seconds int)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare me uuid := private.current_member_id(); t timestamptz;
begin
  if not private.has_mfa() or me is null then raise exception 'No autorizado'; end if;
  if p_seconds is null or p_seconds < 5 or p_seconds > 1800 then raise exception 'Descanso no válido'; end if;
  t := now() + make_interval(secs => p_seconds);
  insert into public.gym_timers(member_id, fire_at) values (me, t)
    on conflict (member_id) do update set fire_at = excluded.fire_at, created_at = now();
  return t;
end;
$$;

create or replace function public.gym_rest_cancel()
returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := private.current_member_id();
begin
  if not private.has_mfa() or me is null then raise exception 'No autorizado'; end if;
  delete from public.gym_timers where member_id = me;
end;
$$;

revoke all on function public.gym_rest_start(int) from public, anon;
revoke all on function public.gym_rest_cancel() from public, anon;
grant execute on function public.gym_rest_start(int) to authenticated;
grant execute on function public.gym_rest_cancel() to authenticated;

-- Cada 5 s: solo llama a la función si hay algún descanso vencido (si no, no hace nada)
select cron.unschedule('gym-rest') where exists (select 1 from cron.job where jobname = 'gym-rest');
select cron.schedule('gym-rest', '5 seconds', $cron$
  select net.http_post(
    url := 'https://oszaykaerxzwslvdwssa.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"mode":"rest"}'::jsonb)
  where exists (select 1 from public.gym_timers where fire_at <= now())
$cron$);

-- Limpieza diaria del historial de ejecuciones de pg_cron (con un trabajo cada 5 s crecería mucho)
select cron.unschedule('cron-history-cleanup') where exists (select 1 from cron.job where jobname = 'cron-history-cleanup');
select cron.schedule('cron-history-cleanup', '30 3 * * *', $cron$
  delete from cron.job_run_details where end_time < now() - interval '2 days'
$cron$);
