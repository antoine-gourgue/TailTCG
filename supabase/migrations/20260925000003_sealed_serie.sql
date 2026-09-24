-- Série des produits scellés : identifiant et logo TCGdex, pour la navigation
-- par série avec son visuel (remplis par scripts/sealed-catalog.mjs).
alter table sealed_products add column serie_id text;
alter table sealed_products add column serie_logo text;
create index on sealed_products (serie_id);
