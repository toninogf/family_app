-- Calefacción por bomba de calor aire-aire (splits o conductos), distinta de la aerotermia (aire-agua)
alter table public.homes drop constraint homes_heating_type_check;
alter table public.homes add constraint homes_heating_type_check check (heating_type is null or heating_type = any (array['gas_natural','gasoil','propano','electrica','aerotermia','geotermia','bomba_calor','biomasa','central','ninguna']));
alter table public.sale_listing drop constraint sale_listing_heating_type_check;
alter table public.sale_listing add constraint sale_listing_heating_type_check check (heating_type is null or heating_type = any (array['gas_natural','gasoil','propano','electrica','aerotermia','geotermia','bomba_calor','biomasa','central','ninguna']));
alter table public.sale_competitors drop constraint sale_competitors_heating_type_check;
alter table public.sale_competitors add constraint sale_competitors_heating_type_check check (heating_type is null or heating_type = any (array['gas_natural','gasoil','propano','electrica','aerotermia','geotermia','bomba_calor','biomasa','central','ninguna']));
