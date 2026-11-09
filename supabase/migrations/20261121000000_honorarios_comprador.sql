-- Honorarios de la inmobiliaria a cargo del comprador (en cada piso de Buscamos)
alter table public.homes add column if not exists buyer_fee_kind text check (buyer_fee_kind is null or buyer_fee_kind in ('no', 'pct', 'fijo'));
alter table public.homes add column if not exists buyer_fee_pct numeric(4,2) check (buyer_fee_pct is null or buyer_fee_pct between 0 and 10);
alter table public.homes add column if not exists buyer_fee_cents bigint check (buyer_fee_cents is null or buyer_fee_cents between 0 and 10000000000);
alter table public.homes add column if not exists buyer_fee_vat boolean not null default true;
alter table public.homes add column if not exists buyer_fee_note text check (buyer_fee_note is null or char_length(buyer_fee_note) <= 300);
