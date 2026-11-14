-- «🔬 Análisis a fondo (IA)» de cada casa y dirección del trabajo para calcular trayectos
alter table public.homes add column if not exists deep_analysis jsonb;
alter table public.search_criteria add column if not exists work_address text check (work_address is null or length(work_address) <= 200);
