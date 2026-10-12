-- Fase 4: tareas de casa y actividades de los niños
-- Días de la semana en formato ISO: 1 = lunes … 7 = domingo

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  assignee_id uuid references public.members(id) on delete set null,   -- null = cualquiera
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  month_day smallint check (month_day between 1 and 31),
  start_date date not null default current_date,
  active boolean not null default true,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint weekly_has_days check (repeat <> 'weekly' or cardinality(weekdays) > 0),
  constraint monthly_has_day check (repeat <> 'monthly' or month_day is not null)
);
create index tasks_household_idx on public.tasks(household_id);
create index tasks_assignee_idx on public.tasks(assignee_id);
create index tasks_created_by_idx on public.tasks(created_by);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  occurrence_date date not null,
  done_by uuid references public.members(id) on delete set null,
  done_at timestamptz not null default now(),
  unique (task_id, occurrence_date)
);
create index task_completions_household_idx on public.task_completions(household_id, occurrence_date);
create index task_completions_done_by_idx on public.task_completions(done_by);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid references public.members(id) on delete cascade,        -- null = toda la familia
  title text not null check (char_length(title) between 1 and 80),
  location text check (location is null or char_length(location) <= 80),
  start_time time not null,
  end_time time,
  repeat text not null default 'weekly' check (repeat in ('none', 'weekly')),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  start_date date not null default current_date,
  until date,
  drop_off_id uuid references public.members(id) on delete set null,
  pick_up_id uuid references public.members(id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint events_weekly_has_days check (repeat <> 'weekly' or cardinality(weekdays) > 0),
  constraint events_until_after_start check (until is null or until >= start_date),
  constraint events_end_after_start check (end_time is null or end_time > start_time)
);
create index events_household_idx on public.events(household_id);
create index events_child_idx on public.events(child_id);
create index events_drop_off_idx on public.events(drop_off_id);
create index events_pick_up_idx on public.events(pick_up_id);
create index events_created_by_idx on public.events(created_by);

create table public.event_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  occurrence_date date not null,
  cancelled boolean not null default false,
  start_time time,
  end_time time,
  override_drivers boolean not null default false,
  drop_off_id uuid references public.members(id) on delete set null,
  pick_up_id uuid references public.members(id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  unique (event_id, occurrence_date)
);
create index event_exceptions_household_idx on public.event_exceptions(household_id, occurrence_date);
create index event_exceptions_drop_off_idx on public.event_exceptions(drop_off_id);
create index event_exceptions_pick_up_idx on public.event_exceptions(pick_up_id);

-- Comprueba que una persona es del hogar y del tipo indicado
create or replace function private.member_ok(p_member uuid, p_household uuid, p_kind text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_member is null or exists (
    select 1 from public.members m where m.id = p_member and m.household_id = p_household and m.kind = p_kind
  )
$$;
revoke all on function private.member_ok(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.validate_family_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'tasks' then
    if tg_op = 'INSERT' then new.created_by := private.current_member_id();
    else new.created_by := old.created_by; new.household_id := old.household_id; end if;
    if not private.member_ok(new.assignee_id, new.household_id, 'adult') then raise exception 'Responsable no válido'; end if;

  elsif tg_table_name = 'task_completions' then
    select t.household_id into new.household_id from public.tasks t where t.id = new.task_id;
    new.done_by := private.current_member_id();
    new.done_at := now();

  elsif tg_table_name = 'events' then
    if tg_op = 'INSERT' then new.created_by := private.current_member_id();
    else new.created_by := old.created_by; new.household_id := old.household_id; end if;
    if not private.member_ok(new.child_id, new.household_id, 'child') then raise exception 'Niño no válido'; end if;
    if not private.member_ok(new.drop_off_id, new.household_id, 'adult') then raise exception 'Quién lleva no válido'; end if;
    if not private.member_ok(new.pick_up_id, new.household_id, 'adult') then raise exception 'Quién recoge no válido'; end if;

  elsif tg_table_name = 'event_exceptions' then
    select e.household_id into new.household_id from public.events e where e.id = new.event_id;
    if not private.member_ok(new.drop_off_id, new.household_id, 'adult') then raise exception 'Quién lleva no válido'; end if;
    if not private.member_ok(new.pick_up_id, new.household_id, 'adult') then raise exception 'Quién recoge no válido'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_family_row() from public, anon, authenticated;

create trigger tasks_validate before insert or update on public.tasks
  for each row execute function private.validate_family_row();
create trigger task_completions_validate before insert or update on public.task_completions
  for each row execute function private.validate_family_row();
create trigger events_validate before insert or update on public.events
  for each row execute function private.validate_family_row();
create trigger event_exceptions_validate before insert or update on public.event_exceptions
  for each row execute function private.validate_family_row();

alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.events enable row level security;
alter table public.event_exceptions enable row level security;

create policy "tasks_all" on public.tasks for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "task_completions_all" on public.task_completions for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "events_all" on public.events for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
create policy "event_exceptions_all" on public.event_exceptions for all to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()))
  with check ((select private.has_mfa()) and household_id in (select private.current_household_ids()));

revoke all on public.tasks, public.task_completions, public.events, public.event_exceptions from anon;

alter publication supabase_realtime add table public.tasks, public.task_completions, public.events, public.event_exceptions;
