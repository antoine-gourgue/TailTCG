-- La valorisation repose uniquement sur la valeur estimée saisie à la main.
-- Le trend Cardmarket reste exposé (market_trend) à titre indicatif : il
-- alimente la courbe de tendance mais n'entre dans aucun total.

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
