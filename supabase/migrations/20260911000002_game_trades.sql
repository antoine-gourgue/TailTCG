-- Échanges de cartes du jeu, une carte contre une carte de même rareté.
-- Le proposant (from) offre une de ses cartes contre une carte « à échanger »
-- d'un autre joueur (to). L'acceptation échange les propriétaires de façon
-- atomique.
create table game_trades (
  id           uuid primary key default gen_random_uuid(),
  from_owner   uuid not null,
  to_owner     uuid not null,
  from_card_id uuid not null references game_cards(id) on delete cascade,
  to_card_id   uuid not null references game_cards(id) on delete cascade,
  tier         text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index on game_trades (to_owner, status);
create index on game_trades (from_owner, status);

alter table game_trades enable row level security;

-- Les deux parties peuvent lire leurs échanges (l'enrichissement carte/pseudo
-- se fait côté serveur avec le service role)
create policy "parties read" on game_trades
  for select to authenticated
  using (from_owner = auth.uid() or to_owner = auth.uid());

-- Échange atomique : vérifie l'état, échange les propriétaires, invalide les
-- autres propositions en attente touchant l'une des deux cartes.
create or replace function accept_game_trade(p_trade uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t  game_trades;
  fc game_cards;
  tc game_cards;
begin
  select * into t from game_trades where id = p_trade for update;
  if not found then return 'introuvable'; end if;
  if t.status <> 'pending' then return 'traité'; end if;
  if t.to_owner <> p_user then return 'refusé'; end if;

  select * into fc from game_cards where id = t.from_card_id for update;
  select * into tc from game_cards where id = t.to_card_id for update;
  if fc.id is null or tc.id is null
     or fc.owner_id <> t.from_owner or tc.owner_id <> t.to_owner then
    update game_trades set status = 'cancelled', resolved_at = now() where id = p_trade;
    return 'indisponible';
  end if;

  update game_cards set owner_id = t.to_owner, for_trade = false where id = t.from_card_id;
  update game_cards set owner_id = t.from_owner, for_trade = false where id = t.to_card_id;
  update game_trades set status = 'accepted', resolved_at = now() where id = p_trade;

  update game_trades set status = 'cancelled', resolved_at = now()
   where status = 'pending' and id <> p_trade
     and (from_card_id in (t.from_card_id, t.to_card_id)
          or to_card_id in (t.from_card_id, t.to_card_id));

  return 'ok';
end;
$$;

revoke all on function accept_game_trade(uuid, uuid) from public, anon, authenticated;
