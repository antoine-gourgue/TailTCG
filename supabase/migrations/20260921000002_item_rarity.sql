-- Rareté intrinsèque de la carte (Commune, Rare, Double rare, Ultra Rare…),
-- posée automatiquement d'après TCGdex à l'ajout (pas un choix utilisateur,
-- contrairement au « type »/finish card_type). Permet de filtrer la collection
-- par rareté.
alter table items add column rarity text;
create index on items (owner_id, rarity);
