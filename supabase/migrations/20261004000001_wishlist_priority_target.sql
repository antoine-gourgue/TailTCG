-- Recherchées : priorité (haute / normale / basse) et prix cible par carte
alter table wishlist add column priority text not null default 'normal'
  check (priority in ('high', 'normal', 'low'));
alter table wishlist add column target_price numeric(10,2);
