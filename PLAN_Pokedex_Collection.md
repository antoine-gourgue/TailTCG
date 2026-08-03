# Plan de build — « Pokédex Collection »

Document de spécification. Chaque phase est autonome et se termine par un état testable.

---

## 0. Le produit en une phrase

Un site perso où j'ajoute une carte Pokémon en la cherchant par son nom, où l'image officielle et le set se remplissent tout seuls, où je complète l'état / le prix payé / le lieu d'achat, et où je vois en permanence ce que ma collection vaut aujourd'hui.

**Utilisateur unique** (moi). Pas de multi-tenant, pas d'inscription publique, pas de partage social en v1.

---

## 1. Stack imposé

| Rôle | Choix | Pourquoi |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Déploiement Vercel natif |
| Hébergement | Vercel, plan Hobby | Gratuit, usage strictement perso |
| Base + Auth + Fichiers | Supabase (Postgres, Storage, Auth) | Une seule dépendance backend |
| Style | Tailwind CSS | |
| Données cartes + prix | API TCGdex (`api.tcgdex.net/v2/fr`) | Multilingue **français**, gratuit, sans clé API |
| Carte géo | Leaflet + tuiles OpenStreetMap | Gratuit, pas de facturation à la vue comme Google Maps |
| Géocodage | Nominatim (OSM) | Gratuit, 1 requête/seconde max, User-Agent obligatoire |

**Interdits** : pas de Google Maps API (facturation à la vue), pas de pokemontcg.io (l'équipe est passée à Scrydex, produit commercial), pas de scraping de Cardmarket (leurs CGU l'interdisent — les prix viennent de TCGdex).

---

## 2. L'API TCGdex — le cœur du projet

Aucune clé API. Base : `https://api.tcgdex.net/v2/fr`.

### Recherche par nom
```
GET /cards?name=like:aligatueur
```
Retourne un tableau de `CardBrief` : `{ id, localId, name, image }`.
`image` est une **URL sans extension** — il faut y coller la qualité et le format :
```
https://assets.tcgdex.net/fr/hgss/hgss1/108/high.png
https://assets.tcgdex.net/fr/hgss/hgss1/108/low.webp
```
Utiliser `low.webp` dans les listes et la recherche, `high.png` sur la fiche détail uniquement.
**Attention** : une carte sans image renvoie `image: undefined` — prévoir un placeholder.

### Fiche complète (avec les prix)
```
GET /cards/{id}          ex. /cards/hgss1-108
```
Le champ `pricing.cardmarket` est inclus directement dans la réponse, en **EUR**, mis à jour quotidiennement. Champs utiles : `trend` (prix tendance, c'est celui à afficher), `low`, `avg7`, `avg30`, et les variantes `trend-holo` / `avg-holo` pour les cartes holo. Si la carte n'est pas listée, la clé du marchand est absente — coder défensivement.

C'est ce qui remplace la colonne « cote CM » saisie à la main dans le tableur.

### Sets et séries
```
GET /sets        GET /sets/{id}       GET /series
```
Le set porte `cardCount.official` — utile pour l'écran « progression par set ».

### Règle de cache
Le catalogue est quasi immuable, les prix bougent une fois par jour. Ne jamais appeler TCGdex depuis le navigateur en boucle :
- recherche → route API Next.js avec `revalidate: 86400`
- prix → cron Vercel quotidien qui écrit dans la table `price_snapshots` (voir §3)

---

## 3. Schéma de base

```sql
-- Boutiques et sites d'achat
create table sources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                     -- "Snoop Bayonne"
  kind         text not null check (kind in ('shop','web')),
  url          text,                              -- si kind = 'web'
  address      text,                              -- si kind = 'shop'
  city         text,
  lat          double precision,                  -- rempli par Nominatim
  lng          double precision,
  notes        text,
  created_at   timestamptz default now()
);

-- Une ligne = un exemplaire physique possédé
create table items (
  id             uuid primary key default gen_random_uuid(),
  tcgdex_id      text not null,                   -- "hgss1-108"
  card_name      text not null,                   -- dénormalisé pour trier hors ligne
  set_name       text not null,
  set_id         text not null,
  local_id       text not null,                   -- "108" ou "HGSS07"
  image_url      text not null,                   -- base sans extension
  card_type      text,                            -- Prime / Promo / Holo / Reverse / Normale
  language       text not null default 'FR',
  condition      text not null                    -- MT NM EX GD LP PL PO
                 check (condition in ('MT','NM','EX','GD','LP','PL','PO')),
  quantity       int not null default 1 check (quantity > 0),
  purchase_price numeric(10,2),                   -- unitaire, en €
  purchase_date  date,
  source_id      uuid references sources(id) on delete set null,
  cardmarket_url text,
  graded         boolean default false,
  grade          text,                            -- "PSA 9"
  notes          text,
  created_at     timestamptz default now()
);

-- Mes propres photos (recto, verso, défauts) — plusieurs par exemplaire
create table item_photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  path       text not null,                       -- chemin dans le bucket Storage
  label      text,                                -- "recto", "verso", "coin abîmé"
  position   int default 0,
  created_at timestamptz default now()
);

-- Historique de cote, alimenté par le cron
create table price_snapshots (
  tcgdex_id  text not null,
  captured_at date not null default current_date,
  trend      numeric(10,2),
  low        numeric(10,2),
  avg30      numeric(10,2),
  primary key (tcgdex_id, captured_at)
);

create index on items (set_id);
create index on items (source_id);
```

Vue pratique pour le tableau de bord :
```sql
create view collection_value as
select i.*,
       p.trend as current_price,
       (p.trend - i.purchase_price) * i.quantity as gain
from items i
left join lateral (
  select trend from price_snapshots
  where tcgdex_id = i.tcgdex_id
  order by captured_at desc limit 1
) p on true;
```

### RLS — à faire dès la première migration, pas après
Auth Supabase par magic link, un seul compte autorisé. Sur `items`, `sources`, `item_photos` : `enable row level security`, puis une colonne `owner_id uuid default auth.uid()` avec policy `owner_id = auth.uid()`. Le bucket Storage `card-photos` doit être **privé**, accès par URL signée.

---

## 4. Les écrans

### A. Collection (accueil)
Grille de cartes en visuel, image officielle en `low.webp`, ratio 63×88 respecté. Sur chaque vignette : nom, set, badge d'état, prix payé et cote actuelle avec la variation en couleur. Bascule grille ⇄ tableau dense.
Filtres : set, série, état, type, langue, source, gradée ou non. Tri : nom, prix payé, cote, plus-value, date d'achat.
Barre de résumé collée en haut : nombre de cartes, total investi, valeur actuelle, plus/moins-value.

### B. Ajouter une carte (le flux central, à soigner)
1. Champ de recherche → appel debouncé (300 ms) sur `/cards?name=like:{q}`
2. Résultats en grille visuelle, image + nom + set. On clique sur la bonne carte.
3. La fiche se pré-remplit : nom, set, numéro, image, lien Cardmarket, cote du jour.
4. Il reste à saisir : état (boutons segmentés, pas un `<select>`), quantité, prix payé, date, source, photos perso, notes.
5. Enregistrer.

**Le sélecteur d'état affiche l'abréviation ET sa signification** (MT — parfaite, NM — quasi parfaite, EX — défauts très légers, GD — défauts visibles, LP — usée, PL — très usée, PO — abîmée).

**Le champ source** : deux onglets. « En boutique » → liste des boutiques enregistrées + bouton « nouvelle boutique » (nom + adresse, géocodée à l'enregistrement). « Sur le web » → liste des sites + champ URL.

### C. Fiche carte
Image officielle en `high.png` à gauche, données à droite. Galerie de mes photos perso en dessous, avec lightbox. Graphe d'évolution de la cote depuis `price_snapshots`. Lien Cardmarket. Boutons modifier / supprimer.

### D. Carte des boutiques
Leaflet centré sur la France, un marqueur par boutique de type `shop`. Popup : nom, adresse, nombre de cartes achetées là, total dépensé, lien vers la collection filtrée sur cette source. Les achats web ne sont pas sur la carte — ils ont leur propre liste à côté.

### E. Statistiques
Total investi vs valeur actuelle, répartition par set (barres), par état (donut), par source, top 5 des meilleures et pires plus-values, progression par set (`x / cardCount.official`).

---

## 5. Photos personnelles

Bucket privé `card-photos`, chemin `{user_id}/{item_id}/{uuid}.webp`.
**Compresser côté navigateur avant l'upload** (`browser-image-compression`, cible 1600 px de large, qualité 0,8, sortie WebP) : le plan gratuit Supabase plafonne à 1 Go de stockage, et une photo brute d'iPhone fait 3 à 5 Mo. Compressée, elle en fait 200 à 400 Ko, ce qui laisse largement 2 000 photos.
Affichage via URL signée à 1 h, générée côté serveur.

---

## 6. Le cron des prix

Route `app/api/cron/prices/route.ts`, déclarée dans `vercel.json` en `0 6 * * *`.
Elle lit les `tcgdex_id` distincts de `items`, appelle TCGdex carte par carte avec 200 ms d'écart, et insère dans `price_snapshots` (`on conflict do update`).
**Bonus décisif** : ce cron sert aussi de ping quotidien à Supabase, ce qui empêche la mise en pause du projet gratuit après 7 jours d'inactivité.
Protéger la route par `CRON_SECRET` dans l'en-tête, sinon n'importe qui peut la déclencher.

---

## 7. Direction visuelle

Le sujet, ce sont des cartes des années 2000 à 2011, dans des classeurs, sous sleeves. La référence n'est pas « dashboard SaaS » mais **classeur de collectionneur** : la grille respire, les cartes ont une vraie ombre portée et une légère inclinaison au survol, le fond est sombre et neutre pour que les illustrations ressortent (une carte Pokémon est déjà très colorée — l'interface doit se taire).

À éviter absolument : fond crème + serif contrasté + accent terracotta, et le fond noir avec un seul accent vert acide. Ce sont les deux réflexes par défaut, ils n'ont rien à voir avec le sujet.

Un élément signature, un seul : le survol d'une carte reproduit le reflet holographique qui balaie la surface quand on incline une carte holo sous la lumière (gradient conique animé, masqué sur la zone holo, désactivé si `prefers-reduced-motion`). Tout le reste reste sobre.

Typo : une display à caractère pour les titres et chiffres clés, une body neutre et lisible, une mono pour les numéros de carte et les montants (les chiffres doivent s'aligner en colonne → chiffres tabulaires).

---

## 8. Phases de livraison

**Phase 1 — Socle.** Next.js + Tailwind + Supabase branché, auth magic link, migrations SQL des 4 tables, RLS active, une page protégée qui affiche « connecté ». Déployé sur Vercel.
*Fini quand* : je me connecte par email en prod et je vois la page protégée ; un visiteur non connecté est redirigé.

**Phase 2 — Recherche TCGdex.** Route API de recherche avec cache, page de recherche avec grille de résultats visuels. Aucune écriture en base.
*Fini quand* : je tape « aligatueur » et je vois les images correctes en français.

**Phase 3 — Ajout et collection.** Formulaire complet, écriture en base, grille de collection avec filtres et tri, barre de résumé.
*Fini quand* : j'ajoute une carte et elle apparaît dans la grille avec les bons totaux.

**Phase 4 — Photos.** Bucket, upload compressé, galerie, lightbox, suppression.
*Fini quand* : j'ajoute 3 photos à une carte depuis mon téléphone et elles s'affichent.

**Phase 5 — Sources et carte.** CRUD boutiques, géocodage Nominatim, carte Leaflet avec popups enrichis.
*Fini quand* : Snoop Bayonne apparaît au bon endroit avec son total d'achats.

**Phase 6 — Prix et stats.** Cron, `price_snapshots`, colonnes cote/plus-value, page statistiques, graphe d'historique.
*Fini quand* : le cron tourne une fois et les cotes s'affichent partout.

**Phase 7 — Import et export.** Import du fichier `Pokemon_Prime_FR_v2.xlsx` (résolution des `tcgdex_id` par recherche sur nom + numéro, avec validation manuelle des correspondances douteuses). Export CSV et export JSON complet.
*Fini quand* : mes 6 cartes historiques sont en base et je peux tout retélécharger.

---

## 9. Pièges connus — à lire avant de coder

- **react-leaflet plante en SSR.** Importer le composant carte en `dynamic(() => import(...), { ssr: false })`, sinon `window is not defined` au build Vercel.
- **Nominatim impose 1 req/s et un User-Agent identifiable.** Géocoder côté serveur uniquement, à la création d'une boutique, jamais en boucle.
- **Les images TCGdex n'ont pas d'extension dans l'URL.** Un `<Image src={card.image} />` brut renvoie un 404.
- **`next/image` sur le plan Hobby a un quota de transformations mensuel.** Les images TCGdex sont déjà optimisées : les servir avec `unoptimized` ou une balise `img` classique, et réserver `next/image` aux photos perso.
- **Pas de sauvegarde automatique sur Supabase gratuit.** Prévoir dès la phase 7 un export JSON téléchargeable, et le lancer de temps en temps.
- **`pricing` peut être absent** de la réponse TCGdex pour une carte non listée. Ne jamais lire `card.pricing.cardmarket.trend` sans garde.
- **Les IDs de set sont à vérifier via l'API, pas à deviner.** Les sets HGSS français ont leurs propres identifiants ; les résoudre par `GET /sets` au moment de l'import plutôt que de les écrire en dur.
