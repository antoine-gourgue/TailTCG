-- Historique de cote des produits scellés : un relevé par produit et par jour
-- (cote € du guide Cardmarket), écrit chaque nuit par scripts/sealed-catalog.mjs.
-- Sert la courbe « Évolution du prix » et les variations 7 j / 30 j.

create table sealed_price_snapshots (
  product_id integer not null references sealed_products(id),
  day        date not null,
  price      numeric(10,2) not null,
  primary key (product_id, day)
);

create index on sealed_price_snapshots (product_id, day desc);

alter table sealed_price_snapshots enable row level security;
create policy "read sealed snapshots" on sealed_price_snapshots
  for select to authenticated using (true);
