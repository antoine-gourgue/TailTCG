import Link from "next/link";
import {
  Check,
  ChevronDown,
  SearchIcon,
  Ruler,
  NotebookTabs,
  Share2,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Reveal } from "@/components/reveal";

/* Trois classiques du set de base, en éventail dans le héros */
const HERO_CARDS = [
  { url: "https://assets.tcgdex.net/fr/base/base1/2/high.png", alt: "Tortank" },
  { url: "https://assets.tcgdex.net/fr/base/base1/4/high.png", alt: "Dracaufeu" },
  { url: "https://assets.tcgdex.net/fr/base/base1/15/high.png", alt: "Florizarre" },
];

/* ————— Briques ————— */

function StepBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
      {children}
    </span>
  );
}

function CheckLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm text-muted">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
        <Check size={12} strokeWidth={2.5} aria-hidden />
      </span>
      {children}
    </li>
  );
}

function Step({
  n,
  title,
  text,
  checks,
  mockup,
  flip = false,
}: {
  n: number;
  title: string;
  text: string;
  checks: string[];
  mockup: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section className="grid items-center gap-10 py-16 sm:py-24 md:grid-cols-2 md:gap-16">
      <Reveal className={flip ? "md:order-2" : ""}>
        <StepBadge>Étape {n}</StepBadge>
        <h2 className="display mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted">{text}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {checks.map((c) => (
            <CheckLine key={c}>{c}</CheckLine>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={150} className={`relative ${flip ? "md:order-1" : ""}`}>
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)",
          }}
          aria-hidden
        />
        {mockup}
      </Reveal>
    </section>
  );
}

/* ————— Mockups (CSS pur, dans l'esprit de l'app) ————— */

function FakeCard({
  from,
  to,
  className = "",
  style,
}: {
  from: string;
  to: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`aspect-[63/88] rounded-lg border border-edge ${className}`}
      style={{ background: `linear-gradient(150deg, ${from}, ${to})`, ...style }}
    />
  );
}

function MockSearch() {
  return (
    <div className="panel mx-auto w-full max-w-sm p-4 shadow-2xl">
      <div className="mk-pop flex items-center gap-2 rounded-xl border border-edge bg-raised px-3 py-2.5 text-sm text-muted">
        <SearchIcon size={14} aria-hidden />
        dracaufeu ex…
        <span className="ml-auto h-4 w-0.5 animate-pulse bg-accent" aria-hidden />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <FakeCard from="#e4572e44" to="#f5a62333" className="mk-pop" style={{ animationDelay: "0.25s" }} />
        <FakeCard from="#2d7dd244" to="#45c4b033" className="mk-pop" style={{ animationDelay: "0.4s" }} />
        <FakeCard from="#9b5de544" to="#f15bb533" className="mk-pop" style={{ animationDelay: "0.55s" }} />
      </div>
      <div
        className="mk-pop mt-3 flex items-center justify-between rounded-xl border border-edge px-3 py-2"
        style={{ animationDelay: "0.75s" }}
      >
        <span className="text-xs text-muted">Dracaufeu ex · 199/165</span>
        <span className="mk-pulse rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
          + Ajouter
        </span>
      </div>
    </div>
  );
}

function MockValue() {
  return (
    <div className="panel mx-auto w-full max-w-sm p-5 shadow-2xl">
      <div className="flex gap-6">
        <div className="mk-pop">
          <p className="label-xs">Investi</p>
          <p className="display num text-lg font-bold">544,58 €</p>
        </div>
        <div className="mk-pop" style={{ animationDelay: "0.15s" }}>
          <p className="label-xs">Valeur estimée</p>
          <p className="display num text-lg font-bold">812,00 €</p>
        </div>
        <div className="mk-pop" style={{ animationDelay: "0.3s" }}>
          <p className="label-xs">Plus-value</p>
          <p className="display num text-lg font-bold text-gain">+267,42 €</p>
        </div>
      </div>
      <svg viewBox="0 0 300 90" className="mt-4 w-full" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="mk-fade"
          style={{ animationDelay: "1.5s" }}
          d="M0,70 C40,66 60,58 90,60 C120,62 140,40 180,38 C220,36 250,22 300,12 L300,90 L0,90 Z"
          fill="url(#lg)"
        />
        <path
          className="mk-draw"
          pathLength={1}
          d="M0,70 C40,66 60,58 90,60 C120,62 140,40 180,38 C220,36 250,22 300,12"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle
          className="mk-fade"
          style={{ animationDelay: "1.9s" }}
          cx="300"
          cy="12"
          r="4"
          fill="var(--accent)"
        />
      </svg>
      <p
        className="mk-fade mt-1 text-right text-[11px] text-faint"
        style={{ animationDelay: "2.1s" }}
      >
        chaque actualisation est datée
      </p>
    </div>
  );
}

function MockSlab() {
  return (
    <div className="mk-sweep mx-auto w-full max-w-[240px] rounded-2xl border border-edge-strong bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-white/[0.06] p-2 shadow-2xl">
      <div className="mk-pop mb-2 flex items-center gap-2 rounded-lg bg-[#f5f1e6] px-2.5 py-2 text-[#1a1a1a]">
        <Logo variant="mark" size={22} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold leading-tight">
            Dracaufeu ex
          </p>
          <p
            className="mk-fade num text-[9px] leading-tight text-black/50"
            style={{ animationDelay: "0.5s" }}
          >
            CEN 9 · COI 10
          </p>
          <p
            className="mk-fade num text-[9px] leading-tight text-black/50"
            style={{ animationDelay: "0.65s" }}
          >
            BOR 10 · SUR 9
          </p>
        </div>
        <div
          className="mk-stamp shrink-0 border-l border-black/15 pl-2 text-center"
          style={{ animationDelay: "0.9s" }}
        >
          <p className="num text-xl font-black leading-none">9</p>
          <p className="text-[7px] font-semibold uppercase tracking-wider text-black/60">
            Mint
          </p>
        </div>
      </div>
      <div
        className="mk-pop relative rounded-xl bg-black/20 p-2"
        style={{ animationDelay: "0.25s" }}
      >
        <FakeCard from="#e4572e55" to="#f5a62344" />
        <span
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-transparent"
          aria-hidden
        />
      </div>
    </div>
  );
}

function MockBinder() {
  return (
    <div className="mx-auto w-full max-w-[230px]">
      <div className="relative overflow-hidden rounded-l-lg rounded-r-xl border border-edge bg-surface shadow-2xl">
        <div className="absolute inset-y-0 left-0 flex w-7 flex-col items-center justify-evenly border-r border-edge bg-accent py-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full border border-black/30 bg-surface"
              aria-hidden
            />
          ))}
        </div>
        <div className="ml-7 p-2.5">
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-raised/40 p-2 ring-1 ring-edge/60">
            <FakeCard from="#f7d94c44" to="#e4572e33" className="mk-pop" style={{ animationDelay: "0.15s" }} />
            <FakeCard from="#45c4b044" to="#2d7dd233" className="mk-pop" style={{ animationDelay: "0.3s" }} />
            <FakeCard from="#f15bb544" to="#9b5de533" className="mk-pop" style={{ animationDelay: "0.45s" }} />
            <FakeCard from="#8ac92644" to="#45c4b033" className="mk-pop" style={{ animationDelay: "0.6s" }} />
          </div>
        </div>
      </div>
      <p className="mk-pop mt-2.5 text-sm font-semibold" style={{ animationDelay: "0.8s" }}>
        Mes Dracaufeu
      </p>
      <p className="mk-pop text-xs text-muted" style={{ animationDelay: "0.9s" }}>
        12 cartes · <span className="num">1 240,00 €</span>
      </p>
    </div>
  );
}

function MockShare() {
  return (
    <div className="panel mx-auto w-full max-w-sm overflow-hidden !p-0 shadow-2xl">
      <div className="flex items-center gap-1.5 border-b border-edge bg-raised/60 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-loss/60" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-accent/60" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-gain/60" aria-hidden />
        <span className="mk-pop num ml-2 flex-1 truncate rounded-md bg-surface px-2 py-0.5 text-[10px] text-faint">
          tailtcg.vercel.app/v/8739…befa
        </span>
      </div>
      <div className="p-4">
        <div className="mk-pop flex items-center gap-2" style={{ animationDelay: "0.2s" }}>
          <Logo variant="mark" size={22} />
          <div>
            <p className="text-sm font-bold leading-tight">
              La collection de Sacha
            </p>
            <p className="text-[10px] text-muted">
              Vitrine en lecture seule · 132 cartes
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <FakeCard from="#e4572e44" to="#f7d94c33" className="mk-pop" style={{ animationDelay: "0.4s" }} />
          <FakeCard from="#2d7dd244" to="#45c4b033" className="mk-pop" style={{ animationDelay: "0.5s" }} />
          <FakeCard from="#9b5de544" to="#f15bb533" className="mk-pop" style={{ animationDelay: "0.6s" }} />
          <FakeCard from="#8ac92644" to="#2d7dd233" className="mk-pop" style={{ animationDelay: "0.7s" }} />
        </div>
        <div className="mk-pop mt-3 flex justify-end" style={{ animationDelay: "1s" }}>
          <span className="mk-pulse inline-flex items-center gap-1 rounded-full bg-gain/15 px-2.5 py-1 text-[10px] font-semibold text-gain">
            <Check size={10} strokeWidth={3} aria-hidden /> Lien copié
          </span>
        </div>
      </div>
    </div>
  );
}

/* ————— Page ————— */

const STEPS = [
  {
    title: "Ajoute tes cartes en quelques secondes",
    text: "Tape un nom ou un numéro : l'image, le set et l'extension se remplissent tout seuls depuis le catalogue TCGdex. Il ne reste qu'à noter l'état et le prix payé.",
    checks: [
      "Recherche par nom ou numéro, catalogue FR & japonais",
      "Navigateur d'extensions façon classeur, filtré par rareté",
      "Cartes hors catalogue avec ta propre photo",
    ],
    mockup: <MockSearch />,
  },
  {
    title: "Suis la valeur de ta collection",
    text: "Toi seul estimes tes cartes — pas de cote automatique trompeuse. Chaque actualisation est datée et trace la courbe de la carte et de la collection.",
    checks: [
      "Valorisation manuelle, historisée, avec rappels réglables",
      "Courbes d'évolution par carte et globales",
      "Ventes suivies avec plus-value réalisée",
    ],
    mockup: <MockValue />,
  },
  {
    title: "Pré-grade tes cartes toi-même",
    text: "Photographie ta carte, pose 4 poignées sur ses coins : l'app la redresse dans un calque au format exact, mesure le centrage au barème PSA et te guide critère par critère.",
    checks: [
      "Centrage mesuré, pas estimé — recto et verso",
      "Coins agrandis, checklists bords & surface",
      "Note plafonnée par le pire critère, carte en boîtier",
    ],
    mockup: <MockSlab />,
  },
  {
    title: "Range en classeurs à ton image",
    text: "Toutes tes Pikachu, tes primes, tes gradées : des sous-collections avec cinq styles de couverture, couleur de tranche et cartes vedettes — réordonnables au glisser-déposer.",
    checks: [
      "5 styles de couverture personnalisables",
      "Une carte peut vivre dans plusieurs classeurs",
      "Ordre des cartes et des classeurs à ta main",
    ],
    mockup: <MockBinder />,
  },
  {
    title: "Partage ta vitrine d'un lien",
    text: "Un lien secret et tes amis parcourent ta collection en lecture seule — classeurs compris, avec un bel aperçu quand tu l'envoies sur WhatsApp ou Discord. Révocable à tout moment.",
    checks: [
      "Vitrine publique à ton pseudo, classeurs visitables",
      "Aperçus riches générés automatiquement",
      "Lien révocable ou renouvelable en un clic",
    ],
    mockup: <MockShare />,
  },
];

// Page d'accueil publique pour les visiteurs non connectés
export function Landing() {
  return (
    <div className="min-h-dvh">
      {/* En-tête */}
      <header className="sticky top-0 z-40 border-b border-edge bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Logo variant="lockup" size={30} />
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost">
              Se connecter
            </Link>
            <Link href="/login" className="btn btn-primary">
              Créer ma collection
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4">
        {/* Héros */}
        <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center overflow-hidden py-16 text-center">
          {/* Halo pokéball */}
          <span
            className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[480px]"
            style={{
              background:
                "radial-gradient(55% 55% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 75%)",
            }}
            aria-hidden
          />
          <span
            className="rise-in flex items-center gap-2 rounded-full border border-edge bg-raised/60 px-4 py-1.5 text-[13px] text-muted"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Gratuit · Sans pub · Fait par un collectionneur
          </span>
          <h1
            className="display rise-in mt-7 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl"
            style={{ animationDelay: "0.15s" }}
          >
            Ta collection Pokémon,
            <br />
            <span className="text-accent-strong">enfin à sa hauteur.</span>
          </h1>
          <p
            className="rise-in mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
            style={{ animationDelay: "0.28s" }}
          >
            Suis tes cartes, leur état et leur <strong>valeur</strong>.{" "}
            <strong>Pré-grade</strong>-les toi-même sur tes photos, range-les
            en <strong>classeurs</strong> stylés, et partage ta{" "}
            <strong>vitrine</strong> d&apos;un lien.
          </p>
          <div
            className="rise-in mt-8 flex flex-col items-center"
            style={{ animationDelay: "0.4s" }}
          >
            <Link
              href="/login"
              className="btn btn-primary !px-8 !py-3.5 text-base shadow-xl"
            >
              Créer ma collection
            </Link>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-faint">
              <span>100 % gratuit</span>
              <span>Catalogue TCGdex FR &amp; JA</span>
              <span>Installable sur ton téléphone</span>
            </p>
          </div>

          {/* L'éventail de cartes, signature TailTCG */}
          <div
            className="rise-in relative mt-10 h-52 w-full max-w-md sm:h-60"
            style={{ animationDelay: "0.5s" }}
          >
            {HERO_CARDS.map((c, i) => (
              <div
                key={c.alt}
                className="absolute left-1/2 top-0 w-36 sm:w-40"
                style={{
                  transform: `translateX(-50%) translateX(${(i - 1) * 72}%) rotate(${
                    (i - 1) * 10
                  }deg) translateY(${Math.abs(i - 1) * 14}px)`,
                  zIndex: i === 1 ? 2 : 1,
                }}
              >
                <div
                  className="float-y"
                  style={{ animationDelay: `${i * 0.7}s` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.url}
                    alt={c.alt}
                    className="w-full rounded-xl border border-edge shadow-2xl"
                    loading="eager"
                  />
                </div>
              </div>
            ))}
          </div>

          <span className="absolute bottom-5 hidden flex-col items-center gap-1 text-faint sm:flex">
            <span className="label-xs">Découvrir</span>
            <ChevronDown size={16} className="animate-bounce" aria-hidden />
          </span>
        </section>

        {/* Étapes */}
        {STEPS.map((s, i) => (
          <Step
            key={s.title}
            n={i + 1}
            title={s.title}
            text={s.text}
            checks={s.checks}
            mockup={s.mockup}
            flip={i % 2 === 1}
          />
        ))}

        {/* Appel final */}
        <Reveal>
        <section className="flex flex-col items-center py-24 text-center sm:py-32">
          <Logo variant="mark" size={56} />
          <h2 className="display mt-8 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
            Prêt à donner à ta collection la place qu&apos;elle mérite ?
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
            Recherche, valeur, pré-gradation, classeurs, vitrine — tout au même
            endroit, pensé par un collectionneur qui en avait marre des
            tableurs.
          </p>
          <Link
            href="/login"
            className="btn btn-primary mt-8 !px-8 !py-3.5 text-base shadow-xl"
          >
            Commencer maintenant
          </Link>
          <p className="mt-4 text-xs text-faint">
            Gratuit · Sans engagement · Tes données t&apos;appartiennent
            (exports JSON &amp; CSV)
          </p>
        </section>
        </Reveal>
      </main>

      <footer className="border-t border-edge">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 text-xs text-faint">
          <span className="flex items-center gap-2">
            <Logo variant="mark" size={18} /> TailTCG
          </span>
          <span className="flex items-center gap-4">
            <span className="hidden items-center gap-1 sm:flex">
              <Ruler size={11} aria-hidden /> Centrage mesuré
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <NotebookTabs size={11} aria-hidden /> Classeurs
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Share2 size={11} aria-hidden /> Vitrine
            </span>
            <span>Fait avec ❤️ pour les collectionneurs</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
