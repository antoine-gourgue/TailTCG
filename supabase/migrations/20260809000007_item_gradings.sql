-- Pré-gradations : évaluations guidées de l'état d'un exemplaire
create table item_gradings (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  item_id    uuid not null references items(id) on delete cascade,
  centering  int not null check (centering between 1 and 10),
  corners    int not null check (corners between 1 and 10),
  edges      int not null check (edges between 1 and 10),
  surface    int not null check (surface between 1 and 10),
  grade      int not null check (grade between 1 and 10),
  ratios     jsonb,   -- {"lr":[58,42],"tb":[52,48]}
  details    jsonb,   -- réponses brutes (coins, défauts cochés)
  created_at timestamptz default now()
);

create index on item_gradings (owner_id);
create index on item_gradings (item_id);

alter table item_gradings enable row level security;

create policy "owner all" on item_gradings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
