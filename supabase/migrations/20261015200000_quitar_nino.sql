-- Eliminar un niño desde la app: solo niños del propio hogar y con 2FA.
-- Sus actividades no se pierden: pasan a «Familia».
create or replace function public.remove_child(p_member uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_mfa() then raise exception 'No autorizado'; end if;
  if not exists (
    select 1 from public.members m
    where m.id = p_member and m.kind = 'child' and m.household_id in (select private.current_household_ids())
  ) then
    raise exception 'Solo se pueden eliminar niños de tu familia';
  end if;
  update public.events set child_id = null where child_id = p_member;
  delete from public.members where id = p_member;
end;
$$;
revoke all on function public.remove_child(uuid) from public, anon;
grant execute on function public.remove_child(uuid) to authenticated;
