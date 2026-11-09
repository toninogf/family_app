-- Reforma de cada piso de Buscamos: estado, partidas (con cantidad, gama, precio propio o presupuesto y sus archivos)
alter table public.homes add column if not exists reform jsonb not null default '{}'::jsonb;
alter table public.homes drop constraint if exists homes_reform_check;
alter table public.homes add constraint homes_reform_check check (jsonb_typeof(reform) = 'object' and pg_column_size(reform) < 40000);

create or replace function private.validate_home_reform()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb := new.reform;
begin
  if r = '{}'::jsonb then return new; end if;
  if coalesce(r->>'state', 'listo') not in ('listo', 'lavado', 'parcial', 'integral')
     or (r ? 'items' and (jsonb_typeof(r->'items') <> 'array' or jsonb_array_length(r->'items') > 40))
     or char_length(coalesce(r->>'note', '')) > 600
     or (r ? 'contingency' and (jsonb_typeof(r->'contingency') <> 'number' or (r->>'contingency')::numeric not between 0 and 50))
  then
    raise exception 'Reforma no válida';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(r->'items', '[]')) i
    where jsonb_typeof(i) <> 'object'
       or char_length(coalesce(i->>'k', '')) not between 1 and 40
       or char_length(coalesce(i->>'label', '')) > 80
       or char_length(coalesce(i->>'n', '')) > 300
       or coalesce(i->>'tier', 'media') not in ('basica', 'media', 'alta')
       or coalesce(i->>'src', 'manual') not in ('manual', 'ia', 'auto', 'visita')
       or (i ? 'q' and (jsonb_typeof(i->'q') <> 'number' or (i->>'q')::numeric not between 0 and 100000))
       or (i ? 'own_cents' and (jsonb_typeof(i->'own_cents') <> 'number' or (i->>'own_cents')::numeric not between 0 and 2000000000))
       or (i ? 'quote_cents' and (jsonb_typeof(i->'quote_cents') <> 'number' or (i->>'quote_cents')::numeric not between 0 and 2000000000))
       or (i ? 'files' and (jsonb_typeof(i->'files') <> 'array' or jsonb_array_length(i->'files') > 10))
  ) then
    raise exception 'Partida de reforma no válida';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(r->'items', '[]')) i, jsonb_array_elements(coalesce(i->'files', '[]')) f
    where jsonb_typeof(f) <> 'object' or coalesce(f->>'path', '') = '' or char_length(f->>'path') > 300
       or char_length(coalesce(f->>'name', '')) > 200 or split_part(f->>'path', '/', 1) <> new.household_id::text
  ) then
    raise exception 'Archivo no válido';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_home_reform() from public, anon, authenticated;
create or replace trigger b_reform before insert or update on public.homes for each row execute function private.validate_home_reform();
