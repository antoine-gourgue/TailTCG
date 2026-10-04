import Link from "next/link";
import { Check } from "lucide-react";
import { Logo } from "@/components/logo";
import { CardImage } from "@/components/card-image";
import { AuthForm } from "./auth-form";

/* Cartes réelles (catalogue TCGdex) de l'éventail */
const FAN = {
  left: "https://assets.tcgdex.net/fr/sv/sv03.5/025",
  center: "https://assets.tcgdex.net/fr/sv/sv03.5/199",
  right: "https://assets.tcgdex.net/fr/sv/sv03.5/133",
};

const PERKS = [
  "Scan de tes cartes avec ton téléphone",
  "Cote Cardmarket relevée chaque nuit",
  "Classeurs, scellés et vitrine à partager",
];

/** Trois cartes en éventail sur un halo : la centrale devant, les autres flottent */
function CardFan({ large = false }: { large?: boolean }) {
  const side = large ? "w-36 xl:w-40" : "w-[5.5rem]";
  const center = large ? "w-44 xl:w-52" : "w-28";
  return (
    <div className={`relative mx-auto flex items-end justify-center ${large ? "h-80 xl:h-96" : "h-44"}`} aria-hidden>
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 24%, transparent), transparent 62%)" }}
      />
      <div className={`${side} -mr-8 mb-3 -rotate-[13deg]`}>
        <div className="float-y" style={{ animationDelay: "0.6s" }}>
          <div className="card-tile aspect-[63/88] opacity-90">
            <CardImage base={FAN.left} alt="" />
          </div>
        </div>
      </div>
      <div className={`${center} relative z-10`}>
        <div className="card-tile aspect-[63/88] shadow-[0_24px_50px_rgba(0,0,0,.45)]">
          <CardImage base={FAN.center} alt="" quality={large ? "high" : "low"} />
        </div>
      </div>
      <div className={`${side} -ml-8 mb-3 rotate-[13deg]`}>
        <div className="float-y" style={{ animationDelay: "1.9s" }}>
          <div className="card-tile aspect-[63/88] opacity-90">
            <CardImage base={FAN.right} alt="" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Écran de connexion / d'inscription : sur grand écran, une vitrine (éventail
 * de cartes, promesse, atouts) à côté du formulaire ; sur mobile, la marque et
 * un petit éventail au-dessus du formulaire.
 */
export function AuthScreen({ mode, notice }: { mode: "login" | "signup"; notice?: string | null }) {
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Vitrine (grand écran) */}
      <section className="relative hidden overflow-hidden border-r border-edge bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <Link href="/" aria-label="TailTCG, accueil" className="self-start">
          <Logo variant="lockup" size={34} />
        </Link>
        <div className="mx-auto w-full max-w-lg">
          <CardFan large />
          <h2 className="display mt-14 text-4xl font-bold leading-[1.08] tracking-tight xl:text-5xl">
            Ta collection Pokémon,
            <br />
            <span className="text-accent-strong">enfin à sa hauteur.</span>
          </h2>
          <ul className="mt-7 flex flex-col gap-3 text-[15px] text-muted">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gain/15 text-gain">
                  <Check size={13} strokeWidth={2.6} aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-faint">Gratuit · Sans pub · Tes données t&apos;appartiennent (exports JSON &amp; CSV)</p>
      </section>

      {/* Formulaire */}
      <section className="flex min-h-dvh flex-col overflow-x-clip px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center justify-between lg:justify-end">
          <Link href="/" aria-label="TailTCG, accueil" className="lg:hidden">
            <Logo variant="lockup" size={28} />
          </Link>
          <Link href="/" className="text-sm text-muted transition hover:text-foreground">
            Découvrir TailTCG
          </Link>
        </header>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          <div className="mb-8 lg:hidden">
            <CardFan />
          </div>
          <AuthForm mode={mode} notice={notice} />
        </div>

        <p className="text-center text-xs text-faint lg:hidden">Gratuit · Sans pub · Tes données t&apos;appartiennent</p>
      </section>
    </main>
  );
}
