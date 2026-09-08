-- Cartes ajoutées en masse depuis un set : marquées « à compléter » tant que
-- l'utilisateur n'a pas renseigné les infos (état, prix…). Un badge apparaît
-- sur la vignette ; le drapeau retombe à la première édition de l'exemplaire.
alter table items add column needs_review boolean not null default false;

-- La vue expose i.* : on la recrée pour qu'elle inclue la nouvelle colonne.
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
) p on true
where i.deleted_at is null;
