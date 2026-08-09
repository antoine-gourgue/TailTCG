-- Visuel verso redressé (pour le rapport et les annotations de défauts).
-- Les annotations elles-mêmes vivent dans item_gradings.details (jsonb).
alter table item_gradings add column rectified_verso_path text;
