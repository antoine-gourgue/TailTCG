-- Personnalisation du classeur : couleur de tranche + cartes de couverture
alter table binders add column color text;
alter table binders add column cover_item_ids uuid[];
