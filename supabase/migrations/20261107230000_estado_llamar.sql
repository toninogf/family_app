-- Nuevo estado de piso: «Llamar para visita» (entre «Me interesa» y «Visita pedida»)
alter table public.homes drop constraint if exists homes_status_check;
alter table public.homes add constraint homes_status_check check (status in ('interesa', 'llamar', 'visita_pedida', 'visitado', 'favorito', 'descartado', 'oferta'));
