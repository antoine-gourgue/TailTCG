import Link from "next/link";
import {
  LayoutGrid,
  NotebookTabs,
  Share2,
  TrendingUp,
  MapPin,
  Star,
  Award,
  Ruler,
} from "lucide-react";
import { Logo } from "@/components/logo";

const FEATURES = [
  {
    Icon: LayoutGrid,
    title: "Ton classeur, en mieux",
    text: "Cherche une carte par son nom ou son numéro, l'image et le set se remplissent tout seuls. État, langue, gradation, photos perso — tout y est.",
  },
  {
    Icon: TrendingUp,
    title: "La valeur, sous contrôle",
    text: "Toi seul estimes tes cartes. Chaque actualisation est datée et trace la courbe de ta collection, avec un rappel réglable pour rester à jour.",
  },
  {
    Icon: NotebookTabs,
    title: "Des classeurs à ton image",
    text: "Range tes cartes en sous-collections — toutes tes Pikachu, tes primes — avec cinq styles de couverture, couleurs et cartes vedettes.",
  },
  {
    Icon: Share2,
    title: "Une vitrine à partager",
    text: "Un lien secret et tes amis parcourent ta collection en lecture seule, classeurs compris. Révocable à tout moment.",
  },
  {
    Icon: Star,
    title: "Les recherchées",
    text: "Marque les cartes qui te manquent d'une étoile en parcourant les extensions — elles sortent de la liste dès que tu les ajoutes.",
  },
  {
    Icon: MapPin,
    title: "Tes boutiques sur carte",
    text: "Boutiques, brocantes, sites : chaque achat garde sa source, et ta carte des bons coins se construit toute seule.",
  },
];

// Page d'accueil publique pour les visiteurs non connectés
export function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4">
      <header className="flex h-16 items-center justify-between">
        <Logo variant="lockup" size={30} />
        <Link href="/login" className="btn btn-ghost">
          Se connecter
        </Link>
      </header>

      {/* Héros */}
      <section className="flex flex-col items-center py-16 text-center sm:py-24">
        <Logo variant="mark" size={72} />
        <h1 className="display mt-8 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Ta collection Pokémon, enfin à sa hauteur.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
          Suis tes cartes, leur état et leur valeur. Range-les en classeurs,
          et partage ta collection d&apos;un lien.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="btn btn-primary !px-6 !py-3 text-base">
            Créer ma collection
          </Link>
        </div>
        <p className="mt-3 text-xs text-faint">
          Gratuit · catalogue TCGdex FR &amp; JA · aucune carte bancaire
        </p>
      </section>

      {/* Pré-gradation, la fonctionnalité signature */}
      <section className="panel mb-4 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
          <Award size={22} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="display text-lg font-bold">
            Pré-grade tes cartes toi-même, gratuitement
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Photographie ta carte, pose 4 poignées sur ses coins : l&apos;app la
            redresse dans un calque au format exact, <strong>mesure</strong> le
            centrage au barème PSA (recto et verso), zoome sur chaque coin, et
            calcule une note plafonnée par le pire critère — comme les vrais
            gradeurs. Ta carte finit dans un boîtier avec son étiquette, avant
            de décider si elle mérite une vraie gradation.
          </p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-edge px-3 py-1.5 text-xs text-muted sm:flex">
          <Ruler size={13} aria-hidden />
          Centrage mesuré, pas estimé
        </span>
      </section>

      {/* Fonctionnalités */}
      <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="panel p-5">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
              <f.Icon size={17} strokeWidth={1.9} aria-hidden />
            </span>
            <p className="display text-base font-semibold">{f.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
          </div>
        ))}
      </section>

      {/* Appel final */}
      <section className="panel mb-10 flex flex-col items-center gap-4 p-10 text-center">
        <p className="display max-w-md text-2xl font-bold tracking-tight">
          Tes cartes méritent mieux qu&apos;un tableur.
        </p>
        <Link href="/login" className="btn btn-primary !px-6 !py-3 text-base">
          Commencer maintenant
        </Link>
      </section>

      <footer className="flex items-center justify-between border-t border-edge py-6 text-xs text-faint">
        <span className="flex items-center gap-2">
          <Logo variant="mark" size={18} /> TailTCG
        </span>
        <span>Fait par un collectionneur, pour les collectionneurs.</span>
      </footer>
    </main>
  );
}
