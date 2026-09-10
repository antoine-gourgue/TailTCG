import { dexNumber, generationLabel, type PokedexEntry } from "@/lib/pokedex";
import { PrintToolbar } from "@/components/print-toolbar";

/**
 * Carte d'impression : même mise en page que PokemonCard, mais fond et
 * artwork viennent d'un seul JPEG (/api/pokedex/print/<id>) pour garder un
 * PDF léger ; nom et numéro restent du texte vectoriel.
 */
function PrintCard({ p }: { p: PokedexEntry }) {
  return (
    <div className="@container h-full w-full">
      <div className="relative flex aspect-[63/88] w-full flex-col overflow-hidden rounded-[4.5%/3.5%] bg-[#0e0d10] text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/pokedex/print/${p.id}`}
          alt=""
          loading="eager"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative z-10 px-[9cqw] pt-[8cqw]">
          <p className="display truncate text-center text-[9cqw] font-bold leading-none tracking-tight">
            {p.name}
          </p>
        </div>
        <div className="min-h-0 flex-1" />
        <div className="relative z-10 px-[9cqw] pb-[8cqw]">
          <p className="num text-center text-[7.5cqw] font-semibold leading-none text-white/85">
            <span className="text-white/45">N°</span> {dexNumber(p.id)}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Cartes au format réel (63 × 88 mm), 9 par page A4, repères de coupe */
const PER_PAGE = 9;
const CARD = { w: 63, h: 88 };
const GAP = { x: 6, y: 7 };
const MARK = 3.5;
const OFF = `${MARK + 0.8}mm`;

function CropMarks() {
  const line = "absolute bg-neutral-400";
  const h = { height: "0.2mm", width: `${MARK}mm` };
  const v = { width: "0.2mm", height: `${MARK}mm` };
  return (
    <>
      <span aria-hidden className={line} style={{ ...h, top: 0, left: `-${OFF}` }} />
      <span aria-hidden className={line} style={{ ...v, left: 0, top: `-${OFF}` }} />
      <span aria-hidden className={line} style={{ ...h, top: 0, right: `-${OFF}` }} />
      <span aria-hidden className={line} style={{ ...v, right: 0, top: `-${OFF}` }} />
      <span aria-hidden className={line} style={{ ...h, bottom: 0, left: `-${OFF}` }} />
      <span aria-hidden className={line} style={{ ...v, left: 0, bottom: `-${OFF}` }} />
      <span aria-hidden className={line} style={{ ...h, bottom: 0, right: `-${OFF}` }} />
      <span aria-hidden className={line} style={{ ...v, right: 0, bottom: `-${OFF}` }} />
    </>
  );
}

/**
 * Planches d'impression d'une génération : pages A4 blanches, cartes à
 * taille réelle et repères de coupe dans les marges. À l'écran, les pages
 * s'empilent avec une ombre ; à l'impression, une page = une feuille.
 */
export function PokedexPrint({ list, gen }: { list: PokedexEntry[]; gen: number }) {
  const pages: PokedexEntry[][] = [];
  for (let i = 0; i < list.length; i += PER_PAGE) pages.push(list.slice(i, i + PER_PAGE));

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        .print-page {
          width: 210mm; height: 297mm;
          display: grid;
          grid-template-columns: repeat(3, ${CARD.w}mm);
          grid-auto-rows: ${CARD.h}mm;
          column-gap: ${GAP.x}mm; row-gap: ${GAP.y}mm;
          justify-content: center; align-content: center;
          break-after: page; page-break-after: always;
          background: #fff;
        }
        .print-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          html, body { background: #fff !important; margin: 0; }
          .no-print { display: none !important; }
          .print-sheet { gap: 0 !important; padding: 0 !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
      <PrintToolbar
        back="/extensions/pokedex"
        title={`Pokédex · ${generationLabel(gen)}`}
        hint={`${list.length} cartes · ${pages.length} pages A4 · 63 × 88 mm, repères de coupe`}
      />
      <div className="print-sheet flex flex-col items-center gap-6 py-6">
        {pages.map((page, i) => (
          <section key={i} className="print-page shadow-xl" aria-label={`Page ${i + 1}`}>
            {page.map((p) => (
              <div
                key={p.id}
                className="relative"
                style={{ width: `${CARD.w}mm`, height: `${CARD.h}mm` }}
              >
                <PrintCard p={p} />
                <CropMarks />
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
