-- Nombre minimal de pages d'un classeur (0 = automatique : les pages
-- occupées plus une vide). Permet d'ajouter des feuilles vides à l'avance.
alter table binders
  add column page_count integer not null default 0;
