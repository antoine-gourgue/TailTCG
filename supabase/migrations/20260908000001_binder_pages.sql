-- Classeurs simulés : des pages de pochettes.
-- `page_grid` est le format des feuilles du classeur (3x3, 4x3, 2x2, 4x4).
-- `binder_items.position` devient le numéro de pochette absolu (0 = première
-- pochette de la page 1) : page = position ÷ pochettes par page. Les trous
-- sont permis, ce sont des pochettes vides.
alter table binders
  add column page_grid text not null default '3x3';

-- Les cartes sans position (ajoutées sans tri manuel) reçoivent une pochette
-- à la suite, dans l'ordre d'ajout ; l'ordre manuel existant est conservé et
-- compacté (un classeur linéaire n'avait pas de trous).
with ranked as (
  select binder_id, item_id,
         row_number() over (
           partition by binder_id
           order by position asc nulls last, added_at asc
         ) - 1 as pocket
  from binder_items
)
update binder_items bi
set position = r.pocket
from ranked r
where bi.binder_id = r.binder_id and bi.item_id = r.item_id;
