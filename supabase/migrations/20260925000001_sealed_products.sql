-- Produits scellés (boosters, displays, ETB, coffrets, tins…) : un catalogue
-- public synchronisé chaque nuit (scripts/sealed-catalog.mjs : TCGplayer via
-- TCGCSV pour les produits et visuels, TCGdex pour l'extension FR, Cardmarket
-- pour l'idProduct et donc la cote €), et la collection de chaque utilisateur.

create table sealed_products (
  id            integer primary key,               -- productId TCGplayer
  name          text not null,                     -- nom du produit (EN, TCGplayer)
  kind          text not null default 'autre',     -- etb, display, booster, tin, blister, box_set, theme_deck, trainer_kit, autre
  group_id      integer not null,                  -- groupId TCGplayer (extension)
  set_name      text not null,                     -- nom d'extension (EN, nettoyé)
  set_id        text,                              -- id d'extension TCGdex, si appariée
  set_name_fr   text,                              -- nom d'extension FR (TCGdex)
  serie         text,                              -- série (FR)
  set_logo      text,                              -- logo d'extension (TCGdex)
  released_on   date,
  image         text not null default '',          -- visuel officiel (TCGplayer)
  cardmarket_id integer,                           -- idProduct Cardmarket → cote € (guide local)
  price_usd     numeric(10,2),                     -- prix marché TCGplayer (repli quand pas de cote €)
  updated_at    timestamptz default now()
);

create index on sealed_products (group_id);
create index on sealed_products (set_id);
create index on sealed_products (kind);
create index on sealed_products (released_on desc);

alter table sealed_products enable row level security;
create policy "read sealed products" on sealed_products
  for select to authenticated using (true);

-- Exemplaires possédés : une ligne par lot (quantité + prix d'achat)
create table sealed_items (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid(),
  product_id     integer not null references sealed_products(id),
  quantity       integer not null default 1 check (quantity > 0),
  purchase_price numeric(10,2),
  purchase_date  date,
  manual_price   numeric(10,2),                    -- prix estimé saisi à la main (prime sur la cote)
  notes          text,
  created_at     timestamptz default now()
);

create index on sealed_items (owner_id);
create index on sealed_items (product_id);

alter table sealed_items enable row level security;
create policy "owner all" on sealed_items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
