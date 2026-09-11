import { AppShell } from "@/components/app-shell";

// Coque commune de la section Boosters : reste montée pendant qu'on passe
// d'un onglet à l'autre, seul le contenu change (avec son écran de
// chargement instantané, voir les loading.tsx)
export default function BoostersLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
