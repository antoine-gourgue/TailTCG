# Pokédex Collection

Site perso de gestion de collection de cartes Pokémon : recherche via l'API
TCGdex (FR), suivi de l'état, du prix d'achat, du lieu d'achat et de la cote
Cardmarket du jour.

Spécification complète : [PLAN_Pokedex_Collection.md](./PLAN_Pokedex_Collection.md)

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres, Auth magic link, Storage)
- API TCGdex `api.tcgdex.net/v2/fr` (sans clé)
- Déploiement Vercel (plan Hobby)

## Démarrage

```bash
cp .env.example .env.local   # puis remplir les valeurs
npm install
npm run dev
```

## Base de données

Migrations versionnées dans `supabase/migrations/`, appliquées avec la CLI :

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase db push
```
