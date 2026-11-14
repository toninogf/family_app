-- Pesos ajustables de la nota 0–10 de cada casa (Buscamos → «Qué buscamos»)
alter table public.search_criteria add column if not exists score_weights jsonb;
