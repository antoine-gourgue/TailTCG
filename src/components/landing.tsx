import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Check,
  Database,
  Download,
  Gem,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  Link2,
  Menu,
  NotebookTabs,
  Package,
  ScanLine,
  Search,
  Share2,
  Smartphone,
  Star,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import { CardImage } from "@/components/card-image";
import { GradedSlab } from "@/components/graded-slab";
import { ValueHistoryChart } from "@/components/value-history-chart";
import { StatCard } from "@/components/stat-card";
import { PackArt } from "@/components/game/pack-art";
import type { PlayableSet } from "@/lib/game-sets";
import type { LandingStats } from "@/lib/landing-stats";

/* Cartes réelles (catalogue TCGdex) qui illustrent la page */
const A = "https://assets.tcgdex.net/fr";
const CARD = {
  dracaufeuEx: `${A}/sv/sv03.5/006`,
  dracaufeuSar: `${A}/sv/sv03.5/199`,
  pikachu: `${A}/sv/sv03.5/025`,
  pikachuEx: `${A}/sv/sv08/057`,
  evoli: `${A}/sv/sv03.5/133`,
  dracaufeuBase: `${A}/base/base1/4`,
  dracaufeuTera: `${A}/sv/sv04.5/054`,
  dracaufeuObsidienne: `${A}/sv/sv03/125`,
  dracaufeuObsidienneSar: `${A}/sv/sv03/223`,
  bulbizarre: `${A}/sv/sv03.5/002`,
  mewSar: `${A}/sv/sv03.5/196`,
  megaDracaufeu: `${A}/me/me01/002`,
};

/* Courbe de la maquette « valeur » : un mois de cote, en hausse douce */
const CHART_POINTS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 28 + i));
  const noise = [0.6, -0.4, 0.9, -0.7, 0.3, 0, -0.9, 0.5][i % 8];
  const dip = i >= 11 && i <= 15 ? -6 : 0;
  return { recorded_at: d.toISOString().slice(0, 10), value: Math.round((812 + i * 4.2 + dip + noise * 4) * 100) / 100 };
});

const nf = new Intl.NumberFormat("fr-FR");

/* ————— Briques ————— */

type IconType = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

/* `.label-xs` fixe sa couleur hors couche Tailwind : pour un surtitre en accent, on écrit les utilitaires en clair */
const KICKER = "text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-strong";
const MINI_LABEL = "text-[8px] font-semibold uppercase tracking-[0.12em] text-muted";

function Kicker({ icon: Icon, children }: { icon: IconType; children: React.ReactNode }) {
  return (
    <p className={`${KICKER} flex items-center gap-1.5`}>
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
  icon: IconType;
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
        <div className="mt-6 flex flex-1 flex-col justify-end">{children}</div>
      </article>
    </Reveal>
  );
}

/** Petite courbe de valeur : aplat dégradé, trait qui se dessine à l'apparition */
function MiniChart({ id, className = "h-20 w-full" }: { id: string; className?: string }) {
  const values = CHART_POINTS.map((p) => p.value);
  const w = 320;
  const h = 90;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, pad + (1 - (v - min) / span) * (h - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--accent-strong)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} className="mk-draw" />
      <circle cx={lx} cy={ly} r="3" fill="var(--accent-strong)" />
    </svg>
  );
}

/* ————— Héros : l'appli telle qu'elle est ————— */

const MINI_NAV: [string, IconType, string][] = [
  ["Collection", LayoutDashboard, ""],
  ["Cartes", LayoutGrid, "67"],
  ["Scellés", Boxes, "13"],
  ["Classeurs", NotebookTabs, "3"],
  ["Recherchées", Star, "6"],
  ["Boosters", Package, ""],
];
const WINDOW_CARDS = [CARD.dracaufeuEx, CARD.dracaufeuSar, CARD.pikachuEx, CARD.pikachu, CARD.bulbizarre, CARD.mewSar];

/** Desktop : la fenêtre du tableau de bord (Dock à gauche, valeur et derniers ajouts), le scanner par-dessus */
function AppWindow() {
  return (
    <div className="relative hidden pb-8 pr-3 lg:block">
      <div className="grid min-h-[360px] grid-cols-[150px_1fr] overflow-hidden rounded-[22px] bg-background shadow-[0_40px_90px_rgba(0,0,0,.6)] ring-1 ring-ring">
        {/* Le Dock */}
        <div className="m-2 flex flex-col gap-2 rounded-[18px] bg-dock p-2.5 text-dock-text ring-1 ring-dock-edge">
          <div className="px-1 pt-0.5">
            <Logo variant="lockup" size={18} interactive={false} />
          </div>
          <div className="rounded-xl bg-dock-raised p-2 ring-1 ring-dock-edge">
            <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-dock-faint">Ma collection</p>
            <p className="display num mt-0.5 text-sm font-bold leading-none">1 713 €</p>
            <p className="num mt-1 text-[8px] text-gain">+997 € · +140 %</p>
          </div>
          <span className="flex items-center justify-center gap-1 rounded-full bg-gradient-to-r from-accent to-accent-strong py-1.5 text-[9px] font-semibold text-white shadow-lg shadow-accent/30">
            <ScanLine size={10} aria-hidden /> Scanner
          </span>
          <ul className="flex flex-col gap-0.5 text-[10px]">
            {MINI_NAV.map(([label, Icon, n], i) => (
              <li key={label} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${i === 0 ? "bg-gradient-to-r from-accent to-accent-strong font-semibold text-white" : "text-dock-muted"}`}>
                <Icon size={11} aria-hidden />
                <span className="flex-1">{label}</span>
                {n && <span className={`num text-[9px] ${i === 0 ? "text-white/80" : "text-dock-faint"}`}>{n}</span>}
              </li>
            ))}
          </ul>
        </div>
        {/* Le tableau de bord */}
        <div className="flex flex-col gap-2 py-3.5 pl-1.5 pr-3.5">
          <p className={MINI_LABEL}>Tableau de bord</p>
          <p className="display -mt-1 text-base font-extrabold tracking-tight">Collection</p>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <div className="rounded-[14px] bg-surface p-3 ring-1 ring-ring">
              <p className={MINI_LABEL}>Valeur estimée</p>
              <p className="display num text-[22px] font-extrabold leading-tight">1 713,01 €</p>
              <p className="num text-[9px] text-gain">+997,85 € · +140 % depuis l&apos;achat</p>
              <MiniChart id="mc-window" className="mt-1.5 h-[72px] w-full" />
            </div>
            <div className="flex flex-col gap-2">
              {[
                ["Cardmarket", "1 323 €"],
                ["Investi", "715 €"],
                ["Sur 30 jours", "+42 €"],
              ].map(([l, v]) => (
                <div key={l} className="rounded-[14px] bg-surface px-2.5 py-2 ring-1 ring-ring">
                  <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-muted">{l}</p>
                  <p className="display num text-[13px] font-bold">{v}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {WINDOW_CARDS.map((b, i) => (
              <div key={b} className="mk-pop card-tile aspect-[63/88]" style={{ animationDelay: `${0.3 + i * 0.08}s` }}>
                <CardImage base={b} alt="" placeholder="compact" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <MiniPhone />
    </div>
  );
}

/** Le téléphone qui scanne, posé sur la fenêtre : carte cadrée, reconnue, prête à être ajoutée */
function MiniPhone() {
  return (
    <div className="absolute -bottom-7 -right-3.5 aspect-[390/844] w-[168px] overflow-hidden rounded-[28px] bg-[#0b0a0d] text-white shadow-[0_0_0_6px_#1f1e23,0_30px_60px_rgba(0,0,0,.7)]">
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 40% at 50% 40%, rgba(74,222,128,.25), transparent 70%)" }} aria-hidden />
      <div className="absolute inset-x-3.5 top-3.5 flex items-center justify-between text-[9px] font-semibold">
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white/15">
          <X size={9} aria-hidden />
        </span>
        Scanner
        <span className="num rounded-full bg-gain px-1.5 py-px text-[8px] font-bold text-black">3 ajoutées</span>
      </div>
      <div className="absolute left-[12%] top-[28%] w-[76%] -rotate-3 rounded-lg shadow-[0_20px_40px_rgba(0,0,0,.6)] outline-2 outline-offset-4 outline-gain">
        <div className="card-tile aspect-[63/88]">
          <CardImage base={CARD.dracaufeuObsidienne} alt="" placeholder="compact" />
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-3.5 rounded-full bg-white/10 px-2.5 py-1.5 text-center text-[8px] leading-snug backdrop-blur">
        Dracaufeu-ex reconnue · touche pour ajouter
      </div>
    </div>
  );
}

const PHONE_STATS: [string, string, string][] = [
  ["Cartes", "67", "13 références"],
  ["Investi", "715 €", "13 payées"],
  ["Valeur estimée", "1 713 €", "+140 %"],
  ["Cardmarket", "1 323 €", "tendance"],
];
const PHONE_CARDS = [CARD.dracaufeuEx, CARD.dracaufeuSar, CARD.pikachuEx, CARD.pikachu];

function DockItem({ icon: Icon, label, active = false }: { icon: IconType; label: string; active?: boolean }) {
  return (
    <span className={`flex flex-col items-center gap-0.5 ${active ? "text-accent-strong" : "text-dock-muted"}`}>
      <Icon size={14} strokeWidth={active ? 2.2 : 1.9} aria-hidden />
      {label}
    </span>
  );
}

/** Mobile : le tableau de bord tel qu'on le voit sur le téléphone, dock bas compris */
function PhoneDashboard() {
  return (
    <div
      className="relative mx-auto aspect-[390/760] w-full max-w-[330px] overflow-hidden rounded-[36px] bg-background text-[11px] shadow-[0_0_0_8px_#1f1e23,0_30px_60px_rgba(0,0,0,.6)] lg:hidden"
      style={{ contain: "inline-size" }}
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <Logo variant="lockup" size={20} interactive={false} />
        <div className="flex gap-1.5">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring">
            <Search size={11} aria-hidden />
          </span>
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#f4c361] text-[9px] font-bold text-white">S</span>
        </div>
      </div>
      <div className="px-4 pt-3.5">
        <p className={MINI_LABEL}>Tableau de bord</p>
        <p className="display text-xl font-extrabold tracking-tight">Collection</p>
      </div>
      <div className="flex gap-1.5 overflow-hidden px-4 pt-2.5">
        {PHONE_STATS.map(([k, v, s]) => (
          <div key={k} className="w-[104px] flex-none rounded-xl bg-surface px-2.5 py-2 ring-1 ring-ring">
            <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</p>
            <p className="display num mt-0.5 text-[13px] font-bold">{v}</p>
            <p className="num text-[8px] text-muted">{s}</p>
          </div>
        ))}
      </div>
      <div className="mx-4 mt-2.5 rounded-2xl bg-surface p-3 ring-1 ring-ring">
        <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-muted">Valeur estimée</p>
        <p className="display num text-[22px] font-extrabold leading-tight">1 713,01 €</p>
        <p className="num text-[9px] text-gain">+997,85 € · +140 % depuis l&apos;achat</p>
        <MiniChart id="mc-phone" className="mt-1.5 h-[76px] w-full" />
        <div className="mt-2 flex gap-1">
          {["30 j", "1 an", "Tout"].map((r, i) => (
            <span key={r} className="seg rounded-full px-2 py-0.5 text-[8px] font-medium" data-on={i === 0 ? "true" : undefined}>
              {r}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-baseline justify-between px-4 pt-3">
        <span className="text-[11px] font-bold">Derniers ajouts</span>
        <span className="text-[9px] text-muted">Tout voir</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 px-4 pt-1.5">
        {PHONE_CARDS.map((b, i) => (
          <div key={b} className="mk-pop card-tile aspect-[63/88]" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
            <CardImage base={b} alt="" placeholder="compact" />
          </div>
        ))}
      </div>
      {/* Dock bas : Scanner rond au centre */}
      <div className="absolute inset-x-3 bottom-3 flex h-[58px] items-center justify-around rounded-[24px] bg-dock px-1 text-[8px] font-medium ring-1 ring-dock-edge">
        <DockItem icon={LayoutDashboard} label="Collection" active />
        <DockItem icon={LayoutGrid} label="Cartes" />
        <span className="relative -top-3.5 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-strong text-white shadow-[0_10px_24px_rgba(240,72,62,.35)] ring-4 ring-background">
          <ScanLine size={18} aria-hidden />
        </span>
        <DockItem icon={Boxes} label="Scellés" />
        <DockItem icon={Menu} label="Menu" />
      </div>
    </div>
  );
}

/* ————— Les fonctions, une par tuile ————— */

/** Maquette « scan » : trois cartes reconnues à la suite */
function ScanRows() {
  const rows = [
    { name: "Dracaufeu ex", set: "151 · 006", img: CARD.dracaufeuEx, price: "42,00 €" },
    { name: "Pikachu-ex", set: "Étincelles Déferlantes · 057", img: CARD.pikachuEx, price: "3,10 €" },
    { name: "Évoli", set: "151 · 133", img: CARD.evoli, price: "0,35 €" },
  ];
  return (
    <ul className="flex w-full flex-col gap-1.5">
      {rows.map((r, i) => (
        <li key={r.name} className="mk-row flex items-center gap-3 rounded-xl bg-raised px-3 py-2" style={{ animationDelay: `${0.25 + i * 0.45}s` }}>
          <div className="card-tile w-8 shrink-0 aspect-[63/88]">
            <CardImage base={r.img} alt="" placeholder="compact" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{r.name}</p>
            <p className="truncate text-xs text-muted">{r.set}</p>
          </div>
          <span className="num text-xs font-semibold">{r.price}</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gain text-black">
            <Check size={11} strokeWidth={3} aria-hidden />
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
          ["Estimée", "934,60 €", ""],
          ["Cardmarket", "901,20 €", ""],
          ["Plus-value", "+267,42 €", "text-gain"],
        ].map(([l, v, cls], i) => (
          <div key={l} className="mk-pop rounded-xl bg-raised px-3 py-2" style={{ animationDelay: `${i * 0.12}s` }}>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{l}</p>
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

const BINDER_CARDS = [CARD.dracaufeuEx, CARD.dracaufeuSar, CARD.dracaufeuObsidienne, CARD.dracaufeuObsidienneSar, CARD.dracaufeuTera, CARD.dracaufeuBase];

/** Maquette « classeur » : six vraies cartes sur une page à anneaux */
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
          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-raised/60 p-2 ring-1 ring-edge/60">
            {BINDER_CARDS.map((b, i) => (
              <div key={b} className="mk-pop card-tile aspect-[63/88]" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                <CardImage base={b} alt="" placeholder="compact" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between">
        <p className="mk-pop text-sm font-semibold" style={{ animationDelay: "0.9s" }}>
          Mes Dracaufeu
        </p>
        <p className="mk-pop text-xs text-muted" style={{ animationDelay: "1s" }}>
          12 cartes · <span className="num">1 240,00 €</span>
        </p>
      </div>
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
      <div className="mx-auto w-full max-w-[200px]">
        <GradedSlab name="Dracaufeu" setName="Set de base" localId="4/102" imageUrl={CARD.dracaufeuBase} grade={9} centering={9} corners={10} edges={9.5} surface={9} />
      </div>
      <ul className="mt-4 grid grid-cols-5 gap-1.5">
        {graders.map(([g, n, l], i) => (
          <li key={g} className="mk-row rounded-xl bg-raised px-1 py-2 text-center" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
            <p className="text-[10px] font-semibold text-muted">{g}</p>
            <p className="display num text-lg font-bold leading-tight">{n}</p>
            <p className="truncate text-[9px] text-faint">{l}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Trois produits scellés réels, avec leur visuel officiel */
const SEALED = [
  { name: "Coffret Dresseur d'Élite 151", kind: "Coffret Dresseur d'Élite", cote: "112,00 €", gain: "+87 %", img: "https://tcgplayer-cdn.tcgplayer.com/product/503313_400w.jpg" },
  { name: "Coffret Dresseur d'Élite Évolutions Prismatiques", kind: "Coffret Dresseur d'Élite", cote: "119,00 €", gain: "+83 %", img: "https://tcgplayer-cdn.tcgplayer.com/product/593355_400w.jpg" },
  { name: "Booster sous blister Étincelles Déferlantes", kind: "Booster", cote: "11,48 €", gain: "+76 %", img: "https://tcgplayer-cdn.tcgplayer.com/product/565602_400w.jpg" },
];

/** Tuile « scellés » : le texte à gauche, trois tuiles produit comme sur la page Scellés */
function SealedTile({ count }: { count: number }) {
  return (
    <Reveal className="md:col-span-6" delay={100}>
      <article className="panel grid gap-6 overflow-hidden p-6 md:grid-cols-[minmax(0,300px)_1fr] md:items-center">
        <div>
          <Kicker icon={Boxes}>Scellés</Kicker>
          <h3 className="display mt-2 text-xl font-bold tracking-tight">Coffrets, displays, tins.</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            <span className="num">{nf.format(count)}</span>&nbsp;produits avec leur cote et leur historique. Tu sais ce que vaut ta réserve, et ce qu&apos;elle a pris.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {SEALED.map((p, i) => (
            <li key={p.name} className="mk-pop overflow-hidden rounded-2xl bg-surface ring-1 ring-ring" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
              <div className="relative aspect-[4/3] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-2.5" />
                <span className="num absolute left-1.5 top-1.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{p.gain}</span>
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 text-xs font-semibold leading-tight">{p.name}</p>
                <p className="mt-0.5 text-[10px] text-muted">{p.kind}</p>
                <p className="num mt-1 text-xs font-bold">{p.cote}</p>
              </div>
            </li>
          ))}
        </ul>
      </article>
    </Reveal>
  );
}

const SHARE_CARDS = [CARD.dracaufeuEx, CARD.pikachu, CARD.pikachuEx, CARD.evoli, CARD.megaDracaufeu];

/** Maquette « vitrine » : le lien, copié, et ce que l'ami voit */
function ShareMock() {
  return (
    <div className="w-full">
      <div className="mk-pop flex items-center gap-2 rounded-full bg-raised px-3.5 py-2 text-xs text-muted ring-1 ring-ring">
        <Link2 size={13} className="shrink-0" aria-hidden />
        <span className="num min-w-0 truncate">tailtcg.vercel.app/vitrine/sacha</span>
        <span className="mk-pulse ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-gain/15 px-2 py-0.5 text-[10px] font-semibold text-gain">
          <Check size={10} strokeWidth={3} aria-hidden /> Copié
        </span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {SHARE_CARDS.map((b, i) => (
          <div key={b} className="mk-pop card-tile aspect-[63/88]" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
            <CardImage base={b} alt="" placeholder="compact" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Maquette « catalogue » : la recherche, les filtres de la vraie page, et ce qui va avec */
function CatalogueMock() {
  const facts: [IconType, string, string][] = [
    [Download, "Exports", "JSON et CSV"],
    [Smartphone, "Installable", "iPhone et Android"],
    [Check, "Gratuit", "sans pub"],
  ];
  return (
    <div className="w-full">
      <div className="mk-pop flex items-center gap-2 rounded-full bg-raised px-3.5 py-2 text-xs text-muted ring-1 ring-ring">
        <Search size={13} className="shrink-0" aria-hidden />
        <span className="truncate">pikachu 25 · mew ex 151 · SV4a 205</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          ["FR · EN", true],
          ["JA", false],
          ["Pokédex", false],
          ["Hors catalogue", false],
        ].map(([label, on], i) => (
          <span key={label as string} className="seg mk-pop rounded-full px-3 py-1 text-xs font-medium" data-on={on ? "true" : undefined} style={{ animationDelay: `${0.2 + i * 0.08}s` }}>
            {label as string}
            {label === "Pokédex" && <span className="num ml-1.5 text-muted">1025</span>}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {facts.map(([Icon, t, s], i) => (
          <div key={t} className="mk-pop rounded-xl bg-raised p-2.5" style={{ animationDelay: `${0.5 + i * 0.1}s` }}>
            <Icon size={14} aria-hidden />
            <p className="mt-1.5 text-xs font-semibold">{t}</p>
            <p className="text-[10px] leading-snug text-muted">{s}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

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
export function Landing({ stats, packs }: { stats: LandingStats; packs: PlayableSet[] }) {
  const faq: [string, string][] = [
    ["C'est vraiment gratuit ?", "Oui, sans pub ni abonnement. Le projet est fait par un collectionneur, pour les collectionneurs."],
    ["Mes données m'appartiennent ?", "Oui. Tu exportes tout en JSON ou CSV quand tu veux, et ta vitrine ne montre que ce que tu décides."],
    ["Et les cartes japonaises ?", `Le catalogue couvre ${nf.format(stats.jaSets)} extensions japonaises avec leurs scans, et la cote TCGplayer quand Cardmarket n'en a pas.`],
    ["Ça marche sur mon téléphone ?", "Le site s'installe comme une appli sur iPhone et Android, et le scan tourne directement sur l'appareil."],
  ];

  return (
    <div className="min-h-dvh">
      {/* En-tête */}
      <header className="sticky top-0 z-40 border-b border-edge bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo variant="lockup" size={30} />
          <div className="flex items-center gap-2">
            <span className="hidden sm:block">
              <Link href="/connexion" className="btn btn-ghost">
                Se connecter
              </Link>
            </span>
            <Link href="/inscription" className="btn btn-primary">
              <span className="hidden sm:inline">Créer ma collection</span>
              <span className="sm:hidden">Se connecter</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Héros */}
        <section className="grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:py-20">
          <div className="max-w-xl">
            <span className="rise-in inline-flex items-center gap-2 rounded-full bg-raised px-4 py-1.5 text-[13px] text-muted ring-1 ring-ring" style={{ animationDelay: "0.05s" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Gratuit · Sans pub · Fait par un collectionneur
            </span>
            <h1 className="display rise-in mt-5 text-[38px] font-bold leading-[1.04] tracking-tight sm:text-6xl" style={{ animationDelay: "0.15s" }}>
              Ta collection Pokémon,
              <br />
              <span className="text-accent-strong">enfin à sa hauteur.</span>
            </h1>
            <p className="rise-in mt-5 text-base leading-relaxed text-muted sm:text-lg" style={{ animationDelay: "0.28s" }}>
              Scanne tes cartes avec ton téléphone, suis leur <strong className="text-foreground">cote Cardmarket</strong> chaque nuit, range-les en{" "}
              <strong className="text-foreground">classeurs</strong> et partage ta <strong className="text-foreground">vitrine</strong>. Cartes et scellés,
              français et japonais.
            </p>
            <div className="rise-in mt-7 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.4s" }}>
              <Link href="/inscription" className="btn btn-primary !px-7 !py-3.5 text-base shadow-lg shadow-accent/30">
                Créer ma collection
                <ArrowRight size={16} aria-hidden />
              </Link>
              <a href="#fonctions" className="btn btn-ghost !px-6 !py-3.5 text-base">
                Voir ce que ça fait
              </a>
            </div>
            <ul className="rise-in mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" style={{ animationDelay: "0.5s" }}>
              {["100 % gratuit", "Catalogue FR & JP", "Installable sur ton téléphone", "Tes données t'appartiennent"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={12} className="text-gain" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <Reveal className="min-w-0">
            <AppWindow />
            <PhoneDashboard />
          </Reveal>
        </section>

        {/* Chiffres */}
        <Reveal>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
            <StatCard label="Au catalogue" value={nf.format(stats.cards)} sub="cartes FR et JP" />
            <StatCard label="Extensions" value={nf.format(stats.sets)} sub="de 1999 à aujourd'hui" />
            <StatCard label="Scellés suivis" value={nf.format(stats.sealed)} sub="coffrets et displays" />
            <StatCard label="Cote Cardmarket" value="Chaque nuit" sub="carte par carte" />
          </div>
        </Reveal>

        {/* Fonctions */}
        <section id="fonctions" className="scroll-mt-20 py-16 sm:py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className={KICKER}>Tout au même endroit</p>
            <h2 className="display mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">Le scan, la cote, les classeurs. Et le reste.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted">
              Pensé par un collectionneur qui en avait assez des tableurs : chaque carte a sa fiche, sa cote, sa place dans un classeur, et son histoire.
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-3.5 md:grid-cols-6">
            <Tile
              icon={ScanLine}
              kicker="Scan mains libres"
              title="Pointe, c'est ajouté."
              text="Reconnue sur ton téléphone parmi 94 000 cartes, en français comme en japonais, et ajoutée d'elle-même. Rien n'est envoyé sur un serveur."
              className="md:col-span-3"
            >
              <ScanRows />
            </Tile>
            <Tile
              icon={LineChart}
              kicker="Cote Cardmarket"
              title="La valeur, relevée chaque nuit."
              text="Valeur estimée, cote Cardmarket, plus-value depuis le prix payé : pour chaque carte, chaque scellé, et toute la collection sur une courbe."
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
              className="md:col-span-3"
            >
              <BinderMock />
            </Tile>
            <Tile
              icon={Gem}
              kicker="Pré-gradation"
              title="Note-la avant de l'envoyer."
              text="Recto, verso : centrage mesuré, coins, bords et surface, avec l'estimation chez PSA, PCA, CCC, CGC et BGS. Carte en boîtier à la fin."
              className="md:col-span-3"
              delay={100}
            >
              <GradingMock />
            </Tile>
            <SealedTile count={stats.sealed} />
            <Tile
              icon={Share2}
              kicker="Vitrine"
              title="Partage d'un lien."
              text="Une adresse à ton pseudo, en lecture seule, classeurs et scellés compris, avec un bel aperçu sur WhatsApp et Discord. Révocable quand tu veux."
              className="md:col-span-3"
            >
              <ShareMock />
            </Tile>
            <Tile
              icon={Database}
              kicker="Catalogue"
              title="FR, JP, Pokédex. Et c'est à toi."
              text={`${nf.format(stats.cards)} cartes, ${nf.format(stats.sets)} extensions, les produits scellés, le Pokédex à ranger. Exports JSON et CSV, aucune pub, aucun abonnement.`}
              className="md:col-span-3"
              delay={100}
            >
              <CatalogueMock />
            </Tile>
          </div>
        </section>

        {/* Boosters */}
        <Reveal>
          <section
            className="panel relative grid overflow-hidden md:grid-cols-[1.1fr_1fr] md:items-center"
            style={{ background: "radial-gradient(60% 70% at 70% 50%, hsl(268 70% 45% / .32), var(--surface) 70%)" }}
          >
            <div className="min-w-0 p-7 sm:p-9">
              <p className={KICKER}>Et pour souffler</p>
              <h2 className="display mt-3 text-balance text-2xl font-bold tracking-tight sm:text-3xl">Des boosters à ouvrir, sans toucher à ta vraie collection.</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
                <span className="num">{stats.playable}</span> sets jouables, cinq cartes par paquet, la cinquième toujours rare ou mieux. Collectionne, fais grader tes tirages,
                échange tes doubles avec les autres dresseurs.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link href="/inscription" className="btn btn-primary shadow-lg shadow-accent/30">
                  <Package size={15} aria-hidden /> Ouvrir un booster
                </Link>
                <a href="#etapes" className="btn btn-ghost">
                  Comment ça marche
                </a>
              </div>
            </div>
            <div className="flex min-w-0 items-end justify-center gap-3 px-5 pb-8 pt-2 sm:gap-4 md:py-8">
              {packs.map((set, i) => {
                const mid = i === 1;
                return (
                  <div key={set.id} className="mk-pop" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                    <div className={mid ? "w-[124px] -translate-y-1.5 sm:w-[150px]" : "w-[92px] translate-y-2.5 scale-90 opacity-55 sm:w-[110px]"}>
                      <PackArt set={set} shine={mid} cursor={false} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </Reveal>

        {/* Comment ça marche */}
        <section id="etapes" className="scroll-mt-20 py-16 sm:py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className={KICKER}>Comment ça marche</p>
            <h2 className="display mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">Trois gestes, et ta collection vit.</h2>
          </Reveal>
          <div className="mt-10 grid gap-3.5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <div className="panel h-full p-6">
                  <p className="display num text-3xl font-extrabold text-accent-strong">{s.n}</p>
                  <h3 className="display mt-3 text-lg font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Questions */}
        <section className="pb-16 sm:pb-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className={KICKER}>Questions</p>
            <h2 className="display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Avant de te lancer</h2>
          </Reveal>
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {faq.map(([q, a], i) => (
              <Reveal key={q} delay={i * 80}>
                <div className="panel h-full px-5 py-4.5">
                  <p className="font-semibold">{q}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Appel final */}
        <Reveal>
          <section
            className="panel relative overflow-hidden px-6 py-14 text-center sm:py-20"
            style={{ background: "radial-gradient(60% 80% at 50% 0%, color-mix(in srgb, var(--accent) 22%, transparent), var(--surface) 70%)" }}
          >
            <div className="relative">
              <div className="flex justify-center">
                <Logo variant="mark" size={56} />
              </div>
              <h2 className="display mx-auto mt-6 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-5xl">Prêt à donner à ta collection la place qu&apos;elle mérite ?</h2>
              <Link href="/inscription" className="btn btn-primary mt-8 !px-8 !py-3.5 text-base shadow-lg shadow-accent/30">
                Créer ma collection
                <ArrowRight size={16} aria-hidden />
              </Link>
              <p className="mt-4 text-xs text-muted">Sans engagement · Tes données t&apos;appartiennent (exports JSON &amp; CSV)</p>
            </div>
          </section>
        </Reveal>
        <div className="h-16" />
      </main>

      <footer className="border-t border-edge">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-7 text-xs text-muted sm:px-6">
          <span className="flex items-center gap-2">
            <Logo variant="mark" size={18} interactive={false} />
            TailTCG · Fait par un collectionneur, pour les collectionneurs
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <a href="https://tcgdex.dev" target="_blank" rel="noreferrer" className="transition hover:text-foreground">
              Catalogue TCGdex
            </a>
            <span aria-hidden>·</span>
            <span>Cotes Cardmarket &amp; TCGplayer</span>
            <span aria-hidden>·</span>
            <Link href="/connexion" className="transition hover:text-foreground">
              Se connecter
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
