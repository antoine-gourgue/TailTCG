// Vocabulaire métier partagé entre formulaires, filtres et validation serveur.

export const CONDITIONS = [
  { code: "MT", label: "parfaite" },
  { code: "NM", label: "quasi parfaite" },
  { code: "EX", label: "défauts très légers" },
  { code: "GD", label: "défauts visibles" },
  { code: "LP", label: "usée" },
  { code: "PL", label: "très usée" },
  { code: "PO", label: "abîmée" },
] as const;

export type ConditionCode = (typeof CONDITIONS)[number]["code"];

export const CONDITION_CODES = CONDITIONS.map((c) => c.code);

export const CARD_TYPES = ["Normale", "Holo", "Reverse", "Prime", "Promo"] as const;

export const LANGUAGES = ["FR", "EN", "JP", "DE", "IT", "ES"] as const;

/** Date ISO (AAAA-MM-JJ) d'il y a n jours */
export function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function formatEur(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}
