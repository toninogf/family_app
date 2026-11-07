-- Documentos de la venta y de la compra: varios archivos (PDF o fotos) por documento
alter table public.sale_documents
  add column if not exists files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 20);
alter table public.purchase_docs
  add column if not exists files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 20);

-- El archivo que ya tuviera cada documento pasa a la lista
update public.sale_documents set files = jsonb_build_array(jsonb_build_object('path', path, 'name', coalesce(file_name, 'Documento'))), path = null, file_name = null
where path is not null and files = '[]';
update public.purchase_docs set files = jsonb_build_array(jsonb_build_object('path', path, 'name', coalesce(file_name, 'Documento'))), path = null, file_name = null
where path is not null and files = '[]';

-- Hogar siempre el propio; todos los archivos, dentro de la carpeta del hogar; el piso de la compra, uno del hogar
create or replace function private.sale_row_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then new.household_id := coalesce(new.household_id, private.my_household());
  else new.household_id := old.household_id; end if;
  -- (anidado: no todas las tablas tienen «path», «files» o «home_id» y plpgsql evaluaría el campo igualmente)
  if tg_table_name in ('sale_photos', 'sale_documents', 'purchase_docs') then
    if new.path is not null and split_part(new.path, '/', 1) <> new.household_id::text then
      raise exception 'Archivo no válido';
    end if;
  end if;
  if tg_table_name in ('sale_documents', 'purchase_docs') then
    if exists (
      select 1 from jsonb_array_elements(new.files) f
      where jsonb_typeof(f) <> 'object' or coalesce(f->>'path', '') = '' or char_length(f->>'path') > 300
         or char_length(coalesce(f->>'name', '')) > 200 or split_part(f->>'path', '/', 1) <> new.household_id::text
    ) then
      raise exception 'Archivo no válido';
    end if;
  end if;
  if tg_table_name = 'purchase' then
    if new.home_id is not null and not exists (select 1 from public.homes h where h.id = new.home_id and h.household_id = new.household_id) then
      raise exception 'Piso no válido';
    end if;
  end if;
  if tg_table_name in ('sale_documents', 'purchase_docs', 'purchase') then new.updated_at := now(); end if;
  return new;
end;
$$;
revoke all on function private.sale_row_defaults() from public, anon, authenticated;
