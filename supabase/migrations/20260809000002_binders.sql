-- Classeurs : sous-collections thématiques (toutes mes Pikachu, mes primes…)
-- Une carte peut vivre dans plusieurs classeurs à la fois

create table binders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  name       text not null,
  created_at timestamptz default now()
);

create table binder_items (
  binder_id uuid not null references binders(id) on delete cascade,
  item_id   uuid not null references items(id) on delete cascade,
  owner_id  uuid not null default auth.uid(),
  added_at  timestamptz default now(),
  primary key (binder_id, item_id)
);

create index on binders (owner_id);
create index on binder_items (owner_id);
create index on binder_items (item_id);

alter table binders enable row level security;
alter table binder_items enable row level security;

create policy "owner all" on binders
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner all" on binder_items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
