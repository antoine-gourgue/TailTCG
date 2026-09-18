-- Miroir du fichier public quotidien de Cardmarket
-- (downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json,
-- régénéré ~02:49 Paris), indexé par idProduct. Rafraîchi par le cron
-- /api/cron/cardmarket-guide. Le prix affiché sur les cartes vient d'ici,
-- l'idProduct étant récupéré côté carte via TCGdex (pricing.cardmarket.idProduct).

create table cardmarket_price_guide (
  id_product   integer primary key,
  id_category  integer,
  avg          double precision,
  low          double precision,
  trend        double precision,
  avg1         double precision,
  avg7         double precision,
  avg30        double precision,
  avg_holo     double precision,
  low_holo     double precision,
  trend_holo   double precision,
  avg1_holo    double precision,
  avg7_holo    double precision,
  avg30_holo   double precision,
  updated_at   timestamptz not null default now()
);

-- Prix publics : lecture pour tout utilisateur connecté ; écriture réservée au
-- service role (le cron), donc aucune policy d'insertion/mise à jour.
alter table cardmarket_price_guide enable row level security;
create policy "cardmarket guide lisible" on cardmarket_price_guide
  for select to authenticated using (true);

-- Métadonnées du dernier téléchargement (une seule ligne) pour le GET
-- conditionnel (ETag / Last-Modified) : un re-téléchargement le même jour coûte
-- un simple 304.
create table cardmarket_price_guide_meta (
  id            integer primary key default 1,
  etag          text,
  last_modified text,
  created_at    text,
  row_count     integer,
  refreshed_at  timestamptz not null default now(),
  constraint cardmarket_meta_single_row check (id = 1)
);
alter table cardmarket_price_guide_meta enable row level security;
-- aucune policy : accessible uniquement au service role (cron)
