-- Sessions de capture depuis le téléphone (couplage par QR code).
-- Le téléphone accède via le jeton (service role côté serveur), jamais
-- par RLS anonyme.
create table capture_sessions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  token      uuid not null unique default gen_random_uuid(),
  kind       text not null check (kind in ('detect', 'photos')),
  item_id    uuid references items(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  result     jsonb,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);

create index on capture_sessions (owner_id);
create index on capture_sessions (token);

alter table capture_sessions enable row level security;

create policy "owner all" on capture_sessions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
