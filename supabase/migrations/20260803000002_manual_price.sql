-- Cote saisie à la main par exemplaire : prioritaire sur le trend Cardmarket
-- quand elle est renseignée (le trend agrège tous états, souvent trompeur
-- pour une carte gradée ou en état exceptionnel).

alter table items add column manual_price numeric(10,2);

drop view collection_value;

create view collection_value
with (security_invoker = true) as
select i.*,
       coalesce(i.manual_price, p.trend) as current_price,
       (coalesce(i.manual_price, p.trend) - i.purchase_price) * i.quantity as gain
from items i
left join lateral (
  select trend from price_snapshots
  where tcgdex_id = i.tcgdex_id
  order by captured_at desc limit 1
) p on true;
