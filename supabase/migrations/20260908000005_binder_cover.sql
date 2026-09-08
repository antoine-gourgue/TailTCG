-- Couverture sur mesure d'un classeur : fond (couleur, image importée ou
-- carte) et neuf zones (textes, logos d'extension, images, cartes).
-- Objet libre, validé et complété côté application (src/lib/binder-cover.ts).
alter table binders
  add column cover jsonb not null default '{}'::jsonb;
