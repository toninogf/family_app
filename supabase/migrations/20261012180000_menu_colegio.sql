-- Menú del comedor escolar (el mismo para los dos niños). Un día por fila.
-- Los datos los carga Claude cada mes a partir del PDF del colegio; desde la app solo se leen.
create table public.school_menu (
  household_id uuid not null references public.households(id) on delete cascade,
  day date not null,
  holiday boolean not null default false,
  first_course text check (first_course is null or char_length(first_course) <= 200),
  second_course text check (second_course is null or char_length(second_course) <= 200),
  side text check (side is null or char_length(side) <= 200),
  bread text check (bread is null or char_length(bread) <= 40),
  dessert text check (dessert is null or char_length(dessert) <= 80),
  -- Tipos para el recomendador de cenas del colegio
  first_type text check (first_type in ('verdura', 'legumbre', 'pasta_arroz')),
  second_type text check (second_type in ('carne', 'pescado', 'huevo', 'legumbre')),
  dessert_type text check (dessert_type in ('fruta', 'lacteo')),
  kcal numeric(7,1) check (kcal is null or kcal between 0 and 3000),
  protein_g numeric(6,1) check (protein_g is null or protein_g between 0 and 300),
  fat_g numeric(6,1) check (fat_g is null or fat_g between 0 and 300),
  carbs_g numeric(6,1) check (carbs_g is null or carbs_g between 0 and 500),
  note text check (note is null or char_length(note) <= 200),
  source_url text check (source_url is null or source_url ~ '^https://drive\.google\.com/'),
  primary key (household_id, day)
);

alter table public.school_menu enable row level security;
create policy "school_menu_select" on public.school_menu for select to authenticated
  using ((select private.has_mfa()) and household_id in (select private.current_household_ids()));
revoke all on public.school_menu from anon;
revoke insert, update, delete on public.school_menu from authenticated;
