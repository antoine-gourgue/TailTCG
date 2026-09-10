-- Gradation des cartes du jeu : chaque carte tirée porte un potentiel de
-- gradation caché (4 sous-notes + note globale, 1–10), révélé quand le joueur
-- fait « grader » la carte. Rien à voir avec la pré-gradation photo réelle.
alter table game_cards
  add column grade_centering int,
  add column grade_corners int,
  add column grade_edges int,
  add column grade_surface int,
  add column grade_overall int,
  add column graded boolean not null default false,
  add column graded_at timestamptz;
