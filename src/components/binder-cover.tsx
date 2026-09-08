import { NotebookTabs } from "lucide-react";
import { binderStyle } from "@/lib/binder-styles";
import { coverTextureClass, type CoverTexture } from "@/lib/binder-design";
import {
  ZONES,
  coverHasContent,
  type CoverRender,
  type RenderElement,
  type ZoneKey,
} from "@/lib/binder-cover";
import { CardImage } from "@/components/card-image";

export type CoverItem = { image_url: string };

/** Calque de matière (cuir, tissu, holo…) posé sur la couverture */
function Texture({ texture }: { texture?: CoverTexture }) {
  const cls = coverTextureClass(texture ?? "plain");
  if (!cls) return null;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-10 rounded-[inherit] ${cls}`}
    />
  );
}

/** Teinte translucide dérivée de la couleur de tranche (#rrggbb + alpha) */
function tint(hex: string | null, alpha: string): string | undefined {
  return hex ? `${hex}${alpha}` : undefined;
}

function EmptyPocket() {
  return (
    <div className="aspect-[63/88] rounded-lg border border-dashed border-edge bg-raised/50" />
  );
}

type StyleProps = {
  covers: CoverItem[];
  name: string;
  colorHex: string | null;
  /** Remplit son conteneur (classeur fermé à la taille des pages) */
  fill?: boolean;
  /** Matière de la couverture */
  texture?: CoverTexture;
  /** Couverture sur mesure, résolue (URLs signées) */
  layout?: CoverRender | null;
};

/** Alignement d'une zone : ligne (haut/milieu/bas) × colonne (gauche/centre/droite) */
function zoneClass(z: ZoneKey): string {
  const row = z[0] === "t" ? "items-start" : z[0] === "m" ? "items-center" : "items-end";
  const col =
    z[1] === "l"
      ? "justify-start text-left"
      : z[1] === "c"
        ? "justify-center text-center"
        : "justify-end text-right";
  return `${row} ${col}`;
}

const TEXT_SIZE_CLASS = {
  sm: "text-[4.5cqw]",
  md: "text-[6.5cqw]",
  lg: "text-[9cqw]",
  xl: "text-[13cqw]",
} as const;
const FONT_CLASS = { display: "display", sans: "", mono: "font-mono" } as const;
const MEDIA_WIDTH = { sm: "w-[22cqw]", md: "w-[34cqw]", lg: "w-[48cqw]" } as const;
const CARD_WIDTH = { sm: "w-[22cqw]", md: "w-[32cqw]", lg: "w-[44cqw]" } as const;

function CoverElementView({ el }: { el: RenderElement }) {
  if (el.type === "text") {
    return (
      <span
        className={`${FONT_CLASS[el.font]} ${TEXT_SIZE_CLASS[el.size]} ${
          el.weight === "bold" ? "font-bold" : "font-normal"
        } max-w-[88cqw] shrink-0 break-words leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,.45)]`}
        style={{ color: el.color }}
      >
        {el.text}
      </span>
    );
  }
  if (el.type === "logo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${el.url}.png`}
        alt=""
        loading="lazy"
        className={`${MEDIA_WIDTH[el.size]} shrink-0 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,.5)]`}
      />
    );
  }
  if (el.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={el.url}
        alt=""
        loading="lazy"
        className={`${MEDIA_WIDTH[el.size]} aspect-square shrink-0 object-cover shadow-lg ${
          el.round ? "rounded-full" : "rounded-[2cqw]"
        }`}
      />
    );
  }
  return (
    <div className={`card-tile aspect-[63/88] ${CARD_WIDTH[el.size]} shrink-0`}>
      <CardImage base={el.url || null} alt="" />
    </div>
  );
}

/** Sur mesure : fond (couleur, image, carte) et neuf zones composées par l'utilisateur */
function StyleCustom({ name, colorHex, fill, texture, layout }: StyleProps) {
  const bg = layout?.bg;
  const hasContent = coverHasContent(layout);
  return (
    <div
      className="relative aspect-[63/88] overflow-hidden rounded-l-lg rounded-r-xl border border-edge bg-raised [container-type:inline-size]"
      style={{ backgroundColor: bg?.color ?? colorHex ?? undefined, ...fillStyle(fill) }}
    >
      {bg?.imageUrl &&
        (bg.imageIsCard ? (
          <div className="absolute inset-0">
            <CardImage base={bg.imageUrl} alt="" quality="high" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ))}
      {bg?.imageUrl && bg.dim > 0 && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundColor: `rgba(0,0,0,${bg.dim / 100})` }}
        />
      )}
      {/* Pli de la couverture, côté tranche */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[7cqw] bg-gradient-to-r from-black/35 to-transparent"
      />
      <Texture texture={texture} />
      {/* Neuf zones égales ; chaque élément garde sa taille et déborde de sa
          zone si besoin (un titre centré s'étale symétriquement) */}
      {hasContent && layout ? (
        <div className="absolute inset-0 z-20 grid grid-cols-3 grid-rows-3 gap-[3cqw] p-[6cqw] pl-[8cqw]">
          {ZONES.map((z) => {
            const el = layout.zones[z];
            return (
              <div key={z} className={`flex min-w-0 ${zoneClass(z)}`}>
                {el && <CoverElementView el={el} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-[10cqw]">
          <span className="display text-center text-[9cqw] font-bold leading-tight text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,.5)]">
            {name}
          </span>
        </div>
      )}
    </div>
  );
}

/** Le conteneur dicte la taille au lieu des proportions d'une carte */
function fillStyle(fill?: boolean): React.CSSProperties | undefined {
  return fill ? { aspectRatio: "auto", height: "100%" } : undefined;
}

/** Classeur : tranche perforée + page de pochettes 2×2 */
function StyleBinder({ covers, name, colorHex, fill, texture }: StyleProps) {
  return (
    <div
      className="relative aspect-[63/88] overflow-hidden rounded-l-lg rounded-r-xl border border-edge bg-surface"
      style={fillStyle(fill)}
    >
      <Texture texture={texture} />
      <div
        className="absolute inset-y-0 left-0 flex w-7 flex-col items-center justify-evenly border-r border-edge bg-raised py-3"
        style={colorHex ? { backgroundColor: colorHex } : undefined}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full border border-edge-strong bg-surface"
            aria-hidden
          />
        ))}
      </div>
      <div className="ml-7 flex h-full items-center p-2.5">
        <div className="grid w-full grid-cols-2 gap-1.5 rounded-lg bg-raised/40 p-2 ring-1 ring-edge/60">
          {[0, 1, 2, 3].map((i) =>
            covers[i] ? (
              <div key={i} className="card-tile relative aspect-[63/88]">
                <CardImage base={covers[i].image_url || null} alt={name} />
                <span
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-transparent"
                  aria-hidden
                />
              </div>
            ) : (
              <EmptyPocket key={i} />
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** Mosaïque : quatre cartes en grille nue, fond très légèrement teinté */
function StyleMosaic({ covers, name, colorHex, fill, texture }: StyleProps) {
  return (
    <div
      className="relative flex aspect-[63/88] items-center rounded-xl p-2"
      style={{ backgroundColor: tint(colorHex, "1f"), ...fillStyle(fill) }}
    >
      <Texture texture={texture} />
      <div className="grid w-full grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) =>
          covers[i] ? (
            <div key={i} className="card-tile aspect-[63/88]">
              <CardImage base={covers[i].image_url || null} alt={name} />
            </div>
          ) : (
            <EmptyPocket key={i} />
          )
        )}
      </div>
    </div>
  );
}

/** Vitrine : une carte star sur un halo de couleur */
function StyleShowcase({ covers, name, colorHex, fill, texture }: StyleProps) {
  return (
    <div
      className="relative flex aspect-[63/88] items-center justify-center overflow-hidden rounded-xl border border-edge bg-raised/60"
      style={{
        ...fillStyle(fill),
        backgroundImage: colorHex
          ? `radial-gradient(ellipse at 50% 35%, ${colorHex}59, transparent 70%)`
          : undefined,
      }}
    >
      <Texture texture={texture} />
      {covers[0] ? (
        <div className="card-tile aspect-[63/88] w-[62%] shadow-xl transition-transform duration-300 group-hover:scale-[1.03]">
          <CardImage
            base={covers[0].image_url || null}
            alt={name}
            quality="high"
          />
        </div>
      ) : (
        <NotebookTabs size={40} strokeWidth={1.2} className="text-faint" aria-hidden />
      )}
    </div>
  );
}

/** Éventail : trois cartes en main, pivotées autour d'un point sous
 * l'éventail comme des cartes tenues entre les doigts */
function StyleFan({ covers, name, colorHex, fill, texture }: StyleProps) {
  const shown = covers.slice(0, 3);
  return (
    <div
      className="relative aspect-[63/88] overflow-hidden rounded-xl border border-edge bg-raised/60 transition-transform duration-300 group-hover:scale-[1.02]"
      style={{
        ...fillStyle(fill),
        backgroundImage: colorHex
          ? `radial-gradient(ellipse at 50% 60%, ${colorHex}47, transparent 72%)`
          : undefined,
      }}
    >
      <Texture texture={texture} />
      {shown.length === 0 && (
        <span className="absolute inset-0 flex items-center justify-center text-faint">
          <NotebookTabs size={40} strokeWidth={1.2} aria-hidden />
        </span>
      )}
      {shown.length === 1 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="card-tile aspect-[63/88] w-[62%] shadow-xl">
            <CardImage base={shown[0].image_url || null} alt={name} />
          </div>
        </div>
      )}
      {shown.length === 2 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="card-tile aspect-[63/88] w-[52%] shrink-0 -rotate-6 shadow-xl">
            <CardImage base={shown[0].image_url || null} alt={name} />
          </div>
          <div className="card-tile z-10 -ml-[14%] aspect-[63/88] w-[52%] shrink-0 rotate-6 shadow-xl">
            <CardImage base={shown[1].image_url || null} alt={name} />
          </div>
        </div>
      )}
      {shown.length === 3 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="card-tile aspect-[63/88] w-[42%] shrink-0 -rotate-[10deg] translate-y-[5%] shadow-xl">
            <CardImage base={shown[0].image_url || null} alt={name} />
          </div>
          <div className="card-tile z-10 -mx-[7%] aspect-[63/88] w-[42%] shrink-0 -translate-y-[2%] shadow-xl">
            <CardImage base={shown[1].image_url || null} alt={name} />
          </div>
          <div className="card-tile aspect-[63/88] w-[42%] shrink-0 rotate-[10deg] translate-y-[5%] shadow-xl">
            <CardImage base={shown[2].image_url || null} alt={name} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Étiquette : couverture pleine couleur, étiquette papier au centre */
function StyleLabel({
  name,
  colorHex,
  fill,
  texture,
}: {
  name: string;
  colorHex: string | null;
  fill?: boolean;
  texture?: CoverTexture;
}) {
  return (
    <div
      className="relative flex aspect-[63/88] items-center justify-center overflow-hidden rounded-l-md rounded-r-xl border border-edge bg-raised"
      style={{ backgroundColor: colorHex ?? undefined, ...fillStyle(fill) }}
    >
      <Texture texture={texture} />
      <span
        className="absolute inset-y-0 left-0 w-2.5 bg-black/20"
        aria-hidden
      />
      <span
        className="absolute inset-y-0 left-2.5 w-px bg-white/20"
        aria-hidden
      />
      <div className="mx-6 w-full max-w-[70%] rounded-md bg-[#f5f1e6] px-3 py-4 text-center shadow-md">
        <p className="display truncate text-base font-bold text-[#1f1f1f]">
          {name}
        </p>
      </div>
    </div>
  );
}

/**
 * Couverture d'un classeur — le rendu s'adapte au style choisi.
 * Toujours enveloppée dans un lien `group` : les styles utilisent
 * group-hover pour leurs micro-animations.
 */
export function BinderCover({
  style,
  covers,
  name,
  colorHex,
  fill,
  texture,
  layout,
}: {
  style: string | null;
  covers: CoverItem[];
  name: string;
  colorHex: string | null;
  /** Remplit son conteneur (classeur fermé à la taille exacte des pages) */
  fill?: boolean;
  /** Matière de la couverture (lisse par défaut) */
  texture?: CoverTexture;
  /** Couverture sur mesure résolue — style « custom » */
  layout?: CoverRender | null;
}) {
  const kind = binderStyle(style);
  const props = { covers, name, colorHex, fill, texture, layout };
  if (kind === "custom") return <StyleCustom {...props} />;
  if (kind === "mosaic") return <StyleMosaic {...props} />;
  if (kind === "showcase") return <StyleShowcase {...props} />;
  if (kind === "fan") return <StyleFan {...props} />;
  if (kind === "label")
    return <StyleLabel name={name} colorHex={colorHex} fill={fill} texture={texture} />;
  return <StyleBinder {...props} />;
}
