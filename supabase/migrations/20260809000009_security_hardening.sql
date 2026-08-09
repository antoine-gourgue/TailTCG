-- Durcissement sécurité (audit) : les tables liées à un item vérifiaient
-- owner_id mais jamais la cohérence de la clé étrangère item_id/binder_id.
-- On exige que les lignes référencées appartiennent aussi à l'appelant.

-- binder_items : le classeur ET l'item doivent être à l'utilisateur
drop policy "owner all" on binder_items;
create policy "owner all" on binder_items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from binders b where b.id = binder_id and b.owner_id = auth.uid())
    and exists (select 1 from items i where i.id = item_id and i.owner_id = auth.uid())
  );

-- item_gradings : l'item évalué doit être à l'utilisateur
drop policy "owner all" on item_gradings;
create policy "owner all" on item_gradings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from items i where i.id = item_id and i.owner_id = auth.uid())
  );

-- item_photos : idem
drop policy "owner all" on item_photos;
create policy "owner all" on item_photos
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from items i where i.id = item_id and i.owner_id = auth.uid())
  );

-- item_value_history : idem
drop policy "owner all" on item_value_history;
create policy "owner all" on item_value_history
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from items i where i.id = item_id and i.owner_id = auth.uid())
  );

-- Option de partage : inclure ou non les valeurs financières dans la vitrine
alter table user_settings add column share_show_values boolean not null default false;
