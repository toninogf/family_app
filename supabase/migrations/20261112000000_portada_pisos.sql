-- Foto de portada de cada piso de Buscamos (si no se elige, la app usa la primera foto)
alter table public.homes add column if not exists cover_photo_id uuid references public.home_photos(id) on delete set null;
