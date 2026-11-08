-- Tipo de calefacción y aire acondicionado / aerotermia, en los pisos de Buscamos y en nuestro anuncio
alter table public.homes
  add column if not exists heating_type text check (heating_type is null or heating_type in ('gas_natural', 'gasoil', 'propano', 'electrica', 'aerotermia', 'biomasa', 'central', 'ninguna')),
  add column if not exists cooling text check (cooling is null or cooling in ('no', 'si', 'splits', 'conductos', 'aerotermia'));
alter table public.sale_listing
  add column if not exists heating_type text check (heating_type is null or heating_type in ('gas_natural', 'gasoil', 'propano', 'electrica', 'aerotermia', 'biomasa', 'central', 'ninguna')),
  add column if not exists cooling text check (cooling is null or cooling in ('no', 'si', 'splits', 'conductos', 'aerotermia'));
