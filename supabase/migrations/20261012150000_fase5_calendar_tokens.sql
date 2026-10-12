-- Fase 5: enlaces privados de suscripción de calendario (uno por persona, revocables)
create table public.calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);
create index calendar_tokens_household_idx on public.calendar_tokens(household_id);
create index calendar_tokens_member_idx on public.calendar_tokens(member_id);

create or replace function private.calendar_token_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.member_id := private.current_member_id();
  select m.household_id into new.household_id from public.members m where m.id = new.member_id;
  new.token := encode(extensions.gen_random_bytes(24), 'hex');
  return new;
end;
$$;
revoke all on function private.calendar_token_defaults() from public, anon, authenticated;
create trigger calendar_tokens_defaults before insert on public.calendar_tokens
  for each row execute function private.calendar_token_defaults();

alter table public.calendar_tokens enable row level security;
create policy "calendar_tokens_own" on public.calendar_tokens for all to authenticated
  using ((select private.has_mfa()) and member_id = (select private.current_member_id()))
  with check ((select private.has_mfa()) and member_id = (select private.current_member_id()));
revoke all on public.calendar_tokens from anon;
revoke update on public.calendar_tokens from authenticated;
