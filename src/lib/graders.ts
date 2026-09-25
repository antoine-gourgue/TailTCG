/**
 * Barèmes des sociétés de gradation, pour estimer la note qu'une carte
 * obtiendrait chez chacune à partir des mesures de la pré-gradation.
 *
 * Seul le centrage est mesuré objectivement (ratios recto/verso) ; coins,
 * bords et surface viennent des sous-notes de l'atelier (1–10). La note
 * finale est plafonnée par le pire critère, comme chez tous les graders.
 *
 * Sources : PSA (gradingstandards), CGC (grading-scale), Beckett (BGS) ;
 * PCA et CCC ne publient pas de tolérances complètes — barème aligné sur
 * ce qu'ils annoncent, marqué `published: false` et présenté comme tel.
 */

export type GraderId = "psa" | "bgs" | "cgc" | "pca" | "ccc";

/** Plafond de note selon le pire écart de centrage (en % du côté le plus large), trié du plus strict au plus tolérant */
type CenteringRule = { max: number; grade: number };

export type Grader = {
  id: GraderId;
  name: string;
  /** libellé court affiché dans les tableaux */
  short: string;
  country: string;
  /** notes possibles, de la meilleure à la pire */
  scale: number[];
  labels: Record<string, string>;
  centeringFront: CenteringRule[];
  centeringBack: CenteringRule[];
  /** tolérances officielles publiées ? */
  published: boolean;
  note: string;
  url: string;
};

const PSA_LABELS = { 10: "Gem Mint", 9: "Mint", 8: "NM-MT", 7: "NM", 6: "EX-MT", 5: "EX", 4: "VG-EX", 3: "VG", 2: "Good", 1: "Poor" };

export const GRADERS: Grader[] = [
  {
    id: "psa",
    name: "PSA",
    short: "PSA",
    country: "États-Unis",
    scale: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    labels: PSA_LABELS,
    // Recto : 60/40 max pour un 10, 65/35 pour un 9, 70/30 pour un 8, 80/20 pour un 6…
    centeringFront: [
      { max: 60, grade: 10 },
      { max: 65, grade: 9 },
      { max: 70, grade: 8 },
      { max: 75, grade: 7 },
      { max: 80, grade: 6 },
      { max: 85, grade: 5 },
      { max: 90, grade: 3 },
      { max: 100, grade: 2 },
    ],
    // Verso : 75/25 pour un 10, 90/10 jusqu'au 5
    centeringBack: [
      { max: 75, grade: 10 },
      { max: 90, grade: 9 },
      { max: 100, grade: 3 },
    ],
    published: true,
    note: "Notes entières. Un 10 exige quatre coins parfaitement nets, le brillant d'origine et un centrage 55/45 à 60/40.",
    url: "https://www.psacard.com/gradingstandards",
  },
  {
    id: "bgs",
    name: "Beckett (BGS)",
    short: "BGS",
    country: "États-Unis",
    scale: [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1],
    labels: { 10: "Pristine", 9.5: "Gem Mint", 9: "Mint", 8.5: "NM-MT+", 8: "NM-MT", 7.5: "NM+", 7: "NM", 6.5: "EX-MT+", 6: "EX-MT", 5: "EX", 4: "VG-EX", 3: "VG", 2: "Good", 1: "Poor" },
    // Sous-note centrage BGS : 10 = 50/50, 9,5 ≤ 55/45, 9 ≤ 60/40, 8,5 ≤ 62/38, 8 ≤ 65/35, 7 ≤ 70/30…
    centeringFront: [
      { max: 51, grade: 10 },
      { max: 55, grade: 9.5 },
      { max: 60, grade: 9 },
      { max: 62, grade: 8.5 },
      { max: 65, grade: 8 },
      { max: 70, grade: 7 },
      { max: 75, grade: 6 },
      { max: 80, grade: 5 },
      { max: 85, grade: 4 },
      { max: 90, grade: 3 },
      { max: 100, grade: 2 },
    ],
    centeringBack: [
      { max: 55, grade: 10 },
      { max: 60, grade: 9.5 },
      { max: 65, grade: 9 },
      { max: 70, grade: 8.5 },
      { max: 75, grade: 8 },
      { max: 80, grade: 7 },
      { max: 90, grade: 5 },
      { max: 100, grade: 3 },
    ],
    published: true,
    note: "Quatre sous-notes (centrage, coins, bords, surface) ; la note finale suit la plus basse, à un demi-point près. Le 10 « Black Label » exige quatre 10.",
    url: "https://www.beckett.com/grading",
  },
  {
    id: "cgc",
    name: "CGC Cards",
    short: "CGC",
    country: "États-Unis",
    scale: [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1],
    labels: { 10: "Gem Mint", 9.5: "Mint+", 9: "Mint", 8.5: "NM/Mint+", 8: "NM/Mint", 7.5: "NM+", 7: "NM", 6.5: "EX/NM+", 6: "EX/NM", 5: "Excellent", 4: "VG/EX", 3: "VG", 2: "Good", 1: "Poor" },
    // Gem Mint 10 ≤ 55/45 recto (Pristine 10 : 50/50 et sans défaut à la loupe ×10) ; 9 ≤ 60/40 ; 8 ≤ 65/35 ; 7 ≤ 70/30 ; 6 ≤ 75/25…
    centeringFront: [
      { max: 55, grade: 10 },
      { max: 58, grade: 9.5 },
      { max: 60, grade: 9 },
      { max: 65, grade: 8 },
      { max: 70, grade: 7 },
      { max: 75, grade: 6 },
      { max: 85, grade: 4.5 },
      { max: 90, grade: 3.5 },
      { max: 100, grade: 2 },
    ],
    centeringBack: [
      { max: 75, grade: 10 },
      { max: 90, grade: 9 },
      { max: 100, grade: 3 },
    ],
    published: true,
    note: "Demi-points. Au-dessus du Gem Mint 10, le « Pristine 10 » demande une carte parfaite sous grossissement ×10 et un centrage 50/50.",
    url: "https://www.cgccards.com/card-grading/grading-scale/",
  },
  {
    id: "pca",
    name: "PCA Grade",
    short: "PCA",
    country: "France",
    scale: [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1],
    labels: {},
    // PCA annonce 55/45 pour un 10 et 60/40 pour un 9 ; le reste est aligné sur PSA
    centeringFront: [
      { max: 55, grade: 10 },
      { max: 58, grade: 9.5 },
      { max: 60, grade: 9 },
      { max: 65, grade: 8 },
      { max: 70, grade: 7 },
      { max: 80, grade: 6 },
      { max: 85, grade: 5 },
      { max: 90, grade: 3 },
      { max: 100, grade: 2 },
    ],
    centeringBack: [
      { max: 75, grade: 10 },
      { max: 90, grade: 9 },
      { max: 100, grade: 3 },
    ],
    published: false,
    note: "Trois évaluations indépendantes par carte. PCA annonce 55/45 pour un 10 et 60/40 pour un 9 ; le reste du barème n'est pas publié, on l'aligne sur PSA. Un « 10+ » existe pour les cartes parfaites.",
    url: "https://www.pca-grade.com",
  },
  {
    id: "ccc",
    name: "CCC Grading",
    short: "CCC",
    country: "France",
    scale: [10, 9.5, 9, 8.5, 8, 7, 6, 5, 4, 3, 2, 1],
    labels: { 10: "Pristine", 9.5: "Gem Mint", 9: "Mint", 8.5: "Near Mint", 8: "EX-NM", 7: "Excellent", 6: "Very Good", 5: "Good", 4: "Fair", 3: "Light. Pl.", 2: "LP-PR", 1: "Poor" },
    // La sous-note centrage CCC va de 8 à 10 (8,5 = « assez mal centrée ») ; ratios non publiés, alignés sur PSA
    centeringFront: [
      { max: 55, grade: 10 },
      { max: 60, grade: 9.5 },
      { max: 65, grade: 9 },
      { max: 70, grade: 8.5 },
      { max: 100, grade: 8 },
    ],
    centeringBack: [
      { max: 75, grade: 10 },
      { max: 85, grade: 9.5 },
      { max: 90, grade: 9 },
      { max: 100, grade: 8 },
    ],
    published: false,
    note: "Quatre critères, surface jugée sur 13 points. Le centrage compte de 8 à 10 seulement (au-delà : « Off-centered ») ; une carte centrée 8 mais ≥ 9,5 partout ailleurs obtient 9. Black Label = quatre 10.",
    url: "https://cccgrading.com/en/grading-scale",
  },
];

export function graderById(id: GraderId): Grader {
  return GRADERS.find((g) => g.id === id)!;
}

/** Mesures issues de l'atelier : pire écart de centrage en %, sous-notes 1–10 */
export type GradingMeasures = {
  /** pire côté du recto, ex. 62 pour un 62/38 */
  frontWorst: number;
  /** pire côté du verso, null si non mesuré */
  backWorst: number | null;
  corners: number;
  edges: number;
  surface: number;
};

export type Criterion = "centering" | "corners" | "edges" | "surface";

export type GraderEstimate = {
  grader: Grader;
  grade: number;
  /** libellé du grader (« Gem Mint »…), absent quand il ne publie que des chiffres */
  label: string | null;
  /** plafond dû au centrage seul */
  centeringCap: number;
  /** critère qui limite la note */
  limiting: Criterion;
  /** note qu'aurait la carte si ce critère était parfait */
  withoutLimit: number;
};

function capFrom(rules: CenteringRule[], worst: number): number {
  for (const r of rules) if (worst <= r.max) return r.grade;
  return rules[rules.length - 1].grade;
}

/** Arrondit une note à un palier de l'échelle du grader, vers le bas */
function snap(grader: Grader, value: number): number {
  for (const g of grader.scale) if (g <= value + 1e-9) return g;
  return grader.scale[grader.scale.length - 1];
}

export const CRITERION_LABEL: Record<Criterion, string> = {
  centering: "centrage",
  corners: "coins",
  edges: "bords",
  surface: "surface",
};

/** Estimation chez un grader : plafond de centrage, puis pire des sous-notes, sur l'échelle du grader */
export function estimateFor(grader: Grader, m: GradingMeasures): GraderEstimate {
  const centeringCap = Math.min(
    capFrom(grader.centeringFront, m.frontWorst),
    m.backWorst != null ? capFrom(grader.centeringBack, m.backWorst) : Infinity,
  );
  const parts: Record<Criterion, number> = {
    centering: centeringCap,
    corners: m.corners,
    edges: m.edges,
    surface: m.surface,
  };
  let raw = Math.min(...Object.values(parts));
  // CCC : un centrage 8 n'empêche pas un 9 si tout le reste est ≥ 9,5
  if (grader.id === "ccc" && centeringCap <= 8 && m.corners >= 9.5 && m.edges >= 9.5 && m.surface >= 9.5) raw = Math.max(raw, 9);
  const grade = snap(grader, raw);
  const limiting = (Object.keys(parts) as Criterion[]).reduce((a, k) => (parts[k] < parts[a] ? k : a), "centering");
  const others = (Object.keys(parts) as Criterion[]).filter((k) => k !== limiting).map((k) => parts[k]);
  const withoutLimit = snap(grader, Math.min(...others));
  return { grader, grade, label: grader.labels[String(grade)] ?? null, centeringCap, limiting, withoutLimit };
}

export function estimateAll(m: GradingMeasures): GraderEstimate[] {
  return GRADERS.map((g) => estimateFor(g, m));
}

/** Note affichée à la française : 9,5 */
export function gradeLabel(g: number): string {
  return String(g).replace(".", ",");
}

/** « 62/38 » à partir du pire côté */
export function ratioLabel(worst: number): string {
  const w = Math.round(worst);
  return `${w}/${100 - w}`;
}
