import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Check,
  Database,
  Gem,
  LineChart,
  NotebookTabs,
  ScanLine,
  Share2,
  Smartphone,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import { CardImage } from "@/components/card-image";
import { GradedSlab } from "@/components/graded-slab";
import { ValueHistoryChart } from "@/components/value-history-chart";

/* Cartes réelles (catalogue TCGdex) qui illustrent la page */
const CARD = {
  dracaufeuEx: "https://assets.tcgdex.net/fr/sv/sv03.5/006",
  dracaufeuSar: "https://assets.tcgdex.net/fr/sv/sv03.5/199",
  pikachu: "https://assets.tcgdex.net/fr/sv/sv03.5/025",
  pikachuEx: "https://assets.tcgdex.net/fr/sv/sv08/057",
  evoli: "https://assets.tcgdex.net/fr/sv/sv03.5/133",
  dracaufeuBase: "https://assets.tcgdex.net/fr/base/base1/4",
  dracaufeuTera: "https://assets.tcgdex.net/fr/sv/sv04.5/054",
};

/* Courbe de la maquette « valeur » : un mois de cote, en hausse douce */
const CHART_POINTS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 28 + i));
  const noise = [0.6, -0.4, 0.9, -0.7, 0.3, 0, -0.9, 0.5][i % 8];
  const dip = i >= 11 && i <= 15 ? -6 : 0;
  return { recorded_at: d.toISOString().slice(0, 10), value: Math.round((812 + i * 4.2 + dip + noise * 4) * 100) / 100 };
});

/* ————— Briques ————— */

function Kicker({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>; children: React.ReactNode }) {
  return (
    <p className="label-xs flex items-center gap-1.5 text-accent-strong">
      <Icon size={13} aria-hidden />
      {children}
    </p>
  );
}

function Tile({
  icon,
  kicker,
  title,
  text,
  className = "",
  children,
  delay = 0,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  kicker: string;
  title: string;
  text: string;
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <article className="panel flex h-full flex-col overflow-hidden p-6">
        <Kicker icon={icon}>{kicker}</Kicker>
        <h3 className="display mt-2 text-xl font-bold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
        <div className="mt-6">{children}</div>
      </article>
    </Reveal>
  );
}

/** Le téléphone qui scanne : la carte, le cadre qui passe d'orange à vert, le bandeau « Ajoutée » */
function PhoneScan() {
  const tick = "absolute h-6 w-6 border-[5px]";
  return (
    <div className="relative mx-auto w-[272px] sm:w-[300px]">
      {/* Halo pokéball derrière le téléphone */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 26%, transparent), transparent 62%)" }}
        aria-hidden
      />
      {/* Cartes qui flottent derrière */}
      <div className="float-y absolute -left-24 top-16 hidden w-32 -rotate-12 sm:block" style={{ animationDelay: "0.8s" }} aria-hidden>
        <div className="card-tile aspect-[63/88] opacity-90">
          <CardImage base={CARD.pikachu} alt="" />
        </div>
      </div>
      <div className="float-y absolute -right-24 bottom-24 hidden w-32 rotate-12 sm:block" style={{ animationDelay: "2.1s" }} aria-hidden>
        <div className="card-tile aspect-[63/88] opacity-90">
          <CardImage base={CARD.evoli} alt="" />
        </div>
      </div>

      <div className="relative aspect-[9/19] overflow-hidden rounded-[2.6rem] border-[7px] border-[#26252a] bg-black shadow-[0_40px_90px_rgba(0,0,0,.65)] ring-1 ring-white/10">
        {/* La scène filmée : une table, la carte */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 70% at 50% 35%, #5a4c40, #1a1715 72%)" }} aria-hidden />
        <div className="absolute left-1/2 top-[21%] w-[64%] -translate-x-1/2 -rotate-[5deg]">
          <div className="relative">
            <div className="overflow-hidden rounded-[4.5%/3.5%] shadow-[0_18px_40px_rgba(0,0,0,.6)]">
              <CardImage base={CARD.dracaufeuEx} alt="Dracaufeu ex" quality="high" />
            </div>
            {/* Cadre orange (cherche), puis vert (reconnue) — même géométrie que le scanner */}
            {(["seek", "lock"] as const).map((tone) => {
              const c = tone === "seek" ? "#f97316" : "#34d399";
              const bg = tone === "seek" ? "rgba(249,115,22,.10)" : "rgba(16,185,129,.16)";
              return (
                <div key={tone} className={`absolute -inset-[3%] rounded-[5%/4%] mk-${tone}`} style={{ background: bg, boxShadow: `inset 0 0 0 3px ${c}80` }} aria-hidden>
                  <span className={`${tick} left-0 top-0 rounded-tl-lg border-b-0 border-r-0`} style={{ borderColor: c }} />
                  <span className={`${tick} right-0 top-0 rounded-tr-lg border-b-0 border-l-0`} style={{ borderColor: c }} />
                  <span className={`${tick} bottom-0 left-0 rounded-bl-lg border-r-0 border-t-0`} style={{ borderColor: c }} />
                  <span className={`${tick} bottom-0 right-0 rounded-br-lg border-l-0 border-t-0`} style={{ borderColor: c }} />
                </div>
              );
            })}
          </div>
        </div>
        {/* Flash vert de l'ajout */}
        <div className="mk-flash pointer-events-none absolute inset-0 bg-emerald-500" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/75 to-transparent" aria-hidden />

        {/* Barre haute du scanner */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-5 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <X size={14} aria-hidden />
          </span>
          <span className="display text-sm font-semibold">Scanner</span>
          <span className="num rounded-full bg-gain px-2 py-0.5 text-[10px] font-bold text-black">3 ajoutées</span>
        </div>

        {/* Bandeau de la carte ajoutée */}
        <div className="mk-banner absolute inset-x-3 bottom-[4.4rem] flex items-center gap-2.5 rounded-2xl border border-white/15 bg-black/75 p-2.5 text-white backdrop-blur-md">
          <div className="card-tile w-10 shrink-0 aspect-[63/88]">
            <CardImage base={CARD.dracaufeuEx} alt="" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="label-xs flex items-center gap-1 text-emerald-300">
              <Check size={10} aria-hidden /> Ajoutée
            </p>
            <p className="display truncate text-[13px] font-bold leading-tight">Dracaufeu ex</p>
            <p className="truncate text-[10px] text-white/70">
              151 <span className="num">· n° 006</span>
              <span className="num ml-1.5 font-semibold text-emerald-300">42,00 €</span>
            </p>
          </div>
        </div>

        {/* Pastille d'état : orange puis verte */}
        <div className="absolute inset-x-0 bottom-5 flex justify-center px-4 text-white">
          <span className="relative inline-flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-[11px] backdrop-blur">
            <span className="mk-seek absolute inset-0 inline-flex items-center gap-2 px-3.5 py-1.5">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-orange-400" aria-hidden />
              Carte repérée, ne bouge plus
            </span>
            <span className="mk-lock inline-flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
              Ajoutée · retire la carte
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Maquette « scan » : trois cartes reconnues à la suite */
function ScanRows() {
  const rows = [
    { name: "Dracaufeu ex", set: "151 · 006", img: CARD.dracaufeuEx, price: "42,00 €" },
    { name: "Pikachu-ex", set: "Étincelles Déferlantes · 057", img: CARD.pikachuEx, price: "3,10 €" },
    { name: "Évoli", set: "151 · 133", img: CARD.evoli, price: "0,35 €" },
  ];
  return (
    <ul className="w-full divide-y divide-edge rounded-2xl border border-edge bg-raised/40">
      {rows.map((r, i) => (
        <li key={r.name} className="mk-row flex items-center gap-3 px-3 py-2.5" style={{ animationDelay: `${0.25 + i * 0.45}s` }}>
          <div className="card-tile w-9 shrink-0 aspect-[63/88]">
            <CardImage base={r.img} alt="" placeholder="compact" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{r.name}</p>
            <p className="truncate text-xs text-muted">{r.set}</p>
          </div>
          <span className="num text-xs text-muted">{r.price}</span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gain/15 text-gain">
            <Check size={12} strokeWidth={3} aria-hidden />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Maquette « valeur » : les tuiles du tableau de bord et la vraie courbe */
function ValueMock() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Valeur estimée", "934,60 €", ""],
          ["Cardmarket", "901,20 €", ""],
          ["Plus-value", "+267,42 €", "text-gain"],
        ].map(([l, v, cls], i) => (
          <div key={l} className="mk-pop rounded-xl border border-edge bg-raised/40 px-3 py-2" style={{ animationDelay: `${i * 0.12}s` }}>
            <p className="label-xs truncate">{l}</p>
            <p className={`display num mt-0.5 truncate text-sm font-bold ${cls}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <ValueHistoryChart points={CHART_POINTS} minSpanRatio={0.08} />
      </div>
    </div>
  );
}

/** Maquette « classeur » : quatre vraies cartes sur une page à anneaux */
function BinderMock() {
  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-l-lg rounded-r-2xl border border-edge bg-surface shadow-xl">
        <div className="absolute inset-y-0 left-0 flex w-7 flex-col items-center justify-evenly border-r border-edge bg-accent py-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full border border-black/30 bg-surface" aria-hidden />
          ))}
        </div>
        <div className="ml-7 p-2.5">
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-raised/40 p-2 ring-1 ring-edge/60">
            {[CARD.dracaufeuSar, CARD.dracaufeuTera, CARD.dracaufeuEx, CARD.dracaufeuBase].map((b, i) => (
              <div key={b} className="mk-pop card-tile aspect-[63/88]" style={{ animationDelay: `${0.15 + i * 0.15}s` }}>
                <CardImage base={b} alt="" placeholder="compact" />
              </div>
            ))}
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

/** Maquette « pré-gradation » : le boîtier, puis la note estimée chez chaque grader */
function GradingMock() {
  const graders: [string, string, string][] = [
    ["PSA", "9", "Mint"],
    ["PCA", "9", "—"],
    ["CCC", "9,5", "Gem Mint"],
    ["CGC", "9", "Mint"],
    ["BGS", "9", "Mint"],
  ];
  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-[228px]">
        <GradedSlab name="Dracaufeu" setName="Set de base" localId="4/102" imageUrl={CARD.dracaufeuBase} grade={9} centering={9} corners={10} edges={9.5} surface={9} />
      </div>
      <p className="label-xs mt-5 text-center">Estimation chez chaque grader</p>
      <ul className="mt-2 grid grid-cols-5 gap-1.5">
        {graders.map(([g, n, l], i) => (
          <li key={g} className="mk-row rounded-xl border border-edge bg-raised/40 px-1 py-2 text-center" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
            <p className="text-[10px] font-semibold text-muted">{g}</p>
            <p className="display num text-lg font-bold leading-tight">{n}</p>
            <p className="truncate text-[9px] text-faint">{l}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Maquette « scellés » : la réserve en trois chiffres, puis cinq vrais produits avec leur visuel officiel */
function SealedMock() {
  const rows = [
    { name: "Coffret Dresseur d'Élite 151", paid: "59,99 €", cote: "112,00 €", gain: "+87 %", img: "https://tcgplayer-cdn.tcgplayer.com/product/503313_400w.jpg" },
    { name: "Coffret Dresseur d'Élite Évolutions Prismatiques", paid: "64,90 €", cote: "119,00 €", gain: "+83 %", img: "https://tcgplayer-cdn.tcgplayer.com/product/593355_400w.jpg" },
    { name: "Coffret Ultra-Premium Dracaufeu", paid: "129,90 €", cote: "168,00 €", gain: "+29 %", img: "https://tcgplayer-cdn.tcgplayer.com/product/654213_400w.jpg" },
    { name: "Tin Détective Pikachu", paid: "24,90 €", cote: "27,50 €", gain: "+10 %", img: "https://tcgplayer-cdn.tcgplayer.com/product/502477_400w.jpg" },
    { name: "Booster Étincelles Déferlantes", paid: "6,50 €", cote: "6,90 €", gain: "+6 %", img: "https://tcgplayer-cdn.tcgplayer.com/product/565602_400w.jpg" },
  ];
  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Payé", "286,19 €", ""],
          ["Cote", "433,40 €", ""],
          ["Gain", "+51 %", "text-gain"],
        ].map(([l, v, cls], i) => (
          <div key={l} className="mk-pop rounded-xl border border-edge bg-raised/40 px-3 py-2" style={{ animationDelay: `${i * 0.12}s` }}>
            <p className="label-xs truncate">{l}</p>
            <p className={`display num mt-0.5 truncate text-sm font-bold ${cls}`}>{v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-edge rounded-2xl border border-edge bg-raised/40">
        {rows.map((r, i) => (
          <li key={r.name} className="mk-row flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${0.35 + i * 0.22}s` }}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.06] p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.img} alt="" loading="lazy" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-semibold leading-tight">{r.name}</p>
              <p className="num mt-0.5 text-[11px] text-muted">
                {r.paid} <span className="text-faint">→</span> {r.cote}
              </p>
            </div>
            <span className="num shrink-0 rounded-full bg-gain/15 px-2 py-0.5 text-[11px] font-bold text-gain">{r.gain}</span>
          </li>
        ))}
      </ul>
      <p className="mk-fade mt-2.5 text-[11px] text-faint" style={{ animationDelay: "1.6s" }}>
        Cote relevée chaque nuit · 2 700 produits suivis, du booster au display
      </p>
    </div>
  );
}

/** Maquette « vitrine » : le lien partagé, vu par un ami */
function ShareMock() {
  return (
    <div className="panel w-full overflow-hidden !p-0 shadow-xl">
      <div className="flex items-center gap-1.5 border-b border-edge bg-raised/60 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-loss/60" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-accent/60" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-gain/60" aria-hidden />
        <span className="mk-pop num ml-2 flex-1 truncate rounded-md bg-surface px-2 py-0.5 text-[10px] text-faint">tailtcg.vercel.app/v/sacha</span>
      </div>
      <div className="p-4">
        <div className="mk-pop flex items-center gap-2" style={{ animationDelay: "0.2s" }}>
          <Logo variant="mark" size={22} />
          <div>
            <p className="text-sm font-bold leading-tight">La collection de Sacha</p>
            <p className="text-[10px] text-muted">Vitrine en lecture seule · 132 cartes · 4 classeurs</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[CARD.dracaufeuEx, CARD.pikachu, CARD.evoli, CARD.pikachuEx].map((b, i) => (
            <div key={b} className="mk-pop card-tile aspect-[63/88]" style={{ animationDelay: `${0.4 + i * 0.1}s` }}>
              <CardImage base={b} alt="" placeholder="compact" />
            </div>
          ))}
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

const STATS: [string, string][] = [
  ["43 000", "cartes au catalogue, FR et JP"],
  ["94 000", "cartes reconnues au scan"],
  ["2 700", "produits scellés suivis"],
  ["Chaque nuit", "la cote Cardmarket relevée"],
];

const STEPS = [
  {
    n: "01",
    title: "Scanne ou cherche",
    text: "Pointe ton téléphone : la carte est reconnue et ajoutée, sans appuyer sur rien. Ou tape un nom, en français, en anglais ou en japonais.",
  },
  {
    n: "02",
    title: "Suis la valeur",
    text: "Cote Cardmarket relevée chaque nuit pour chaque carte et chaque scellé, courbes d'évolution, plus-value depuis le prix payé.",
  },
  {
    n: "03",
    title: "Range et partage",
    text: "Classeurs à ton image, pré-gradation sur tes photos, et une vitrine que tes amis parcourent d'un lien.",
  },
];

// Page d'accueil publique pour les visiteurs non connectés
export function Landing() {
  return (
    <div className="min-h-dvh">
      {/* En-tête */}
      <header className="sticky top-0 z-40 border-b border-edge bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo variant="lockup" size={30} />
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost">
              Se connecter
            </Link>
            <Link href="/login" className="btn btn-primary">
              <span className="hidden sm:inline">Créer ma collection</span>
              <span className="sm:hidden">Commencer</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Héros */}
        <section className="grid items-center gap-12 py-14 sm:py-20 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:py-10">
          <div className="max-w-xl">
            <span className="rise-in inline-flex items-center gap-2 rounded-full border border-edge bg-raised/60 px-4 py-1.5 text-[13px] text-muted" style={{ animationDelay: "0.05s" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Gratuit · Sans pub · Fait par un collectionneur
            </span>
            <h1 className="display rise-in mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl" style={{ animationDelay: "0.15s" }}>
              Ta collection Pokémon,
              <br />
              <span className="text-accent-strong">enfin à sa hauteur.</span>
            </h1>
            <p className="rise-in mt-6 text-base leading-relaxed text-muted sm:text-lg" style={{ animationDelay: "0.28s" }}>
              Scanne tes cartes avec ton téléphone, suis leur <strong className="text-foreground">cote Cardmarket</strong> chaque nuit, range-les en{" "}
              <strong className="text-foreground">classeurs</strong> et partage ta <strong className="text-foreground">vitrine</strong>. Cartes et scellés,
              français et japonais.
            </p>
            <div className="rise-in mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.4s" }}>
              <Link href="/login" className="btn btn-primary !px-7 !py-3.5 text-base shadow-xl">
                Créer ma collection
                <ArrowRight size={16} aria-hidden />
              </Link>
              <a href="#fonctions" className="btn btn-ghost !px-6 !py-3.5 text-base">
                Voir ce que ça fait
              </a>
            </div>
            <ul className="rise-in mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-faint" style={{ animationDelay: "0.5s" }}>
              {["100 % gratuit", "Catalogue FR & JP", "Installable sur ton téléphone", "Tes données t'appartiennent"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={12} className="text-gain" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rise-in relative py-6 lg:py-0" style={{ animationDelay: "0.35s" }}>
            <PhoneScan />
          </div>
        </section>

        {/* Chiffres */}
        <Reveal>
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-4">
            {STATS.map(([n, l]) => (
              <div key={l} className="bg-surface px-5 py-5">
                <p className="display num text-2xl font-bold tracking-tight sm:text-3xl">{n}</p>
                <p className="mt-1 text-xs text-muted sm:text-sm">{l}</p>
              </div>
            ))}
          </section>
        </Reveal>

        {/* Fonctions */}
        <section id="fonctions" className="scroll-mt-20 py-20 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="label-xs text-accent-strong">Tout au même endroit</p>
            <h2 className="display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Le scan, la cote, les classeurs. Et le reste.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted">
              Pensé par un collectionneur qui en avait assez des tableurs : chaque carte a sa fiche, sa cote, sa place dans un classeur, et son histoire.
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-6">
            <Tile
              icon={ScanLine}
              kicker="Scan mains libres"
              title="Pointe, c'est ajouté."
              text="La carte est cadrée au pixel, reconnue sur ton téléphone parmi 94 000 cartes, et ajoutée d'elle-même. Passe la suivante. Rien n'est envoyé sur un serveur."
              className="md:col-span-3"
            >
              <ScanRows />
            </Tile>
            <Tile
              icon={LineChart}
              kicker="Cote Cardmarket"
              title="La valeur, relevée chaque nuit."
              text="Valeur estimée, valeur Cardmarket, plus-value depuis le prix payé : pour chaque carte, chaque scellé, et toute la collection sur une courbe."
              className="md:col-span-3"
              delay={100}
            >
              <ValueMock />
            </Tile>
            <Tile
              icon={NotebookTabs}
              kicker="Classeurs"
              title="Range-les à ton image."
              text="Pages à anneaux, couverture sur mesure, glisser-déposer. Une carte peut vivre dans plusieurs classeurs, et le Pokédex se range aussi."
              className="md:col-span-2"
            >
              <BinderMock />
            </Tile>
            <Tile
              icon={Gem}
              kicker="Pré-gradation"
              title="Note-la avant de l'envoyer."
              text="Recto, verso : centrage mesuré, coins, bords et surface, avec l'estimation chez PSA, PCA, CCC, CGC et BGS. Carte en boîtier à la fin."
              className="md:col-span-2"
              delay={100}
            >
              <GradingMock />
            </Tile>
            <Tile
              icon={Boxes}
              kicker="Scellés"
              title="Coffrets, displays, tins."
              text="Tes produits scellés ont leur cote et leur historique comme les cartes. Tu sais ce que vaut ta réserve, et ce qu'elle a pris."
              className="md:col-span-2"
              delay={200}
            >
              <SealedMock />
            </Tile>
            <Tile
              icon={Share2}
              kicker="Vitrine"
              title="Partage d'un lien."
              text="Une adresse à ton pseudo, en lecture seule, classeurs compris, avec un bel aperçu sur WhatsApp et Discord. Révocable quand tu veux."
              className="md:col-span-3"
            >
              <ShareMock />
            </Tile>
            <Tile
              icon={Database}
              kicker="Catalogue et données"
              title="FR, JP, Pokédex. Et c'est à toi."
              text="43 000 cartes françaises et japonaises, 516 sets, les produits scellés, le Pokédex à ranger. Exports JSON et CSV, aucune pub, aucun abonnement."
              className="md:col-span-3"
              delay={100}
            >
              <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  [Database, "43 000 cartes", "français et japonais, 516 sets"],
                  [Boxes, "2 700 scellés", "coffrets, displays, tins, avec leur cote"],
                  [Gem, "Pokédex", "1 025 espèces à ranger en classeur"],
                  [Smartphone, "Installable", "sur iPhone et Android, comme une app"],
                  [Share2, "Exports", "JSON et CSV en un clic"],
                  [Check, "Gratuit", "sans pub ni abonnement"],
                ].map(([Icon, t, s], i) => {
                  const I = Icon as React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
                  return (
                    <div key={t as string} className="mk-pop rounded-xl border border-edge bg-raised/40 p-3" style={{ animationDelay: `${i * 0.12}s` }}>
                      <I size={16} aria-hidden />
                      <p className="mt-2 text-sm font-semibold">{t as string}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">{s as string}</p>
                    </div>
                  );
                })}
              </div>
            </Tile>
          </div>
        </section>

        {/* Comment ça marche */}
        <section className="border-t border-edge py-20 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="label-xs text-accent-strong">Comment ça marche</p>
            <h2 className="display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Trois gestes, et ta collection vit.</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <div className="panel h-full p-6">
                  <p className="display num text-4xl font-bold text-accent-strong/70">{s.n}</p>
                  <h3 className="display mt-4 text-xl font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Appel final */}
        <Reveal>
          <section className="relative overflow-hidden rounded-3xl border border-edge bg-surface px-6 py-16 text-center sm:py-24">
            <span
              className="pointer-events-none absolute inset-x-0 -top-40 -z-0 h-96"
              style={{ background: "radial-gradient(55% 60% at 50% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 75%)" }}
              aria-hidden
            />
            <div className="relative">
              <Logo variant="mark" size={56} />
              <h2 className="display mx-auto mt-8 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">Prêt à donner à ta collection la place qu&apos;elle mérite ?</h2>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted">
                Scan, cote, classeurs, pré-gradation, scellés, vitrine : tout au même endroit, gratuit, sans pub.
              </p>
              <Link href="/login" className="btn btn-primary mt-8 !px-8 !py-3.5 text-base shadow-xl">
                Commencer maintenant
                <ArrowRight size={16} aria-hidden />
              </Link>
              <p className="mt-4 text-xs text-faint">Sans engagement · Tes données t&apos;appartiennent (exports JSON &amp; CSV)</p>
            </div>
          </section>
        </Reveal>
        <div className="h-16" />
      </main>

      <footer className="border-t border-edge">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 text-xs text-faint sm:px-6">
          <span className="flex items-center gap-2">
            <Logo variant="mark" size={18} /> TailTCG
          </span>
          <span className="flex items-center gap-4">
            <span className="hidden items-center gap-1 sm:flex">
              <ScanLine size={11} aria-hidden /> Scan sur l&apos;appareil
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
