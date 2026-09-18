-- Cote Cardmarket résolue (prix de référence en euros) par carte possédée,
-- alimentée par le cron /api/cron/prices : idProduct corrigé → guide public →
-- repli TCGdex. Sert le total « Valeur Cardmarket » de la collection.
alter table price_snapshots add column reference double precision;
