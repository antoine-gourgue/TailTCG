import { Logo } from "@/components/logo";

/**
 * Écran de chargement TailTCG (logo animé + trois points), affiché par les
 * `loading.tsx` pendant qu'une page prépare toutes ses données : rien
 * d'autre ne s'affiche tant que tout n'est pas là.
 */
export function PageLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5">
      <span className="logo-loader">
        <Logo variant="mark" size={76} interactive={false} />
      </span>
      <span className="flex items-center gap-1" aria-label="Chargement">
        <span className="loader-dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="loader-dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="loader-dot h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    </div>
  );
}

/** Le même loader, en petit, pour une zone qui charge dans la page (liste, résultats) */
export function InlineLoader({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`} role="status" aria-label="Chargement">
      <span className="logo-loader">
        <Logo variant="mark" size={40} interactive={false} />
      </span>
      <span className="flex items-center gap-1" aria-hidden>
        <span className="loader-dot h-1 w-1 rounded-full bg-accent" />
        <span className="loader-dot h-1 w-1 rounded-full bg-accent" />
        <span className="loader-dot h-1 w-1 rounded-full bg-accent" />
      </span>
    </div>
  );
}
