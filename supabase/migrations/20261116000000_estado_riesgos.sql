-- «Estado y riesgos» de cada piso de Buscamos: Catastro, zona inundable y comprobaciones (automáticas, de la IA o a mano)
alter table public.homes
  add column if not exists cadastral_ref text check (cadastral_ref is null or cadastral_ref ~ '^[0-9A-Z]{14}([0-9A-Z]{6})?$'),
  -- Lo que devolvió el Catastro: {rc, address, use, built_m2, plot_m2, year, kind, units, at}
  add column if not exists cadastre jsonb check (cadastre is null or (jsonb_typeof(cadastre) = 'object' and pg_column_size(cadastre) < 4000)),
  -- Zona inundable (mapas oficiales del Ministerio): {t100: calado en m o null, t500: …, at}
  add column if not exists flood jsonb check (flood is null or (jsonb_typeof(flood) = 'object' and pg_column_size(flood) < 1000)),
  -- Comprobaciones: {clave: {s: ok|warn|bad|unknown, n: nota, src: auto|ia|manual, files: [{path, name}]}}
  add column if not exists health jsonb not null default '{}' check (jsonb_typeof(health) = 'object' and pg_column_size(health) < 30000);

-- Cada comprobación bien formada y sus archivos solo en la carpeta del hogar
create or replace function private.validate_home_health()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_each(new.health) e
    where jsonb_typeof(e.value) <> 'object'
       or char_length(e.key) > 40
       or coalesce(e.value->>'s', '') not in ('ok', 'warn', 'bad', 'unknown')
       or char_length(coalesce(e.value->>'n', '')) > 500
       or coalesce(e.value->>'src', 'manual') not in ('auto', 'ia', 'manual')
       or (e.value ? 'files' and (jsonb_typeof(e.value->'files') <> 'array' or jsonb_array_length(e.value->'files') > 10))
  ) then
    raise exception 'Comprobación no válida';
  end if;
  if exists (
    select 1 from jsonb_each(new.health) e, jsonb_array_elements(coalesce(e.value->'files', '[]')) f
    where jsonb_typeof(f) <> 'object' or coalesce(f->>'path', '') = '' or char_length(f->>'path') > 300
       or char_length(coalesce(f->>'name', '')) > 200 or split_part(f->>'path', '/', 1) <> new.household_id::text
  ) then
    raise exception 'Archivo no válido';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_home_health() from public, anon, authenticated;
create or replace trigger b_health before insert or update on public.homes for each row execute function private.validate_home_health();
