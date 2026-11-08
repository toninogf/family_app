-- Más equipamiento por piso (piscina comunitaria, parcela, energía, casa, urbanización), geotermia y lista de «Valoramos»
alter table public.homes drop constraint if exists homes_features_check;
alter table public.homes add constraint homes_features_check check (cardinality(features) <= 60);
alter table public.sale_listing drop constraint if exists sale_listing_features_check;
alter table public.sale_listing add constraint sale_listing_features_check check (cardinality(features) <= 60);
alter table public.homes drop constraint if exists homes_heating_type_check;
alter table public.homes add constraint homes_heating_type_check check (heating_type is null or heating_type in ('gas_natural', 'gasoil', 'propano', 'electrica', 'aerotermia', 'geotermia', 'biomasa', 'central', 'ninguna'));
alter table public.sale_listing drop constraint if exists sale_listing_heating_type_check;
alter table public.sale_listing add constraint sale_listing_heating_type_check check (heating_type is null or heating_type in ('gas_natural', 'gasoil', 'propano', 'electrica', 'aerotermia', 'geotermia', 'biomasa', 'central', 'ninguna'));
alter table public.search_criteria add column if not exists nice_to_haves text[] not null default '{}' check (cardinality(nice_to_haves) <= 40);
