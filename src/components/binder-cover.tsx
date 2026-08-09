import { NotebookTabs } from "lucide-react";
import { binderStyle } from "@/lib/binder-styles";
import { CardImage } from "@/components/card-image";

export type CoverItem = { image_url: string };

/** Teinte translucide dérivée de la couleur de tranche (#rrggbb + alpha) */
function tint(hex: string | null, alpha: string): string | undefined {
  return hex ? `${hex}${alpha}` : undefined;
}

function EmptyPocket() {
  return (
    <div className="aspect-[63/88] rounded-lg border border-dashed border-edge bg-raised/50" />
  );
}

/** Classeur : tranche perforée + page de pochettes 2×2 */
function StyleBinder({
  covers,
  name,
  colorHex,
}: {
  covers: CoverItem[];
  name: string;
  colorHex: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-l-lg rounded-r-xl border border-edge bg-surface">
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
      <div className="ml-7 p-2.5">
        <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-raised/40 p-2 ring-1 ring-edge/60">
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
function StyleMosaic({
  covers,
  name,
  colorHex,
}: {
  covers: CoverItem[];
  name: string;
  colorHex: string | null;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-1.5 rounded-xl p-2"
      style={{ backgroundColor: tint(colorHex, "1f") }}
    >
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
  );
}

/** Vitrine : une carte star sur un halo de couleur */
function StyleShowcase({
  covers,
  name,
  colorHex,
}: {
  covers: CoverItem[];
  name: string;
  colorHex: string | null;
}) {
  return (
    <div
      className="relative flex aspect-[63/88] items-center justify-center overflow-hidden rounded-xl border border-edge bg-raised/60"
      style={
        colorHex
          ? {
              backgroundImage: `radial-gradient(ellipse at 50% 35%, ${colorHex}59, transparent 70%)`,
            }
          : undefined
      }
    >
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
function StyleFan({
  covers,
  name,
  colorHex,
}: {
  covers: CoverItem[];
  name: string;
  colorHex: string | null;
}) {
  const shown = covers.slice(0, 3);
  return (
    <div
      className="relative aspect-[63/88] overflow-hidden rounded-xl border border-edge bg-raised/60 transition-transform duration-300 group-hover:scale-[1.02]"
      style={
        colorHex
          ? {
              backgroundImage: `radial-gradient(ellipse at 50% 60%, ${colorHex}47, transparent 72%)`,
            }
          : undefined
      }
    >
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
}: {
  name: string;
  colorHex: string | null;
}) {
  return (
    <div
      className="relative flex aspect-[63/88] items-center justify-center overflow-hidden rounded-l-md rounded-r-xl border border-edge bg-raised"
      style={colorHex ? { backgroundColor: colorHex } : undefined}
    >
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
}: {
  style: string | null;
  covers: CoverItem[];
  name: string;
  colorHex: string | null;
}) {
  const kind = binderStyle(style);
  if (kind === "mosaic")
    return <StyleMosaic covers={covers} name={name} colorHex={colorHex} />;
  if (kind === "showcase")
    return <StyleShowcase covers={covers} name={name} colorHex={colorHex} />;
  if (kind === "fan")
    return <StyleFan covers={covers} name={name} colorHex={colorHex} />;
  if (kind === "label") return <StyleLabel name={name} colorHex={colorHex} />;
  return <StyleBinder covers={covers} name={name} colorHex={colorHex} />;
}
