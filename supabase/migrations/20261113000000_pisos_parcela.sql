-- Pisos de Buscamos: metros de parcela, metros útiles y año de construcción
alter table public.homes
  add column if not exists plot_m2 numeric(9,2) check (plot_m2 is null or plot_m2 > 0),
  add column if not exists useful_m2 numeric(7,2) check (useful_m2 is null or useful_m2 > 0),
  add column if not exists year_built smallint check (year_built is null or year_built between 1700 and 2100);
