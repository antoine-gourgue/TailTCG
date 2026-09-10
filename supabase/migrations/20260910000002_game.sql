-- Boosters : un jeu à part, sans aucun lien avec la collection réelle
-- (items/binders). Les joueurs lisent leurs propres lignes ; toutes les
-- écritures passent par les actions serveur (service role) — un tirage ou
-- un échange ne se manipule jamais depuis le navigateur.

create table game_profiles (
  owner_id   uuid primary key,
  boosters   integer not null default 2,        -- stock disponible (plafonné)
  refill_at  timestamptz not null default now(), -- base du compteur de recharge
  opened     integer not null default 0,
  created_at timestamptz default now()
);

create table game_cards (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  tcgdex_id   text not null,
  set_id      text not null,
  set_name    text not null,
  card_name   text not null,
  local_id    text not null,
  image_url   text,
  rarity      text,
  tier        text not null,                     -- common … secret (src/lib/game.ts)
  source      text not null default 'booster',   -- booster | trade
  for_trade   boolean not null default false,
  obtained_at timestamptz not null default now()
);

create index on game_cards (owner_id, set_id);
create index on game_cards (owner_id, tcgdex_id);

-- Journal des ouvertures (audit des tirages)
create table game_openings (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,
  set_id     text not null,
  tcgdex_ids text[] not null,
  opened_at  timestamptz not null default now()
);

create index on game_openings (owner_id);

alter table game_profiles enable row level security;
alter table game_cards enable row level security;
alter table game_openings enable row level security;

create policy "own read" on game_profiles
  for select to authenticated using (owner_id = auth.uid());
create policy "own read" on game_cards
  for select to authenticated using (owner_id = auth.uid());
create policy "own read" on game_openings
  for select to authenticated using (owner_id = auth.uid());
