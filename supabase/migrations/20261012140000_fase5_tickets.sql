-- Fase 5: fotos de tickets en un bucket privado
alter table public.expenses add column receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Ruta: <household_id>/<archivo>. Solo el propio hogar y con 2FA.
create policy "receipts_select" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));
create policy "receipts_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));
create policy "receipts_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (select private.has_mfa())
         and ((storage.foldername(name))[1])::uuid in (select private.current_household_ids()));
