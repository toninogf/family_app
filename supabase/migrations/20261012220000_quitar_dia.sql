-- «Quitar este día»: la sesión desaparece de la agenda (no sale tachada). Siempre cuenta como cancelada.
alter table public.event_exceptions add column hidden boolean not null default false;
alter table public.event_exceptions add constraint event_exceptions_hidden_is_cancelled check (not hidden or cancelled);
