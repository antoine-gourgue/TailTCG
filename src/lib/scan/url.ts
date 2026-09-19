import type { CatalogLang } from "@/lib/tcgdex";

/** Langue du visuel reconnu (catalogues TCGdex indexés pour le scan) */
export type ScanLang = CatalogLang;
export const SCAN_LANGS: readonly ScanLang[] = ["fr", "en", "ja", "de", "es", "it"];

/** Langue d'exemplaire (formulaire d'ajout) correspondant à la langue du visuel */
export const ITEM_LANGUAGE: Record<ScanLang, "FR" | "EN" | "JP" | "DE" | "ES" | "IT"> = {
  fr: "FR",
  en: "EN",
  ja: "JP",
  de: "DE",
  es: "ES",
  it: "IT",
};

export function isScanLang(v: unknown): v is ScanLang {
  return typeof v === "string" && (SCAN_LANGS as readonly string[]).includes(v);
}

/**
 * Fiche d'ajout d'une carte reconnue : la carte est montrée dans la langue
 * scannée (nom, visuel) et la langue de l'exemplaire est présélectionnée.
 */
export function addCardUrl(c: { id: string; lang?: string | null; scan?: string | null }): string {
  const p = new URLSearchParams({ card: c.id });
  if (isScanLang(c.lang) && c.lang !== "fr") p.set("lang", c.lang);
  // Carte scannée depuis le téléphone : la fiche enchaîne sur la suivante
  if (c.scan) p.set("scan", c.scan);
  return `/ajouter?${p.toString()}`;
}
