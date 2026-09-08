-- Options de design d'un classeur (feuilles, anneaux, pochettes, texture de
-- couverture, numéros de page…) : un objet libre, validé et complété par des
-- valeurs par défaut côté application (src/lib/binder-design.ts).
alter table binders
  add column design jsonb not null default '{}'::jsonb;
