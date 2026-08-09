-- Visuel redressé (calque carte) de la pré-gradation, stocké dans le
-- bucket card-photos et affiché dans le boîtier
alter table item_gradings add column rectified_path text;
