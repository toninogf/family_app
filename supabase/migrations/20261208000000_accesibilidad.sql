-- «♿ Accesibilidad» en «Qué buscamos»: lo que importa, puntúa en su propio bloque de la nota
alter table public.search_criteria add column if not exists access_items text[] not null default '{}' check (cardinality(access_items) <= 20);
