-- Phase 1 — Socle : tables, RLS, vue collection_value
-- Modèle mono-utilisateur : chaque ligne porte un owner_id = auth.uid()

-- Boutiques et sites d'achat
create table sources (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  name       text not null,                     -- "Snoop Bayonne"
  kind       text not null check (kind in ('shop','web')),
  url        text,                              -- si kind = 'web'
  address    text,                              -- si kind = 'shop'
  city       text,
  lat        double precision,                  -- rempli par Nominatim
  lng        double precision,
  notes      text,
  created_at timestamptz default now()
);

-- Une ligne = un exemplaire physique possédé
create table items (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid(),
  tcgdex_id      text not null,                 -- "hgss1-108"
  card_name      text not null,                 -- dénormalisé pour trier hors ligne
  set_name       text not null,
  set_id         text not null,
  local_id       text not null,                 -- "108" ou "HGSS07"
  image_url      text not null,                 -- base sans extension
  card_type      text,                          -- Prime / Promo / Holo / Reverse / Normale
  language       text not null default 'FR',
  condition      text not null                  -- MT NM EX GD LP PL PO
                 check (condition in ('MT','NM','EX','GD','LP','PL','PO')),
  quantity       int not null default 1 check (quantity > 0),
  purchase_price numeric(10,2),                 -- unitaire, en €
  purchase_date  date,
  source_id      uuid references sources(id) on delete set null,
  cardmarket_url text,
  graded         boolean default false,
  grade          text,                          -- "PSA 9"
  notes          text,
  created_at     timestamptz default now()
);

-- Mes propres photos (recto, verso, défauts) — plusieurs par exemplaire
create table item_photos (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  item_id    uuid not null references items(id) on delete cascade,
  path       text not null,                     -- chemin dans le bucket Storage
  label      text,                              -- "recto", "verso", "coin abîmé"
  position   int default 0,
  created_at timestamptz default now()
);

-- Historique de cote, alimenté par le cron (données globales, pas de owner)
create table price_snapshots (
  tcgdex_id   text not null,
  captured_at date not null default current_date,
  trend       numeric(10,2),
  low         numeric(10,2),
  avg30       numeric(10,2),
  primary key (tcgdex_id, captured_at)
);

create index on items (set_id);
create index on items (source_id);
create index on items (owner_id);
create index on sources (owner_id);
create index on item_photos (owner_id);
create index on item_photos (item_id);

-- RLS : seul le propriétaire voit et modifie ses lignes
alter table sources enable row level security;
alter table items enable row level security;
alter table item_photos enable row level security;
alter table price_snapshots enable row level security;

create policy "owner all" on sources
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner all" on items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner all" on item_photos
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Les cotes sont lisibles par tout utilisateur connecté ;
-- l'écriture passe par le cron (service role, qui contourne la RLS)
create policy "read prices" on price_snapshots
  for select to authenticated
  using (true);

-- Vue tableau de bord : security_invoker pour que la RLS des tables s'applique
create view collection_value
with (security_invoker = true) as
select i.*,
       p.trend as current_price,
       (p.trend - i.purchase_price) * i.quantity as gain
from items i
left join lateral (
  select trend from price_snapshots
  where tcgdex_id = i.tcgdex_id
  order by captured_at desc limit 1
) p on true;
