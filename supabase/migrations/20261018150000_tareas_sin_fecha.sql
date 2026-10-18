-- Tareas sin fecha fija: «Sin fecha» (con fecha límite opcional) y «Cada X días desde la última vez»
alter table public.tasks drop constraint if exists tasks_repeat_check;
alter table public.tasks add constraint tasks_repeat_check check (repeat in ('none', 'daily', 'weekly', 'monthly', 'anytime', 'interval'));
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists interval_days smallint check (interval_days between 1 and 365);
alter table public.tasks drop constraint if exists interval_has_days;
alter table public.tasks add constraint interval_has_days check (repeat <> 'interval' or interval_days is not null);
