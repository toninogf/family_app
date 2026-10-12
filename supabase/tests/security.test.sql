-- Pruebas de seguridad: se ejecutan en GitHub Actions contra una base de datos local con todas las migraciones.
-- Cada bloque simula un tipo de visitante y comprueba qué puede ver o hacer. Todo se deshace al final.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Devuelve true si la sentencia falla (se ejecuta con el rol actual)
create function public.test_fails(q text) returns boolean
language plpgsql security invoker as $$
begin
  execute q;
  return false;
exception when others then
  return true;
end;
$$;
grant execute on function public.test_fails(text) to anon, authenticated;

select plan(60);

-- ---------- Preparación ----------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'toninogf@gmail.com', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'riukaab@gmail.com', 'authenticated', 'authenticated');

insert into public.households (id, name) values ('00000000-0000-0000-0000-0000000000b0', 'Otra familia');
insert into public.members (household_id, kind, display_name, color, email)
values ('00000000-0000-0000-0000-0000000000b0', 'adult', 'Intruso', '#000000', 'intruso@example.com');
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-0000000000c1', 'intruso@example.com', 'authenticated', 'authenticated');

select set_config('test.hh', (select household_id::text from public.members where email = 'toninogf@gmail.com'), true);

select ok((select user_id is not null from public.members where email = 'toninogf@gmail.com'), 'Al registrarse, la cuenta se vincula a su miembro');
select ok(public.test_fails($$ insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'desconocido@example.com', 'authenticated', 'authenticated') $$),
  'Un email no invitado no puede crear cuenta');

-- Datos de la familia (como administrador, sin RLS)
insert into public.expenses (household_id, amount_cents, description) values (current_setting('test.hh')::uuid, 1000, 'Gasto familia');
insert into public.tasks (household_id, title) values (current_setting('test.hh')::uuid, 'Tarea familia');
insert into public.school_menu (household_id, day, first_course, second_course) values (current_setting('test.hh')::uuid, '2026-10-13', 'Espaguetis', 'Albóndigas');
insert into public.shopping_items (list_id, name, household_id)
  select id, 'Leche', household_id from public.shopping_lists where household_id = current_setting('test.hh')::uuid limit 1;

insert into public.event_categories (household_id, name) values ('00000000-0000-0000-0000-0000000000b0', 'Ajena');
select set_config('test.cat_ajena', (select id::text from public.event_categories where name = 'Ajena'), true);

-- ---------- Visitante anónimo ----------
set local role anon;
select ok(public.test_fails('select count(*) from public.expenses'), 'Anónimo: no puede leer gastos');
select ok(public.test_fails('select count(*) from public.members'), 'Anónimo: no puede leer miembros');
select ok(public.test_fails('select count(*) from public.shopping_items'), 'Anónimo: no puede leer la compra');
select ok(public.test_fails('select count(*) from public.events'), 'Anónimo: no puede leer actividades');
select ok(public.test_fails('select count(*) from public.calendar_tokens'), 'Anónimo: no puede leer enlaces de calendario');
select ok(public.test_fails('select public.push_config()'), 'Anónimo: no puede leer las claves de avisos');
select ok(public.test_fails('select count(*) from public.school_menu'), 'Anónimo: no puede leer el menú del colegio');
select ok(public.test_fails('select count(*) from public.homes'), 'Anónimo: no puede leer los pisos');
select ok(public.test_fails('select count(*) from public.event_categories'), 'Anónimo: no puede leer las categorías');
select ok(public.test_fails('select count(*) from public.buyer_visits'), 'Anónimo: no puede leer las visitas de compradores');
reset role;

-- ---------- Toni con contraseña pero SIN 2FA (aal1) ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.members), 0::bigint, 'Sin 2FA: no ve miembros');
select is((select count(*) from public.expenses), 0::bigint, 'Sin 2FA: no ve gastos');
select is((select count(*) from public.shopping_items), 0::bigint, 'Sin 2FA: no ve la compra');
select is((select count(*) from public.tasks), 0::bigint, 'Sin 2FA: no ve tareas');
select is((select count(*) from public.money_balances), 0::bigint, 'Sin 2FA: no ve saldos');
select ok(public.test_fails(format('insert into public.expenses (household_id, amount_cents, description) values (%L, 500, %L)', current_setting('test.hh'), 'x')),
  'Sin 2FA: no puede crear gastos');
reset role;

-- ---------- Toni con 2FA (aal2) ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from public.members), 4::bigint, 'Con 2FA: ve los 4 miembros de su familia');
select is((select count(*) from public.members where email = 'intruso@example.com'), 0::bigint, 'Con 2FA: no ve miembros de otro hogar');
select is((select count(*) from public.expenses), 1::bigint, 'Con 2FA: ve los gastos de su familia');
select is((select count(*) from public.shopping_items), 1::bigint, 'Con 2FA: ve la compra de su familia');
select ok(not public.test_fails(format('insert into public.expenses (household_id, amount_cents, description) values (%L, 700, %L)', current_setting('test.hh'), 'Súper')),
  'Con 2FA: puede crear gastos en su hogar');
select is((select created_by from public.expenses where description = 'Súper'),
          (select id from public.members where email = 'toninogf@gmail.com'), 'El gasto queda firmado por quien lo crea');
select ok(public.test_fails($$ insert into public.expenses (household_id, amount_cents, description) values ('00000000-0000-0000-0000-0000000000b0', 700, 'Colado') $$),
  'Con 2FA: no puede crear gastos en otro hogar');
select ok(public.test_fails($$ update public.members set email = 'otro@example.com' where email = 'riukaab@gmail.com' $$),
  'Nadie puede cambiar el email de un miembro desde la app');
select ok(public.test_fails(format('insert into public.members (household_id, kind, display_name, color, email) values (%L, %L, %L, %L, %L)', current_setting('test.hh'), 'adult', 'Nuevo', '#123456', 'nuevo@example.com')),
  'No se pueden añadir adultos desde la app');
select is((select count(*) from public.audit_log where table_name = 'expenses' and member_id = (select id from public.members where email = 'toninogf@gmail.com')), 1::bigint,
  'El alta del gasto queda en la auditoría con su autor');
select ok(public.test_fails('delete from public.audit_log'), 'Nadie puede borrar la auditoría');
select ok(public.test_fails('select public.push_config()'), 'Usuario: no puede leer las claves de avisos');
select ok(not public.test_fails('insert into public.calendar_tokens default values'), 'Toni puede crear su enlace de calendario');
select is((select count(*) from public.school_menu), 1::bigint, 'Con 2FA: ve el menú del colegio');
select ok(public.test_fails($$ update public.school_menu set first_course = 'Otra cosa' $$) or (select first_course from public.school_menu limit 1) = 'Espaguetis',
  'El menú no se puede cambiar desde la app');
-- Categorías y agenda familiar
select is((select count(*) from public.event_categories), 9::bigint, 'Toni ve las 9 categorías de actividades de su familia');
select is((select count(*) from public.task_categories), 10::bigint, 'Toni ve las 10 categorías de tareas');
select ok(not public.test_fails(format('insert into public.events (household_id, child_id, title, start_time, repeat, start_date) values (%L, %L, %L, %L, %L, %L)',
  current_setting('test.hh'), (select id from public.members where email = 'riukaab@gmail.com'), 'Dentista Rebeca', '10:00', 'none', '2026-10-20')),
  'Una actividad puede ser de un adulto');
select ok(public.test_fails(format('insert into public.events (household_id, title, start_time, repeat, start_date, category_id) values (%L, %L, %L, %L, %L, %L)',
  current_setting('test.hh'), 'Colada', '10:00', 'none', '2026-10-20', current_setting('test.cat_ajena'))),
  'No se puede usar una categoría de otro hogar');
select ok(public.test_fails($$ delete from public.event_categories where key = 'mudanza' $$), 'Las categorías de sistema no se pueden borrar');
-- Mudanza
select ok(not public.test_fails($$ insert into public.buyer_visits (visit_date, start_time, contact_name) values ('2026-10-20', '17:30', 'Comprador') $$),
  'Toni puede apuntar una visita de compradores');
select is((select count(*) from public.events where origin = 'venta'), 1::bigint, 'La visita de compradores aparece en la Agenda');
select ok(not public.test_fails($$ update public.buyer_visits set status = 'cancelled' $$), 'Toni puede cancelar la visita');
select is((select count(*) from public.events where origin = 'venta'), 0::bigint, 'Al cancelar la visita desaparece de la Agenda');
select ok(not public.test_fails($$ insert into public.homes (title, price_cents) values ('Piso centro', 30000000) $$), 'Toni puede guardar un piso');
select ok(not public.test_fails($$ insert into public.home_ratings (home_id, member_id, score) select id, gen_random_uuid(), 4 from public.homes $$),
  'Toni puede poner su nota a un piso');
select ok(not public.test_fails(format('insert into public.sale_listing (household_id, price_cents) values (%L, 28500000)', current_setting('test.hh'))),
  'Toni puede poner el precio de venta');
update public.sale_listing set price_cents = 27900000;
select is((select count(*) from public.sale_price_history), 2::bigint, 'Los cambios de precio quedan en el historial');
select ok(public.test_fails(format('insert into public.sale_price_history (household_id, price_cents) values (%L, 1)', current_setting('test.hh'))),
  'Nadie puede escribir el historial de precios a mano');
select ok((select member_id from public.home_ratings limit 1) = (select id from public.members where email = 'toninogf@gmail.com'),
  'La nota queda a nombre de quien la pone, aunque se intente otro');
reset role;

-- ---------- Rebeca con 2FA ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from public.calendar_tokens), 0::bigint, 'Rebeca no ve el enlace privado de Toni');
select is((select count(*) from public.expenses), 2::bigint, 'Rebeca ve los gastos de la familia');
select is((select count(*) from public.homes), 1::bigint, 'Rebeca ve los pisos guardados');
update public.home_ratings set score = 1;
select is((select score from public.home_ratings limit 1), 4::smallint, 'Rebeca no puede cambiar la nota de Toni');
reset role;

-- ---------- Intruso de otro hogar con 2FA ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from public.expenses), 0::bigint, 'Otro hogar: no ve vuestros gastos');
select is((select count(*) from public.members), 1::bigint, 'Otro hogar: solo se ve a sí mismo');
select is((select count(*) from public.shopping_items), 0::bigint, 'Otro hogar: no ve vuestra compra');
select is((select count(*) from public.calendar_tokens), 0::bigint, 'Otro hogar: no ve enlaces de calendario');
select is((select count(*) from public.school_menu), 0::bigint, 'Otro hogar: no ve vuestro menú');
select is((select count(*) from public.homes), 0::bigint, 'Otro hogar: no ve vuestros pisos');
select is((select count(*) from public.sale_listing), 0::bigint, 'Otro hogar: no ve vuestro anuncio');
select is((select count(*) from public.event_categories), 1::bigint, 'Otro hogar: solo ve sus propias categorías');
reset role;

select * from finish();
rollback;
