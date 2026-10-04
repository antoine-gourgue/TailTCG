import { GameNav } from "@/components/game/game-nav";

type Current = Parameters<typeof GameNav>[0]["current"];

/**
 * Écran de chargement instantané d'un onglet Boosters : le titre et les
 * onglets s'affichent tout de suite (préchargés), le contenu arrive en
 * streaming. Une silhouette par type de page, pour éviter les sauts.
 */
export function GameLoading({ current, title, subtitle, variant }: { current: Current; title: string; subtitle: string; variant: "packs" | "grid" | "list" }) {
  return (
    <main className="page py-8" aria-busy="true">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-xs mb-1 text-muted">{current === "boosters" ? "Explorer" : "Boosters"}</p>
          <h1 className="display text-[28px] font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <GameNav current={current} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`h-[74px] animate-pulse rounded-2xl bg-raised ${i > 2 ? "hidden lg:block" : i > 1 ? "hidden sm:block" : ""}`} />
        ))}
      </div>

      {variant === "packs" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col items-center gap-5 rounded-3xl bg-surface p-5 ring-1 ring-ring">
            <div className="flex w-full gap-2">
              <div className="h-8 w-24 animate-pulse rounded-full bg-raised" />
              <div className="h-8 w-32 animate-pulse rounded-full bg-raised" />
            </div>
            <div className="flex w-full items-center justify-center gap-6 py-4">
              <div className="hidden aspect-[2/3] w-[150px] animate-pulse rounded-[12px] bg-raised/60 sm:block" />
              <div className="aspect-[2/3] w-[min(56vw,220px)] animate-pulse rounded-[14px] bg-raised" />
              <div className="hidden aspect-[2/3] w-[150px] animate-pulse rounded-[12px] bg-raised/60 sm:block" />
            </div>
            <div className="h-8 w-56 animate-pulse rounded-lg bg-raised" />
            <div className="h-12 w-full max-w-xs animate-pulse rounded-full bg-raised" />
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-48 animate-pulse rounded-3xl bg-raised" />
            <div className="h-64 animate-pulse rounded-3xl bg-raised" />
          </div>
        </div>
      )}

      {variant === "grid" && (
        <>
          <div className="mb-5 flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-raised" />
            ))}
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="h-24 animate-pulse rounded-3xl bg-raised" />
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="h-96 animate-pulse rounded-3xl bg-raised" />
            <div className="h-64 animate-pulse rounded-3xl bg-raised" />
          </div>
        </>
      )}
    </main>
  );
}
