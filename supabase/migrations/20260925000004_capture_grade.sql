-- Relais téléphone pour la pré-gradation : le téléphone prend recto et verso
-- redressés, l'ordinateur les récupère (result = chemins dans card-photos)
alter table capture_sessions drop constraint capture_sessions_kind_check;
alter table capture_sessions add constraint capture_sessions_kind_check check (kind in ('detect', 'photos', 'grade'));
