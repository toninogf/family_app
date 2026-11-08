-- Precios de la zona de cada piso (lo que se paga en notaría y lo que se pide en portales), para el precio recomendado
alter table public.homes
  add column if not exists market jsonb check (market is null or (jsonb_typeof(market) = 'object' and pg_column_size(market) < 2000));
