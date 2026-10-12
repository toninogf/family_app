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

select plan(37);

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

-- ---------- Visitante anónimo ----------
set local role anon;
select ok(public.test_fails('select count(*) from public.expenses'), 'Anónimo: no puede leer gastos');
select ok(public.test_fails('select count(*) from public.members'), 'Anónimo: no puede leer miembros');
select ok(public.test_fails('select count(*) from public.shopping_items'), 'Anónimo: no puede leer la compra');
select ok(public.test_fails('select count(*) from public.events'), 'Anónimo: no puede leer actividades');
select ok(public.test_fails('select count(*) from public.calendar_tokens'), 'Anónimo: no puede leer enlaces de calendario');
select ok(public.test_fails('select public.push_config()'), 'Anónimo: no puede leer las claves de avisos');
select ok(public.test_fails('select count(*) from public.school_menu'), 'Anónimo: no puede leer el menú del colegio');
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
reset role;

-- ---------- Rebeca con 2FA ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from public.calendar_tokens), 0::bigint, 'Rebeca no ve el enlace privado de Toni');
select is((select count(*) from public.expenses), 2::bigint, 'Rebeca ve los gastos de la familia');
reset role;

-- ---------- Intruso de otro hogar con 2FA ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from public.expenses), 0::bigint, 'Otro hogar: no ve vuestros gastos');
select is((select count(*) from public.members), 1::bigint, 'Otro hogar: solo se ve a sí mismo');
select is((select count(*) from public.shopping_items), 0::bigint, 'Otro hogar: no ve vuestra compra');
select is((select count(*) from public.calendar_tokens), 0::bigint, 'Otro hogar: no ve enlaces de calendario');
select is((select count(*) from public.school_menu), 0::bigint, 'Otro hogar: no ve vuestro menú');
reset role;

select * from finish();
rollback;
