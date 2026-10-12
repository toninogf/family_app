-- Permite mover un artículo de la compra a otra lista, siempre que sea del mismo hogar
create or replace function private.shopping_items_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select l.household_id into new.household_id from public.shopping_lists l where l.id = new.list_id;
    new.added_by := private.current_member_id();
  else
    new.household_id := old.household_id;
    new.added_by := old.added_by;
    if new.list_id is distinct from old.list_id and not exists (
      select 1 from public.shopping_lists l where l.id = new.list_id and l.household_id = old.household_id
    ) then
      raise exception 'Lista no válida';
    end if;
  end if;
  if new.checked and (tg_op = 'INSERT' or not old.checked) then
    new.checked_at := now();
  elsif not new.checked then
    new.checked_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.shopping_items_defaults() from public, anon, authenticated;
