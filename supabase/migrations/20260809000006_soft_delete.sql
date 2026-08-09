-- Corbeille : suppression douce des exemplaires (restaurables 30 jours,
-- purge automatique par le cron quotidien)
alter table items add column deleted_at timestamptz;

-- La vue ne montre que les exemplaires vivants ; la corbeille interroge
-- directement la table items
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
