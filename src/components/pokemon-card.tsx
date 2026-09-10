import { artworkUrl, dexNumber, TYPE_COLOR } from "@/lib/pokedex";

export type PokemonCardData = { id: number; name: string; types: string[] };

/**
 * Carte Pokédex au format carte à jouer : nom en haut, artwork au centre,
 * numéro en bas. Halo et liseré aux couleurs du type. Tout est en unités de
 * conteneur : la carte se met à l'échelle de la largeur qu'on lui donne.
 */
export function PokemonCard({ p, priority = false }: { p: PokemonCardData; priority?: boolean }) {
  const main = TYPE_COLOR[p.types[0]] ?? "#8b8f9a";
  const second = TYPE_COLOR[p.types[1]] ?? main;
  return (
    <div className="@container h-full w-full">
      <div
        className="relative flex aspect-[63/88] w-full flex-col overflow-hidden rounded-[4.5%/3.5%] border border-white/10 text-white"
        style={{
          background: `
            radial-gradient(70% 55% at 50% 52%, color-mix(in srgb, ${main} 45%, transparent), transparent 100%),
            linear-gradient(160deg, color-mix(in srgb, ${main} 26%, #17161a), color-mix(in srgb, ${second} 14%, #101013) 60%, #0e0d10)`,
        }}
      >
        {/* Liseré intérieur */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[3.5cqw] rounded-[4cqw] border-[0.5cqw]"
          style={{ borderColor: `color-mix(in srgb, ${main} 55%, transparent)` }}
        />

        {/* Nom */}
        <div className="relative z-10 px-[9cqw] pt-[8cqw]">
          <p className="display truncate text-center text-[9cqw] font-bold leading-none tracking-tight">
            {p.name}
          </p>
        </div>

        {/* Artwork */}
        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-[10cqw] py-[4cqw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artworkUrl(p.id)}
            alt={p.name}
            loading={priority ? "eager" : "lazy"}
            draggable={false}
            className="max-h-full max-w-full object-contain drop-shadow-[0_12cqw_16cqw_rgba(0,0,0,.55)]"
          />
        </div>

        {/* Numéro */}
        <div className="relative z-10 px-[9cqw] pb-[8cqw]">
          <p className="num text-center text-[7.5cqw] font-semibold leading-none text-white/85">
            <span className="text-white/45">N°</span> {dexNumber(p.id)}
          </p>
        </div>
      </div>
    </div>
  );
}
