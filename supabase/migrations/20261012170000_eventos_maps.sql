-- Enlace opcional de Google Maps en las actividades de los niños.
-- Solo se aceptan enlaces https de dominios de Google Maps (evita javascript: u otros dominios).
alter table public.events add column if not exists maps_url text;
alter table public.events add constraint events_maps_url_google check (
  maps_url is null or (
    length(maps_url) <= 500 and
    maps_url ~ '^https://(maps\.app\.goo\.gl/|goo\.gl/maps/|maps\.google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})/|(www\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})/maps)'
  )
);
