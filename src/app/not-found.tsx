import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata = {
  title: "Page introuvable — TailTCG",
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <Logo variant="mark" size={44} />
      <p className="label-xs mt-8 text-muted">Erreur 404</p>
      <h1 className="display mt-2 text-3xl font-bold tracking-tight">
        Cette carte n&apos;est pas dans le classeur
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted">
        La page que tu cherches n&apos;existe pas, ou elle a changé de place.
      </p>
      <Link href="/" className="btn btn-primary mt-8">
        Retour à la collection
      </Link>
    </main>
  );
}
