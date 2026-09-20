-- La vue fige ses colonnes à la création : on la recrée pour exposer la
-- nouvelle colonne items.rarity (i.* la reprend alors).
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
