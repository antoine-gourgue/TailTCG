-- Pseudo public (obligatoire à la connexion) + ordre manuel des
-- classeurs et des cartes dans un classeur
alter table user_settings add column display_name text;
alter table binders add column position int;
alter table binder_items add column position int;
