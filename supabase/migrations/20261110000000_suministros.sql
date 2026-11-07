-- Gastos de suministros (media al mes): luz, agua y calefacción, en los pisos de Buscamos y en nuestro anuncio
alter table public.homes
  add column if not exists electricity_cents bigint check (electricity_cents is null or electricity_cents >= 0),
  add column if not exists water_cents bigint check (water_cents is null or water_cents >= 0),
  add column if not exists heating_cents bigint check (heating_cents is null or heating_cents >= 0);
alter table public.sale_listing
  add column if not exists electricity_cents bigint check (electricity_cents is null or electricity_cents >= 0),
  add column if not exists water_cents bigint check (water_cents is null or water_cents >= 0),
  add column if not exists heating_cents bigint check (heating_cents is null or heating_cents >= 0);
