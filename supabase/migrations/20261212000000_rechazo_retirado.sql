-- «No nos interesa» con motivo «Anuncio no publicado o dado de baja»
create or replace function public.reject_proposal(p_home uuid, p_reason text default null)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  h public.homes;
  rid uuid;
begin
  if not private.has_mfa() then raise exception 'Hace falta la verificación en dos pasos'; end if;
  select * into h from public.homes where id = p_home and household_id in (select private.current_household_ids());
  if not found then raise exception 'Piso no encontrado'; end if;
  if h.status <> 'propuesta' then raise exception 'Solo se pueden rechazar propuestas'; end if;
  if p_reason is not null and p_reason not in ('precio', 'ubicacion', 'parcela', 'estado', 'no_gusta', 'retirado', 'otro') then raise exception 'Motivo no válido'; end if;
  insert into public.home_rejections (household_id, url, links, listing_ref, municipality, zone, title, price_cents, size_m2, plot_m2, rooms, reason, snapshot, created_by)
  values (h.household_id, h.url, coalesce((select array_agg(l->>'url') from jsonb_array_elements(h.links) l where l->>'url' is not null), '{}'),
    h.listing_ref, h.municipality, h.zone, h.title, h.price_cents, h.size_m2, h.plot_m2, h.rooms, p_reason,
    to_jsonb(h) - 'id' - 'household_id' - 'created_by' - 'created_at' - 'cover_photo_id', private.current_member_id())
  returning id into rid;
  return rid;
end;
$function$;

alter table public.home_rejections drop constraint home_rejections_reason_check;
alter table public.home_rejections add constraint home_rejections_reason_check check (reason is null or reason = any (array['precio','ubicacion','parcela','estado','no_gusta','retirado','otro']));
