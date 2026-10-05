/**
 * Formats du back-office, sans dépendance au moment du rendu : `now` vient
 * du chargement des données (un composant ne lit pas l'horloge).
 */

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DAY = 86_400_000;

/** « 5 oct. », sans l'année si c'est l'année en cours */
export function shortDate(iso: string | null | undefined, now?: number): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  const sameYear = now == null || new Date(now).getFullYear() === d.getFullYear();
  return `${d.getDate()} ${MOIS[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
}

/** « 05/10 » */
export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** « 08:00 », heure de Paris */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

/** « il y a 2 h », « hier », « il y a 12 j », « le 11 août » */
export function relTime(iso: string | null | undefined, now: number): string {
  if (!iso) return "jamais";
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (diff < 60 * 60_000) return `il y a ${Math.max(1, Math.round(diff / 60_000))} min`;
  const today = new Date(now).toISOString().slice(0, 10);
  const day = new Date(t).toISOString().slice(0, 10);
  if (day === today) return `il y a ${Math.round(diff / 3_600_000)} h`;
  if (day === new Date(now - DAY).toISOString().slice(0, 10)) return "hier";
  const days = Math.round(diff / DAY);
  if (days < 30) return `il y a ${days} j`;
  return `le ${shortDate(iso, now)}`;
}

/** Fraîcheur d'une activité : vert sous 24 h, ambre sous 15 j, éteint au-delà */
export function activityTone(iso: string | null | undefined, now: number): "ok" | "warn" | "off" {
  if (!iso) return "off";
  const days = (now - new Date(iso).getTime()) / DAY;
  return days <= 1 ? "ok" : days <= 15 ? "warn" : "off";
}

/** Endormi : aucune activité depuis 30 jours */
export function isDormant(iso: string | null | undefined, now: number): boolean {
  return !iso || now - new Date(iso).getTime() > 30 * DAY;
}

export const fmtInt = (n: number) => n.toLocaleString("fr-FR");

/** Masque une adresse : « ant•••••@gmail.com » */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 3)}•••••@${domain}`;
}

/** Teinte d'un set, même formule que l'emballage des boosters (`hueOf` de pack-art) */
export function packHue(id: string): number {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
