import { GameNav } from "@/components/game/game-nav";

type Current = Parameters<typeof GameNav>[0]["current"];

/**
 * Écran de chargement instantané d'un onglet Boosters : le titre et les
 * onglets s'affichent tout de suite (préchargés), le contenu arrive en
 * streaming. Une silhouette par type de page, pour éviter les sauts.
 */
export function GameLoading({
  current,
  title,
  subtitle,
  variant,
}: {
  current: Current;
  title: string;
  subtitle: string;
  variant: "packs" | "grid" | "list";
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8" aria-busy="true">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display mb-1 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        <GameNav current={current} />
      </div>

      {variant === "packs" && (
        <div className="flex flex-col items-center gap-5">
          <div className="h-11 w-44 animate-pulse rounded-full bg-raised" />
          <div className="flex w-full items-center justify-center gap-[5vw] py-6">
            <div className="hidden aspect-[2/3] w-[min(50vw,216px)] animate-pulse rounded-[12px] bg-raised/60 sm:block" />
            <div className="aspect-[2/3] w-[min(70vw,300px)] animate-pulse rounded-[14px] bg-raised" />
            <div className="hidden aspect-[2/3] w-[min(50vw,216px)] animate-pulse rounded-[12px] bg-raised/60 sm:block" />
          </div>
          <div className="h-8 w-56 animate-pulse rounded-lg bg-raised" />
          <div className="h-12 w-full max-w-xs animate-pulse rounded-xl bg-raised sm:w-56" />
        </div>
      )}

      {variant === "grid" && (
        <>
          <div className="mb-5 h-9 w-64 animate-pulse rounded-lg bg-raised" />
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <li key={i} className="aspect-[63/88] animate-pulse rounded-[4.5%/3.5%] bg-raised" />
            ))}
          </ul>
        </>
      )}

      {variant === "list" && (
        <>
          <div className="mb-5 flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-raised" />
            ))}
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="h-24 animate-pulse rounded-2xl bg-raised" />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
