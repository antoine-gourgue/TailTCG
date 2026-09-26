-- Recherche dans le catalogue TailTCG (FR + JA, TCGdex + Limitless + pokemontcg)
-- par nom, insensible aux accents et à la casse : « evoli » trouve Évoli, et
-- les cartes japonaises répondent à leur nom anglais (name_en).
create extension if not exists unaccent with schema extensions;

create or replace function public.search_catalog(q text, max_rows integer default 120)
returns setof public.catalog_cards
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.*
  from public.catalog_cards c
  where extensions.unaccent(lower(c.name)) like '%' || extensions.unaccent(lower(q)) || '%'
     or (c.name_en is not null
         and extensions.unaccent(lower(c.name_en)) like '%' || extensions.unaccent(lower(q)) || '%')
  order by c.lang, c.set_id desc, c.local_id
  limit max_rows;
$$;
