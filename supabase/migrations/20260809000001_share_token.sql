-- Partage public en lecture seule : un jeton secret par utilisateur
-- (null = partage désactivé), révocable en le regénérant ou l'effaçant.

alter table user_settings add column share_token uuid unique;
