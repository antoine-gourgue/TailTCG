<div align="center">
  <img src="src/app/icon.svg" width="88" alt="TailTCG" />

  # TailTCG

  **Ta collection Pokémon, enfin à sa hauteur.**

  Suivi de collection, valorisation manuelle, classeurs stylés, vitrine
  partageable et pré-gradation maison — gratuit et sans publicité.

  [tailtcg.vercel.app](https://tailtcg.vercel.app)

  ![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
  ![React 19](https://img.shields.io/badge/React-19-149eca?logo=react)
  ![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Storage-3fcf8e?logo=supabase)
  ![Tailwind v4](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)
</div>

---

## ✨ Fonctionnalités

### 📇 Collection
- **Recherche catalogue** par nom ou numéro via [TCGdex](https://tcgdex.dev) (FR & JA), image et set remplis automatiquement, cascade multilingue quand un scan manque
- **Navigateur d'extensions** façon classeur : séries, sets, filtres par rareté, aperçu de carte avec ajout direct ou mise en recherchées
- **Cartes hors catalogue** : ajoute n'importe quelle carte avec ta photo comme visuel
- Fiches détaillées : état, langue, quantité, gradation, photos perso étiquetées, notes, navigation carte à carte
- **Corbeille** : suppression douce, annulation en un clic, purge automatique après 30 jours

### 💶 Valorisation
- **100 % manuelle et assumée** : toi seul estimes tes cartes — chaque actualisation est datée et trace la courbe de l'exemplaire et de la collection
- Rappels réglables (1 à 4 semaines) quand une valeur n'est plus fraîche
- Suivi des **ventes** avec plus-value réalisée, stats et graphiques maison

### 🏆 Pré-gradation (la signature)
- Atelier guidé sur tes photos recto/verso : pose 4 poignées sur les coins,
  l'app **redresse la carte par correction de perspective** dans un calque au
  format exact 63×88
- **Centrage mesuré** (pas estimé) au barème PSA, sur les deux faces
- Coins agrandis et navigables, checklists bords & surface
- Note globale **plafonnée par le pire critère**, comme les vrais gradeurs
- Chaque carte évaluée s'affiche **en boîtier** avec son étiquette, et son
  visuel redressé remplace le scan partout dans l'app

### 🗂️ Classeurs
- Sous-collections thématiques avec **5 styles de couverture** (classeur à
  pochettes, mosaïque, vitrine, éventail, étiquette), couleur de tranche et
  cartes vedettes au choix
- Sélection multiple, glisser-déposer pour ordonner classeurs et cartes

### 🔗 Partage
- **Vitrine publique** par lien secret révocable : collection complète,
  classeurs, dernières acquisitions — en lecture seule
- Partage direct d'un classeur, pseudo public, **aperçus riches** (image OG
  générée à la volée) sur WhatsApp/Discord

### 🧭 Confort
- Palette de commande **⌘K**, journal d'activité, carte des boutiques et
  brocantes (Leaflet + géocodage), exports JSON/CSV
- **PWA** installable, tab bar mobile native, thèmes sombre/clair
- Photos iPhone **HEIC converties dans le navigateur**

## 🛠️ Stack

| Couche | Choix |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, Server Actions) + React 19 |
| Styles | Tailwind CSS v4, design system maison (Instrument Sans + Geist Mono) |
| Données | Supabase — Postgres avec RLS par propriétaire, Auth, Storage privé |
| Catalogue | API TCGdex (sans clé) |
| Cartes | Leaflet + OpenStreetMap, géocodage Nominatim |
| Images | Correction de perspective canvas maison, `heic-to`, `next/og` |
| Hébergement | Vercel (déploiement continu, cron quotidien) |

## 🚀 Développement

```bash
npm install
npm run dev        # http://localhost:3000
```

Variables d'environnement (`.env.local`) :

```bash
NEXT_PUBLIC_SUPABASE_URL=…              # URL du projet Supabase
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…  # clé publique
SUPABASE_SECRET_KEY=…                   # clé service role (serveur uniquement)
CRON_SECRET=…                           # protège /api/cron/prices
```

Base de données — les migrations sont versionnées dans
[`supabase/migrations`](supabase/migrations) :

```bash
npx supabase link --project-ref <ref>
npx supabase db push --include-all
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

```bash
npm run lint       # eslint (règles react-compiler strictes)
npx tsc --noEmit   # typecheck
npm run build      # build de production
```

## 📁 Structure

```
src/
├── app/            # routes (App Router) : collection, classeurs, carte,
│   │               # recherche, extensions, pregrades, journal, vitrine /v…
│   ├── api/        # cron des cotes, exports, recherche, OG, shell, palette
│   └── */actions.ts# server actions (items, classeurs, paramètres…)
├── components/     # UI : grilles, atelier de pré-gradation, boîtier,
│                   # sidebar, palette ⌘K, modales maison…
└── lib/            # tcgdex, perspective (homographie), grading, images,
                    # supabase (client/server/admin), domaine
supabase/migrations # schéma versionné (RLS partout)
```

## 📜 Notes

- La valorisation est **volontairement manuelle** : les cotes automatiques
  agrègent tous les états et induisent en erreur — le cron Cardmarket ne sert
  plus qu'à l'historique silencieux.
- La pré-gradation est une **estimation indicative** : elle mesure et
  structure ton jugement, elle ne remplace pas une gradation professionnelle.

Projet personnel construit avec ❤️ par un collectionneur, pour les
collectionneurs.
