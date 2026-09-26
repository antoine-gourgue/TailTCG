-- Les tirets comptent comme des espaces : « mew ex » et « mew-ex » trouvent
-- les mêmes cartes (TCGdex écrit « Mew-ex » depuis Écarlate et Violet).
create or replace function public.search_catalog(q text, max_rows integer default 120)
returns setof public.catalog_cards
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with needle as (
    select '%' || replace(extensions.unaccent(lower(q)), '-', ' ') || '%' as pat
  )
  select c.*
  from public.catalog_cards c, needle
  where replace(extensions.unaccent(lower(c.name)), '-', ' ') like needle.pat
     or (c.name_en is not null
         and replace(extensions.unaccent(lower(c.name_en)), '-', ' ') like needle.pat)
  order by c.lang, c.set_id desc, c.local_id
  limit max_rows;
$$;
