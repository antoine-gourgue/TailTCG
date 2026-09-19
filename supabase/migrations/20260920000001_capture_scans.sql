-- Cartes scannées depuis le téléphone pendant une session de capture
-- (relais QR) : une ligne par carte reconnue et envoyée, dans l'ordre.
-- Le téléphone insère via le jeton (service role côté serveur) ; le
-- propriétaire les lit, les ajoute à sa collection, les passe ou les retire.
create table capture_scans (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references capture_sessions(id) on delete cascade,
  owner_id    uuid not null,
  tcgdex_id   text not null,
  lang        text not null default 'fr',
  name        text not null,
  set_id      text not null,
  set_name    text not null,
  local_id    text not null,
  image       text not null default '',
  status      text not null default 'pending' check (status in ('pending', 'added', 'skipped')),
  item_id     uuid references items(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index on capture_scans (session_id, created_at);
create index on capture_scans (owner_id);

alter table capture_scans enable row level security;

create policy "owner all" on capture_scans
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
