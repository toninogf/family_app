-- Mover un día concreto de una actividad semanal a otra fecha (en vez de cancelarlo y crear otra)
alter table public.event_exceptions add column if not exists moved_to date;
alter table public.event_exceptions add constraint event_exceptions_moved_check check (moved_to is null or (not cancelled and moved_to <> occurrence_date));
create index if not exists event_exceptions_moved_to on public.event_exceptions (household_id, moved_to) where moved_to is not null;
