-- Nouveaux types de source : brocante (géolocalisable comme les boutiques),
-- échange entre collectionneurs, sortie de booster.

alter table sources drop constraint sources_kind_check;
alter table sources add constraint sources_kind_check
  check (kind in ('shop', 'web', 'flea', 'trade', 'pack'));
