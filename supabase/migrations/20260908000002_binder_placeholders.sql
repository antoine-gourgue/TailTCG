-- Cartes « hors collection » rangées dans un classeur : une carte du
-- catalogue TCGdex qu'on ne possède pas encore occupe une pochette (pour
-- prévoir sa place). Elle n'entre pas dans la collection ni dans les totaux.
create table binder_placeholders (
  id         uuid primary key default gen_random_uuid(),
  binder_id  uuid not null references binders(id) on delete cascade,
  owner_id   uuid not null default auth.uid(),
  tcgdex_id  text not null,
  card_name  text not null,
  set_name   text not null,
  local_id   text not null,
  image_url  text,
  position   integer not null,
  created_at timestamptz default now()
);

create index on binder_placeholders (binder_id);
create index on binder_placeholders (owner_id);

alter table binder_placeholders enable row level security;

create policy "owner all" on binder_placeholders
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
