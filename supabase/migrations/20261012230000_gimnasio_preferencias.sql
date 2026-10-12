-- Gimnasio privado de cada adulto + preferencias personales (pestañas, orden de Hoy).
-- Todo lo del gimnasio es PRIVADO: solo lo ve su dueño (ni siquiera el otro adulto).

-- ---------- Preferencias ----------
create table public.member_preferences (
  member_id uuid primary key references public.members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  tabs text[] not null default array['compra', 'casa', 'agenda', 'dinero', 'gym']
    check (tabs <@ array['compra', 'casa', 'agenda', 'dinero', 'gym']),
  home_sections text[] not null default array['saldo', 'agenda', 'comedor', 'tareas', 'mudanza', 'gym', 'compra']
    check (home_sections <@ array['saldo', 'agenda', 'comedor', 'tareas', 'mudanza', 'gym', 'compra']),
  -- Compartir en la Agenda solo «Gimnasio» (sin detalles). Apagado por defecto.
  gym_share boolean not null default false,
  gym_days smallint[] not null default '{}' check (gym_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  gym_start time,
  gym_end time,
  gym_event_id uuid,
  updated_at timestamptz not null default now(),
  constraint gym_end_after_start check (gym_end is null or gym_start is null or gym_end > gym_start)
);

-- ---------- Gimnasio ----------
create table public.gym_exercises (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  muscle text not null default 'otro' check (muscle in ('pecho', 'espalda', 'pierna', 'hombro', 'brazos', 'core', 'cardio', 'otro')),
  kind text not null default 'strength' check (kind in ('strength', 'cardio')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index gym_exercises_member_idx on public.gym_exercises(member_id);

create table public.gym_routines (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index gym_routines_member_idx on public.gym_routines(member_id);

create table public.gym_routine_items (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  routine_id uuid not null references public.gym_routines(id) on delete cascade,
  exercise_id uuid not null references public.gym_exercises(id) on delete cascade,
  position int not null default 0,
  target_sets smallint not null default 3 check (target_sets between 1 and 20),
  target_reps text check (target_reps is null or char_length(target_reps) <= 10),
  target_kg numeric(6,2) check (target_kg is null or target_kg between 0 and 1000),
  rest_seconds int not null default 90 check (rest_seconds between 0 and 900)
);
create index gym_routine_items_routine_idx on public.gym_routine_items(routine_id);
create index gym_routine_items_exercise_idx on public.gym_routine_items(exercise_id);
create index gym_routine_items_member_idx on public.gym_routine_items(member_id);

create table public.gym_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  routine_id uuid references public.gym_routines(id) on delete set null,
  title text check (title is null or char_length(title) <= 60),
  session_date date not null default current_date,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 1000)
);
create index gym_sessions_member_idx on public.gym_sessions(member_id, session_date);
create index gym_sessions_routine_idx on public.gym_sessions(routine_id);

create table public.gym_sets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  session_id uuid not null references public.gym_sessions(id) on delete cascade,
  exercise_id uuid not null references public.gym_exercises(id) on delete cascade,
  position int not null default 0,          -- orden del ejercicio en la sesión
  set_no smallint not null default 1,
  reps smallint check (reps is null or reps between 0 and 1000),
  kg numeric(6,2) check (kg is null or kg between 0 and 1000),
  minutes numeric(5,1) check (minutes is null or minutes between 0 and 600),
  km numeric(6,2) check (km is null or km between 0 and 500),
  rest_seconds int not null default 90 check (rest_seconds between 0 and 900),
  done boolean not null default false
);
create index gym_sets_session_idx on public.gym_sets(session_id);
create index gym_sets_exercise_idx on public.gym_sets(exercise_id);
create index gym_sets_member_idx on public.gym_sets(member_id);

create table public.gym_body (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg numeric(5,1) check (weight_kg is null or weight_kg between 20 and 400),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or body_fat_pct between 1 and 80),
  waist_cm numeric(5,1) check (waist_cm is null or waist_cm between 20 and 300),
  chest_cm numeric(5,1) check (chest_cm is null or chest_cm between 20 and 300),
  hip_cm numeric(5,1) check (hip_cm is null or hip_cm between 20 and 300),
  arm_cm numeric(5,1) check (arm_cm is null or arm_cm between 5 and 100),
  thigh_cm numeric(5,1) check (thigh_cm is null or thigh_cm between 10 and 150),
  notes text check (notes is null or char_length(notes) <= 500)
);
create index gym_body_member_idx on public.gym_body(member_id, measured_on);

-- ---------- Validación: todo pertenece a quien lo escribe ----------
create or replace function private.validate_gym_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare me uuid := private.current_member_id();
begin
  if tg_op = 'INSERT' then
    new.member_id := coalesce(me, new.member_id);
  else
    new.member_id := old.member_id;
  end if;
  if new.member_id is null then raise exception 'Sin miembro'; end if;

  if tg_table_name = 'gym_routine_items' then
    if not exists (select 1 from public.gym_routines r where r.id = new.routine_id and r.member_id = new.member_id)
      or not exists (select 1 from public.gym_exercises e where e.id = new.exercise_id and e.member_id = new.member_id) then
      raise exception 'Rutina o ejercicio no válido';
    end if;
  elsif tg_table_name = 'gym_sessions' then
    if new.routine_id is not null and not exists (select 1 from public.gym_routines r where r.id = new.routine_id and r.member_id = new.member_id) then
      raise exception 'Rutina no válida';
    end if;
  elsif tg_table_name = 'gym_sets' then
    if not exists (select 1 from public.gym_sessions s where s.id = new.session_id and s.member_id = new.member_id)
      or not exists (select 1 from public.gym_exercises e where e.id = new.exercise_id and e.member_id = new.member_id) then
      raise exception 'Sesión o ejercicio no válido';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_gym_row() from public, anon, authenticated;

create trigger a_validate before insert or update on public.gym_exercises for each row execute function private.validate_gym_row();
create trigger a_validate before insert or update on public.gym_routines for each row execute function private.validate_gym_row();
create trigger a_validate before insert or update on public.gym_routine_items for each row execute function private.validate_gym_row();
create trigger a_validate before insert or update on public.gym_sessions for each row execute function private.validate_gym_row();
create trigger a_validate before insert or update on public.gym_sets for each row execute function private.validate_gym_row();
create trigger a_validate before insert or update on public.gym_body for each row execute function private.validate_gym_row();

-- Preferencias: siempre las de quien escribe; si comparte el gimnasio, se refleja en la Agenda
create or replace function private.member_preferences_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := private.current_member_id();
  v_cat uuid;
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    new.member_id := coalesce(me, new.member_id);
  else
    new.member_id := old.member_id;
    new.gym_event_id := old.gym_event_id;
  end if;
  select m.household_id into new.household_id from public.members m where m.id = new.member_id;
  new.updated_at := now();

  -- Actividad espejo «Gimnasio» (sin detalles) en la Agenda familiar
  if new.gym_share and cardinality(new.gym_days) > 0 and new.gym_start is not null then
    select c.id into v_cat from public.event_categories c
      where c.household_id = new.household_id and c.name = 'Deporte' and not c.archived limit 1;
    if v_cat is null then
      select c.id into v_cat from public.event_categories c where c.household_id = new.household_id and c.key = 'otros';
    end if;
    if new.gym_event_id is not null and exists (select 1 from public.events e where e.id = new.gym_event_id) then
      update public.events set weekdays = new.gym_days, start_time = new.gym_start, end_time = new.gym_end, paused = false
        where id = new.gym_event_id;
    else
      insert into public.events (household_id, child_id, title, start_time, end_time, repeat, weekdays, start_date, category_id)
      values (new.household_id, new.member_id, 'Gimnasio', new.gym_start, new.gym_end, 'weekly', new.gym_days, current_date, v_cat)
      returning id into v_id;
      new.gym_event_id := v_id;
    end if;
  elsif new.gym_event_id is not null then
    delete from public.events where id = new.gym_event_id;
    new.gym_event_id := null;
  end if;
  return new;
end;
$$;
revoke all on function private.member_preferences_row() from public, anon, authenticated;
create trigger a_row before insert or update on public.member_preferences for each row execute function private.member_preferences_row();

-- ---------- Seguridad: cada uno solo lo suyo ----------
do $$
declare t text;
begin
  foreach t in array array['member_preferences', 'gym_exercises', 'gym_routines', 'gym_routine_items', 'gym_sessions', 'gym_sets', 'gym_body'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using ((select private.has_mfa()) and member_id = (select private.current_member_id()))
        with check ((select private.has_mfa()) and member_id = (select private.current_member_id()))
    $p$, t || '_own', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------- Ejercicios iniciales ----------
create or replace function private.gym_seed_for(p_member uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.gym_exercises (member_id, name, muscle, kind)
  select p_member, x.name, x.muscle, x.kind from (values
    ('Press banca', 'pecho', 'strength'), ('Press inclinado con mancuernas', 'pecho', 'strength'), ('Aperturas con mancuernas', 'pecho', 'strength'), ('Fondos', 'pecho', 'strength'),
    ('Dominadas', 'espalda', 'strength'), ('Remo con barra', 'espalda', 'strength'), ('Jalón al pecho', 'espalda', 'strength'), ('Remo en polea baja', 'espalda', 'strength'),
    ('Sentadilla', 'pierna', 'strength'), ('Peso muerto', 'pierna', 'strength'), ('Prensa', 'pierna', 'strength'), ('Zancadas', 'pierna', 'strength'),
    ('Curl femoral', 'pierna', 'strength'), ('Extensión de cuádriceps', 'pierna', 'strength'), ('Elevación de gemelos', 'pierna', 'strength'), ('Hip thrust', 'pierna', 'strength'),
    ('Press militar', 'hombro', 'strength'), ('Elevaciones laterales', 'hombro', 'strength'), ('Face pull', 'hombro', 'strength'),
    ('Curl de bíceps', 'brazos', 'strength'), ('Curl martillo', 'brazos', 'strength'), ('Extensión de tríceps en polea', 'brazos', 'strength'), ('Press francés', 'brazos', 'strength'),
    ('Plancha (segundos)', 'core', 'strength'), ('Crunch en polea', 'core', 'strength'),
    ('Cinta', 'cardio', 'cardio'), ('Bicicleta estática', 'cardio', 'cardio'), ('Elíptica', 'cardio', 'cardio'), ('Remo (máquina)', 'cardio', 'cardio')
  ) as x(name, muscle, kind)
  where not exists (select 1 from public.gym_exercises e where e.member_id = p_member)
$$;
revoke all on function private.gym_seed_for(uuid) from public, anon, authenticated;

-- Desde la app: cargar la lista inicial para uno mismo (si aún no tiene ejercicios)
create or replace function public.gym_seed()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_mfa() or private.current_member_id() is null then raise exception 'No autorizado'; end if;
  perform private.gym_seed_for(private.current_member_id());
end;
$$;
revoke all on function public.gym_seed() from public, anon;
grant execute on function public.gym_seed() to authenticated;

select private.gym_seed_for(m.id) from public.members m where m.kind = 'adult';
