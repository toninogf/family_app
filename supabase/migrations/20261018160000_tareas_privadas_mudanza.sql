-- 1) Pestaña propia «Mudanza» (Vendemos y Buscamos salen de «Casa», que pasa a llamarse «Tareas»)
alter table public.member_preferences drop constraint if exists member_preferences_tabs_check;
alter table public.member_preferences add constraint member_preferences_tabs_check
  check (tabs <@ array['compra', 'casa', 'mudanza', 'agenda', 'dinero', 'gym']);
-- Quien ya tenía «Casa» visible, ve también «Mudanza» justo detrás
update public.member_preferences
  set tabs = tabs[1:array_position(tabs, 'casa')] || array['mudanza'] || tabs[array_position(tabs, 'casa') + 1:]
  where 'casa' = any(tabs) and not ('mudanza' = any(tabs));

-- 2) Tareas privadas («Solo para mí»): solo las ve y las hace quien las crea
alter table public.tasks add column if not exists private boolean not null default false;

create or replace function private.task_private_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare me uuid := private.current_member_id(); owner uuid;
begin
  owner := case when tg_op = 'INSERT' then me else old.created_by end;
  if new.private then
    if tg_op = 'UPDATE' and not old.private and old.created_by is distinct from me then
      raise exception 'Solo quien creó la tarea puede hacerla privada';
    end if;
    new.assignee_id := owner; -- una tarea privada siempre es de su dueño
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_private on public.tasks;
create trigger tasks_private before insert or update on public.tasks for each row execute function private.task_private_row();

-- Restrictivas: se suman a las del hogar. Las privadas de otro no se ven, ni se tocan, ni sus marcas de hecha.
drop policy if exists "tasks_private_owner" on public.tasks;
create policy "tasks_private_owner" on public.tasks as restrictive for all to authenticated
  using (not private or created_by = (select private.current_member_id()))
  with check (not private or created_by = (select private.current_member_id()));
drop policy if exists "task_completions_private_owner" on public.task_completions;
create policy "task_completions_private_owner" on public.task_completions as restrictive for all to authenticated
  using (task_id in (select id from public.tasks))
  with check (task_id in (select id from public.tasks));
