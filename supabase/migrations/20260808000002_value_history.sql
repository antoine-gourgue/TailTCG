-- Historique des valeurs estimées saisies (une entrée par jour et par
-- exemplaire, la dernière du jour écrase) + préférences de rappel.

create table item_value_history (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  item_id     uuid not null references items(id) on delete cascade,
  value       numeric(10,2) not null,
  recorded_at date not null default current_date,
  unique (item_id, recorded_at)
);

create index on item_value_history (owner_id);
create index on item_value_history (item_id, recorded_at);

alter table item_value_history enable row level security;

create policy "owner all" on item_value_history
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Préférences utilisateur (rappel de réévaluation en semaines, null = jamais)
create table user_settings (
  owner_id      uuid primary key default auth.uid(),
  revalue_weeks int check (revalue_weeks in (1, 2, 3, 4)),
  updated_at    timestamptz default now()
);

alter table user_settings enable row level security;

create policy "owner all" on user_settings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Reprise : les valeurs estimées déjà saisies entrent dans l'historique
insert into item_value_history (owner_id, item_id, value, recorded_at)
select owner_id, id, manual_price, created_at::date
from items
where manual_price is not null
on conflict (item_id, recorded_at) do nothing;
