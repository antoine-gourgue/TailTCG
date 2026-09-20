-- Cartes que pokemontcg.io connaît et que TCGdex n'a pas (ex. Mew R/G/B des
-- 30 ans) : nouvelle origine « pokemontcg » dans le catalogue en base.
alter table catalog_cards drop constraint if exists catalog_cards_source_check;
alter table catalog_cards add constraint catalog_cards_source_check
  check (source in ('tcgdex', 'limitless', 'pokemontcg'));
