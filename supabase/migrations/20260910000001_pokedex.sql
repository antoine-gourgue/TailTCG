-- Pokédex national (source PokéAPI) : référentiel partagé par tous les
-- comptes, rempli une fois par `node scripts/pokedex-sync.mts` (à relancer à
-- chaque nouvelle génération). Les artworks sont copiés dans le bucket public
-- « pokedex » (art/<id>.webp), créé par le même script.
create table pokedex (
  id          integer primary key,            -- numéro national
  name_fr     text not null,
  name_en     text,
  types       text[] not null default '{}',   -- ex. {grass,poison}, ordre des slots
  generation  integer not null,
  updated_at  timestamptz default now()
);

create index on pokedex (generation);

alter table pokedex enable row level security;

-- Lecture libre (vitrine publique comprise) ; écriture réservée au service role
create policy "pokedex public read" on pokedex
  for select to anon, authenticated
  using (true);
