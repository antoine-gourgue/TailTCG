-- Catalogue de cartes en base (FR et JA) : sets et cartes avec identifiant,
-- numéro et visuel, alimenté par scripts/catalog-sync.mjs depuis TCGdex
-- (complété par l'anglais pour le FR) et Limitless pour les sets japonais
-- absents ou vides chez TCGdex. Lecture pour tout compte connecté,
-- écriture par le script (service role).
create table catalog_sets (
  lang                text not null,
  id                  text not null,
  name                text not null,
  serie_id            text not null default '',
  serie_name          text not null default '',
  serie_logo          text,
  logo                text,
  symbol              text,
  release_date        date,
  card_count_total    integer,
  card_count_official integer,
  source              text not null default 'tcgdex' check (source in ('tcgdex', 'limitless')),
  updated_at          timestamptz not null default now(),
  primary key (lang, id)
);

create table catalog_cards (
  lang       text not null,
  id         text not null,
  set_id     text not null,
  local_id   text not null,
  name       text not null,
  name_en    text,
  image      text,
  rarity     text,
  source     text not null default 'tcgdex' check (source in ('tcgdex', 'limitless')),
  -- catalogue d'origine quand ce n'est pas `lang` (cartes anglaises d'un set FR incomplet)
  card_lang  text,
  updated_at timestamptz not null default now(),
  primary key (lang, id)
);

create index on catalog_cards (lang, set_id);

alter table catalog_sets enable row level security;
alter table catalog_cards enable row level security;

create policy "read catalog sets" on catalog_sets for select to authenticated using (true);
create policy "read catalog cards" on catalog_cards for select to authenticated using (true);
