-- Lo que dice la nota simple del Registro de la Propiedad (metros, parcela, cargas, nº de titulares; nunca nombres)
alter table public.homes
  add column if not exists registry jsonb check (registry is null or (jsonb_typeof(registry) = 'object' and pg_column_size(registry) < 4000));
