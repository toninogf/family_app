-- Metros ideales de casa y parcela (bloque «📐 Espacio» de la nota)
alter table public.search_criteria add column if not exists ideal_m2 integer check (ideal_m2 is null or (ideal_m2 > 0 and ideal_m2 <= 100000));
alter table public.search_criteria add column if not exists ideal_plot_m2 integer check (ideal_plot_m2 is null or (ideal_plot_m2 > 0 and ideal_plot_m2 <= 1000000));
