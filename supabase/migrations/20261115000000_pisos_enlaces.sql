-- Enlaces extra de cada piso (el mismo anuncio en otros portales o en la web de la inmobiliaria), con el precio de cada uno
create or replace function private.links_ok(j jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= 10 and not exists (
    select 1 from jsonb_array_elements(j) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e->>'url', '') !~ '^https://'
       or char_length(e->>'url') > 500
       or char_length(coalesce(e->>'label', '')) > 40
       or (e ? 'price_cents' and jsonb_typeof(e->'price_cents') not in ('number', 'null'))
       or (jsonb_typeof(e->'price_cents') = 'number' and (e->>'price_cents')::numeric < 0)
  )
$$;
alter table public.homes add column if not exists links jsonb not null default '[]' check (private.links_ok(links));
