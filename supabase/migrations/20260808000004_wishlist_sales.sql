-- Wishlist (cartes recherchées) + suivi des ventes d'exemplaires.

create table wishlist (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  tcgdex_id  text not null,
  card_name  text not null,
  set_name   text not null,
  set_id     text not null,
  local_id   text not null,
  image_url  text not null default '',
  created_at timestamptz default now(),
  unique (owner_id, tcgdex_id)
);

create index on wishlist (owner_id);

alter table wishlist enable row level security;

create policy "owner all" on wishlist
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Vente d'un exemplaire : prix et date (null = toujours en collection)
alter table items add column sold_price numeric(10,2);
alter table items add column sold_at date;

-- La vue fige les colonnes de i.* à sa création : on la recrée pour
-- exposer sold_price / sold_at
drop view collection_value;

create view collection_value
with (security_invoker = true) as
select i.*,
       p.trend as market_trend,
       i.manual_price as current_price,
       (i.manual_price - i.purchase_price) * i.quantity as gain
from items i
left join lateral (
  select trend from price_snapshots
  where tcgdex_id = i.tcgdex_id
  order by captured_at desc limit 1
) p on true;
