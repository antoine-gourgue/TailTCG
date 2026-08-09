import { Logo } from "@/components/logo";

// Écran de chargement global (App Router) : logo animé pendant que la
// page suivante prépare ses données
export default function Loading() {
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
