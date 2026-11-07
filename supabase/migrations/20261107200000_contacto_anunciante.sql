-- Contacto del anuncio: quién anuncia (agencia o particular), agencia, teléfono, email y referencia
alter table public.homes
  add column if not exists advertiser text check (advertiser is null or advertiser in ('agencia', 'particular')),
  add column if not exists agency text check (agency is null or char_length(agency) <= 120),
  add column if not exists contact_phone text check (contact_phone is null or contact_phone ~ '^[0-9 +().-]{3,30}$'),
  add column if not exists contact_email text check (contact_email is null or (char_length(contact_email) <= 120 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column if not exists listing_ref text check (listing_ref is null or char_length(listing_ref) <= 60);
