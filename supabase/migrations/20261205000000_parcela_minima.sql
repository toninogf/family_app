-- Parcela mínima en «Qué buscamos» (m²)
alter table public.search_criteria add column if not exists min_plot_m2 integer check (min_plot_m2 is null or (min_plot_m2 >= 0 and min_plot_m2 <= 1000000));
