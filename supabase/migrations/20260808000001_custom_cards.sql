-- Cartes hors catalogue TCGdex (promos japonaises…) créées par les
-- utilisateurs : une fiche de carte, distincte des exemplaires possédés.
-- Les items y font référence via tcgdex_id = 'custom:<id>'.

create table custom_cards (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  name       text not null,
  set_name   text not null,
  local_id   text not null,
  image_path text not null,                      -- photo de la carte (bucket card-photos)
  created_at timestamptz default now()
);

create index on custom_cards (owner_id);

alter table custom_cards enable row level security;

create policy "owner all" on custom_cards
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
