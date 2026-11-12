-- Visitas en la Agenda: se distinguen por quién se mueve (🚗 vamos a ver una casa · 🏠 vienen a ver la nuestra)
create or replace function private.sync_visit_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_title text; v_location text; v_maps text; v_person uuid; v_origin text; v_id uuid; v_cat uuid;
begin
  if new.status = 'cancelled' then
    if new.event_id is not null then delete from public.events where id = new.event_id; end if;
    new.event_id := null;
    return new;
  end if;

  if tg_table_name = 'buyer_visits' then
    v_title := left('🏠 Vienen a ver la casa' || coalesce(' · ' || nullif(new.contact_name, ''), ''), 80);
    select left(coalesce(l.address, l.zone, l.municipality), 80) into v_location from public.sale_listing l where l.household_id = new.household_id;
    v_maps := null; v_person := new.host_id; v_origin := 'venta';
  else
    select left('🚗 Visita · ' || h.title, 80), left(coalesce(h.address, h.municipality, h.zone), 80), h.maps_url
      into v_title, v_location, v_maps
      from public.homes h where h.id = new.home_id;
    v_person := new.attendee_id; v_origin := 'compra';
  end if;
  select c.id into v_cat from public.event_categories c where c.household_id = new.household_id and c.key = 'mudanza';

  if new.event_id is not null and exists (select 1 from public.events e where e.id = new.event_id) then
    update public.events set title = v_title, location = v_location, maps_url = v_maps, start_time = new.start_time, end_time = new.end_time,
      start_date = new.visit_date, drop_off_id = v_person, pick_up_id = null, origin = v_origin, category_id = coalesce(category_id, v_cat)
    where id = new.event_id;
  else
    insert into public.events (household_id, child_id, title, location, maps_url, start_time, end_time, repeat, weekdays, start_date, drop_off_id, origin, category_id)
    values (new.household_id, null, v_title, v_location, v_maps, new.start_time, new.end_time, 'none', '{}', new.visit_date, v_person, v_origin, v_cat)
    returning id into v_id;
    new.event_id := v_id;
  end if;
  return new;
end;
$$;

-- Los títulos de las visitas que ya estaban en la Agenda
update public.events e set title = left('🚗 Visita · ' || h.title, 80)
  from public.home_visits v join public.homes h on h.id = v.home_id
  where v.event_id = e.id;
update public.events e set title = left('🏠 Vienen a ver la casa' || coalesce(' · ' || nullif(v.contact_name, ''), ''), 80)
  from public.buyer_visits v
  where v.event_id = e.id;
