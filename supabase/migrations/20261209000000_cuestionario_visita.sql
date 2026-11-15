-- «📋 Cuestionario de la visita»: respuestas y preguntas por casa, y preguntas para todas las casas
alter table public.homes add column if not exists visit_qa jsonb;
alter table public.search_criteria add column if not exists visit_questions jsonb;
