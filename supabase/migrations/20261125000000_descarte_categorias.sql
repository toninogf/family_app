-- Motivo del descarte por categorías (además del texto libre), para verlo de un vistazo y que la búsqueda aprenda
alter table public.homes add column if not exists discard_category text check (discard_category is null or discard_category in
  ('precio', 'ubicacion', 'parcela', 'distribucion', 'estado', 'legal', 'vendida', 'otra', 'otro'));
-- Los descartes que ya había con texto pasan a «Otro» (sin perder el texto)
update public.homes set discard_category = 'otro' where status = 'descartado' and discard_category is null and discard_reason is not null;

-- El contexto de la búsqueda automática lleva también la categoría del descarte
create or replace function private.search_context(hh uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'criteria', (select to_jsonb(c) - 'household_id' from public.search_criteria c where c.household_id = hh),
    'homes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'title', h.title, 'url', h.url, 'status', h.status, 'municipality', h.municipality, 'zone', h.zone, 'address', h.address,
      'price_cents', h.price_cents, 'size_m2', h.size_m2, 'plot_m2', h.plot_m2, 'rooms', h.rooms, 'listing_ref', h.listing_ref, 'agency', h.agency,
      'discard_category', h.discard_category, 'discard_reason', h.discard_reason,
      'links', (select coalesce(jsonb_agg(l->>'url'), '[]') from jsonb_array_elements(h.links) l)) order by h.created_at desc)
      from public.homes h where h.household_id = hh), '[]'),
    'rejected', coalesce((select jsonb_agg(jsonb_build_object(
      'title', r.title, 'url', r.url, 'municipality', r.municipality, 'zone', r.zone, 'price_cents', r.price_cents, 'size_m2', r.size_m2,
      'plot_m2', r.plot_m2, 'rooms', r.rooms, 'reason', r.reason, 'date', r.created_at::date) order by r.created_at desc)
      from (select * from public.home_rejections where household_id = hh and reproposed_at is null order by created_at desc limit 150) r), '[]')
  )
$$;
revoke all on function private.search_context(uuid) from public, anon, authenticated;
