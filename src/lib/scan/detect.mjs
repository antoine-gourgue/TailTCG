// Détection d'une carte dans une image et redressement en perspective, avec
// OpenCV.js. Partagé entre le navigateur (scanner caméra) et Node (banc
// scripts/scan-detect-bench.mjs). Deux stratégies, la meilleure gagne :
//   A. bord fermé : contours des bords, polygone à 4 côtés convexe ;
//   B. droites de Hough fusionnées, recalées sur le contour et bornées à leur
//      étendue réelle ; deux paires à peu près perpendiculaires → coins par
//      intersection. Résiste à une main qui cache un coin, à un reflet, aux
//      illustrations très texturées (filtre d'isolement des droites).
// Un candidat est validé par sa surface, son ratio (format 63/88 vu en
// perspective), le soutien de ses côtés par les pixels de contour, l'ancrage
// de ses coins dans l'étendue des droites, et noté par sa surface, son
// soutien, l'uniformité de sa bande intérieure (bordure de carte) et son
// format.

/** Taille de la carte redressée (format 63/88) */
export const CARD_W = 320;
export const CARD_H = 447;

/** @typedef {[number, number]} Pt */

/** Seuils de Canny (plus bas = trop de bruit, les droites se fragmentent) */
const CANNY_LO = 30;
const CANNY_HI = 100;
/**
 * Contours couleur (min des canaux R, G, B : le jaune tranche sur le blanc)
 * en SECOND essai seulement, quand la luminance ne donne aucun candidat :
 * en première passe ils ajoutent du bruit et font perdre des détections.
 */
const COLOR_FALLBACK = true;
/** Poids de la surface dans la note (1 = linéaire ; plus haut = favorise les grands rectangles) */
const AREA_EXP = 1;
/** Format accepté (court / long) ; 63/88 = 0,716, vu en perspective */
const RATIO_MIN = 0.58;
const RATIO_MAX = 0.85;
/** Surface minimale d'une carte, en part de l'image (une carte tenue devant le téléphone en couvre 10 à 40 %) */
const MIN_AREA = 0.04;
/** Écart-type de l'a priori sur le format, en ratio */
const SHAPE_SIGMA = 0.08;
/** Pénalité maximale d'un candidat décentré (la carte scannée est au milieu de l'écran) */
const CENTER_PENALTY = 0.35;
/** Un candidat contenu qui fait moins que cette part de la surface du contenant est un objet distinct */
const CONTAINED_RATIO = 0.6;
/** Facteur appliqué à un candidat qui contient un tel objet (cadre, écran, pochette derrière la carte) ; 1 = désactivé */
const CONTAINER_PENALTY = 0.1;
/** Facteur appliqué à un morceau d'un plus grand candidat (moitié de carte) ; 1 = désactivé */
const FRAGMENT_PENALTY = 0.3;
/** Écart de direction maximal entre côtés opposés (perspective), et minimal entre côtés adjacents, en degrés */
const MAX_SKEW_DEG = 12;
const MIN_PERP_DEG = 76;
/** Marge tolérée hors image pour un coin, en part du grand côté de l'image */
const CORNER_MARGIN = 0.005;
const FAMILY_DEG = 2;
/**
 * Réglages de la transformée de Hough, modifiables par le banc : pas angulaire
 * (degrés) et image de contours utilisée (brute ou dilatée). La dilatation
 * triple les pixels de contour, donc le coût de Hough, sans droite en plus.
 */
export const TUNE = {
  houghStepDeg: 0.5,
  houghOnRaw: true,
  /** Droites d'une même famille (bord de carte + bord de pochette) : écart max en part du grand côté de l'image ; 0 = désactivé */
  familyDist: 0.015,
  /** Trou toléré dans le suivi d'un contour le long d'une droite, en part du grand côté de l'image */
  traceGap: 0.02,
  /** Côté caché reconstruit : "always", "fallback" (seulement si rien d'autre n'est trouvé) ou "off" */
  hiddenSide: "fallback",
  /** Tronçons propres (sur 5) exigés sur chacun des trois côtés visibles d'une carte au côté caché */
  hiddenClean: 3,
  /** Facteur appliqué à une carte au côté caché */
  hiddenPenalty: 0.6,
  /**
   * Côté caché : en plus de la profondeur donnée par l'étendue des deux côtés
   * visibles, essayer celles du format 63/88. Trouve un peu plus de cartes
   * mais invente des rectangles dans les images sans carte.
   */
  hiddenRatioGuess: true,
  /** Côté caché : part du chemin vers lui que les deux côtés visibles opposés doivent couvrir */
  hiddenReach: 0.75,
};

/** Coins ordonnés haut-gauche, haut-droit, bas-droit, bas-gauche, côté long vertical */
function orderCorners(pts) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  // commence par le coin le plus haut-gauche
  let start = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    const v = p[0] + p[1];
    if (v < best) {
      best = v;
      start = i;
    }
  });
  let q = [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]);
  // sens horaire attendu (repère image, y vers le bas)
  const cross = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]);
  if (cross < 0) q = [q[0], q[3], q[2], q[1]];
  // carte tenue à l'horizontale : on tourne pour que le côté long soit vertical
  const top = dist(q[0], q[1]);
  const right = dist(q[1], q[2]);
  if (top > right * 1.1) q = [q[1], q[2], q[3], q[0]];
  return q;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const quadArea = (q) => {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};
/** court / long, sur les moyennes des côtés opposés */
const aspectOf = (q) => {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[1], q[2]) + dist(q[0], q[3])) / 2;
  return Math.min(w, h) / Math.max(w, h);
};
const isConvex = (q) => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const s = Math.sign(cr);
    if (s === 0) continue;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
};

/**
 * Soutien d'un côté par les pixels de contour, en 5 tronçons (part des points
 * de chaque tronçon qui tombent à ≤ 2 px d'un contour). Un côté « propre »
 * a au moins 4 tronçons bien soutenus : ça rejette les côtés qui prolongent
 * le bord d'une carte par une arête du fond.
 */
function sideSupport(edges, a, b) {
  const W = edges.cols;
  const H = edges.rows;
  const d = edges.data;
  const SEG = 5;
  const PER = 8;
  const out = new Array(SEG).fill(0);
  for (let sgm = 0; sgm < SEG; sgm++) {
    let hit = 0;
    for (let i = 0; i < PER; i++) {
      const t = (sgm + (i + 0.5) / PER) / SEG;
      const x = Math.round(a[0] + (b[0] - a[0]) * t);
      const y = Math.round(a[1] + (b[1] - a[1]) * t);
      let ok = false;
      for (let dy = -2; dy <= 2 && !ok; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && d[yy * W + xx]) {
            ok = true;
            break;
          }
        }
      }
      if (ok) hit++;
    }
    out[sgm] = hit / PER;
  }
  return out;
}

/**
 * Uniformité de la bande juste à l'intérieur du quadrilatère (0..1) : la
 * bordure d'une carte est une bande unie tout autour, alors qu'un rectangle
 * interne (fenêtre d'illustration, moitié haute) ou un bloc du fond ont un
 * contenu varié le long de leurs côtés.
 */
function rimUniformity(gray, q, area) {
  const W = gray.cols;
  const H = gray.rows;
  const g = gray.data;
  const inset = Math.max(2, 0.02 * Math.sqrt(area));
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const vals = [];
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    // normale vers le centre
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    for (let k = 0; k < 12; k++) {
      const t = 0.08 + (0.84 * (k + 0.5)) / 12;
      const x = Math.round(a[0] + (b[0] - a[0]) * t + nx * inset);
      const y = Math.round(a[1] + (b[1] - a[1]) * t + ny * inset);
      if (x >= 0 && y >= 0 && x < W && y < H) vals.push(g[y * W + x]);
    }
  }
  if (vals.length < 24) return 0;
  const sorted = [...vals].sort((u, v) => u - v);
  const med = sorted[sorted.length >> 1];
  let near = 0;
  for (const v of vals) if (Math.abs(v - med) <= 22) near++;
  return near / vals.length;
}

/** Note d'un candidat, ou null s'il est rejeté */
function evaluate(edges, gray, q, imgArea, verbose, skip = -1) {
  const why = (r) => (verbose ? { rejected: r, q } : null);
  if (!isConvex(q)) return why("convex");
  const area = quadArea(q);
  if (area < MIN_AREA * imgArea || area > 0.95 * imgArea) return why(`area ${(area / imgArea).toFixed(2)}`);
  const ratio = aspectOf(q);
  // format 63/88 (0,716) vu en perspective — un écran 16/9 (0,56) est exclu
  if (ratio < RATIO_MIN || ratio > RATIO_MAX) return why(`ratio ${ratio.toFixed(2)}`);
  const sides = [0, 1, 2, 3].map((i) => sideSupport(edges, q[i], q[(i + 1) % 4]));
  const clean = sides.map((sg) => sg.filter((v) => v >= 0.6).length);
  if (skip >= 0) {
    // Côté reconstruit (caché par la main) : les trois autres doivent être
    // nets, deux d'entre eux propres sur toute leur longueur
    const rest = clean.filter((_, i) => i !== skip);
    if (rest.filter((c) => c >= 4).length < 2 || Math.min(...rest) < TUNE.hiddenClean) {
      return why(`clean ${clean.join("/")} (côté ${skip} reconstruit)`);
    }
  } else {
    const cleanCount = clean.filter((c) => c >= 4).length;
    const cleanTotal = clean.reduce((t, c) => t + c, 0);
    // deux côtés propres au moins, les deux autres en grande partie visibles :
    // la main qui tient la carte cache un coin, donc un bout de deux côtés
    if (cleanCount < 2 || Math.min(...clean) < 2 || cleanTotal < 15) {
      return why(`clean ${clean.join("/")} sides ${sides.map((sg) => sg.map((v) => v.toFixed(1)).join(",")).join(" | ")}`);
    }
  }
  const sideMeans = sides.map((sg) => sg.reduce((u, v) => u + v, 0) / sg.length);
  const support =
    skip >= 0 ? sideMeans.filter((_, i) => i !== skip).reduce((t, v) => t + v, 0) / 3 : sideMeans.reduce((t, v) => t + v, 0) / 4;
  const minSide = Math.min(...sideMeans);
  const rim = rimUniformity(gray, q, area);
  // La carte entière est le plus grand quadrilatère soutenu par de vrais
  // contours, bordé d'une bande unie (les « full art » gardent un plancher) ;
  // un côté traversant (alignement fortuit toléré) coûte la moitié.
  // a priori sur le format 63/88 : un côté remplacé par une ligne interne
  // de la carte donne un quadrilatère trop court (ratio 0,78–0,85)
  const shape = Math.exp(-Math.pow((ratio - 0.716) / SHAPE_SIGMA, 2));
  // a priori de centrage : on scanne la carte au milieu de l'écran, pas un
  // cadre ou un écran qui traîne dans un coin
  const W = edges.cols;
  const H = edges.rows;
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const off = Math.min(1, Math.hypot((cx - W / 2) / (W / 2), (cy - H / 2) / (H / 2)));
  const center = 1 - CENTER_PENALTY * off;
  const score = Math.pow(area / imgArea, AREA_EXP) * support * (0.4 + 0.6 * rim) * shape * center * (skip >= 0 ? TUNE.hiddenPenalty : 1);
  return { corners: q, area, ratio, support, minSide, rim, through: 0, score, hidden: skip >= 0 };
}

/** Stratégie A : contour fermé à quatre côtés */
function closedContours(cv, edges, gray, imgArea) {
  const out = [];
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    if (cv.contourArea(c) >= MIN_AREA * imgArea) {
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.03 * cv.arcLength(c, true), true);
      if (approx.rows === 4) {
        const pts = [];
        for (let k = 0; k < 4; k++) pts.push([approx.data32S[k * 2], approx.data32S[k * 2 + 1]]);
        const ev = evaluate(edges, gray, orderCorners(pts), imgArea);
        if (ev) out.push(ev);
      }
      approx.delete();
    }
    c.delete();
  }
  contours.delete();
  hier.delete();
  return out;
}

/** Intersection de deux droites (φ, ρ) : x cosφ + y sinφ = ρ */
function intersect(l1, l2) {
  const det = Math.cos(l1.phi) * Math.sin(l2.phi) - Math.sin(l1.phi) * Math.cos(l2.phi);
  if (Math.abs(det) < 1e-6) return null;
  const x = (l1.rho * Math.sin(l2.phi) - l2.rho * Math.sin(l1.phi)) / det;
  const y = (l2.rho * Math.cos(l1.phi) - l1.rho * Math.cos(l2.phi)) / det;
  return [x, y];
}

/** Écart angulaire entre deux directions de normale (radians, 0..π/2) */
function angDiff(a, b) {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/**
 * Suit les pixels de contour le long d'une droite (φ, ρ, direction dx/dy) à
 * partir de l'abscisse `tc`, dans les deux sens, en tolérant des trous de
 * `maxGap` px. Renvoie l'étendue [tmin, tmax] et la longueur soutenue.
 */
function traceExtent(edges, l, tc, maxGap, win = 2) {
  const W = edges.cols;
  const H = edges.rows;
  const d = edges.data;
  const x0 = Math.cos(l.phi) * l.rho;
  const y0 = Math.sin(l.phi) * l.rho;
  const nx = Math.cos(l.phi);
  const ny = Math.sin(l.phi);
  /** écart (px, le long de la normale) du pixel de contour le plus proche, ou null */
  const hit = (t) => {
    const px = x0 + l.dx * t;
    const py = y0 + l.dy * t;
    for (let k = 0; k <= 2 * win; k++) {
      // 0, +1, -1, +2, -2, …
      const o = k % 2 ? (k + 1) / 2 : -k / 2;
      const x = Math.round(px + nx * o);
      const y = Math.round(py + ny * o);
      if (x >= 0 && y >= 0 && x < W && y < H && d[y * W + x]) return o;
    }
    return null;
  };
  const inside = (t) => {
    const px = x0 + l.dx * t;
    const py = y0 + l.dy * t;
    return px >= -2 && py >= -2 && px <= W + 1 && py <= H + 1;
  };
  const STEP = 2;
  let length = 0;
  const samples = [];
  const walk = (dir) => {
    let last = tc;
    let gap = 0;
    for (let t = tc; inside(t); t += dir * STEP) {
      const o = hit(t);
      if (o !== null) {
        last = t;
        gap = 0;
        length += STEP;
        samples.push([t, o]);
      } else {
        gap += STEP;
        if (gap > maxGap) break;
      }
    }
    return last;
  };
  const tmin = walk(-1);
  const tmax = walk(1);
  return { tmin, tmax, length, samples };
}

/** Recale une droite sur les écarts mesurés le long d'elle (moindres carrés o = a + b·t) */
function snapLine(l, samples) {
  const n = samples.length;
  if (n < 10) return;
  let st = 0;
  let so = 0;
  for (const [t, o] of samples) {
    st += t;
    so += o;
  }
  const mt = st / n;
  const mo = so / n;
  let stt = 0;
  let sto = 0;
  for (const [t, o] of samples) {
    stt += (t - mt) * (t - mt);
    sto += (t - mt) * (o - mo);
  }
  const b = stt > 0 ? sto / stt : 0;
  const a = mo - b * mt;
  // deux points de la droite corrigée → nouveaux φ, ρ, direction
  const x0 = Math.cos(l.phi) * l.rho;
  const y0 = Math.sin(l.phi) * l.rho;
  const nx = Math.cos(l.phi);
  const ny = Math.sin(l.phi);
  const t1 = mt - 100;
  const t2 = mt + 100;
  const p1 = [x0 + l.dx * t1 + nx * (a + b * t1), y0 + l.dy * t1 + ny * (a + b * t1)];
  const p2 = [x0 + l.dx * t2 + nx * (a + b * t2), y0 + l.dy * t2 + ny * (a + b * t2)];
  let phi = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) + Math.PI / 2;
  while (phi < 0) phi += Math.PI;
  while (phi >= Math.PI) phi -= Math.PI;
  l.phi = phi;
  l.rho = p1[0] * Math.cos(phi) + p1[1] * Math.sin(phi);
  l.dx = -Math.sin(phi);
  l.dy = Math.cos(phi);
}

/** Stratégie B : droites de Hough → paires de côtés à peu près parallèles, deux à deux perpendiculaires */
function houghQuads(cv, edges, gray, imgArea, debug, raw) {
  const W = edges.cols;
  const H = edges.rows;
  const minDim = Math.min(W, H);
  const lines = new cv.Mat();
  cv.HoughLinesP(raw ?? edges, lines, 1, (TUNE.houghStepDeg * Math.PI) / 180, 20, 0.08 * minDim, 6);
  const segs = [];
  for (let i = 0; i < lines.rows; i++) {
    const x1 = lines.data32S[i * 4];
    const y1 = lines.data32S[i * 4 + 1];
    const x2 = lines.data32S[i * 4 + 2];
    const y2 = lines.data32S[i * 4 + 3];
    const len = Math.hypot(x2 - x1, y2 - y1);
    // normale φ ∈ [0, π) et distance signée ρ : x cosφ + y sinφ = ρ
    let phi = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
    while (phi < 0) phi += Math.PI;
    while (phi >= Math.PI) phi -= Math.PI;
    const rho = ((x1 + x2) / 2) * Math.cos(phi) + ((y1 + y2) / 2) * Math.sin(phi);
    segs.push({ phi, rho, len, x1, y1, x2, y2 });
  }
  lines.delete();
  if (segs.length < 4) return [];

  // Fusion des segments colinéaires : même direction (3°) et les deux
  // extrémités à moins de 0,8 % de l'image de la droite hôte. Fine, pour ne
  // pas confondre le bord extérieur et le bord intérieur de la bordure d'une
  // carte, qui sont à quelques pixels l'un de l'autre.
  segs.sort((a, b) => b.len - a.len);
  const tol = 0.008 * Math.max(W, H);
  const tolPhi = (3 * Math.PI) / 180;
  const distTo = (l, x, y) => Math.abs(x * Math.cos(l.phi) + y * Math.sin(l.phi) - l.rho);
  const merged = [];
  for (const sg of segs) {
    let host = null;
    for (const m of merged) {
      if (angDiff(m.phi, sg.phi) <= tolPhi && distTo(m, sg.x1, sg.y1) <= tol && distTo(m, sg.x2, sg.y2) <= tol) {
        host = m;
        break;
      }
    }
    if (host) {
      host.weight += sg.len;
      host.segs.push(sg);
    } else merged.push({ phi: sg.phi, rho: sg.rho, weight: sg.len, segs: [sg] });
  }
  // Réajustement de chaque droite (régression orthogonale pondérée sur les
  // extrémités de ses segments) et étendue réelle le long de la droite : là
  // où le contour existe vraiment, un vrai coin de carte doit s'y trouver.
  const maxGap = TUNE.traceGap * Math.max(W, H);
  for (const m of merged) {
    let sw = 0;
    let mx = 0;
    let my = 0;
    for (const sg of m.segs) {
      mx += (sg.x1 + sg.x2) * sg.len;
      my += (sg.y1 + sg.y2) * sg.len;
      sw += 2 * sg.len;
    }
    mx /= sw;
    my /= sw;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const sg of m.segs) {
      for (const [x, y] of [
        [sg.x1, sg.y1],
        [sg.x2, sg.y2],
      ]) {
        sxx += (x - mx) * (x - mx) * sg.len;
        sxy += (x - mx) * (y - my) * sg.len;
        syy += (y - my) * (y - my) * sg.len;
      }
    }
    // direction principale, puis normale
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let phi = theta + Math.PI / 2;
    while (phi < 0) phi += Math.PI;
    while (phi >= Math.PI) phi -= Math.PI;
    m.phi = phi;
    m.rho = mx * Math.cos(phi) + my * Math.sin(phi);
    const dx = -Math.sin(phi);
    const dy = Math.cos(phi);
    m.dx = dx;
    m.dy = dy;
    // Étendue réelle : on suit les contours le long de la droite ajustée, à
    // partir du milieu du segment le plus long (sûrement sur le bord), en
    // tolérant des trous de 2 % de l'image (un reflet, un doigt fin). Les
    // segments de Hough, fragmentés, s'arrêtent souvent bien avant les coins ;
    // ce suivi va jusqu'au bout du bord.
    // Un premier suivi (fenêtre ±3 px) mesure l'écart réel du contour, la
    // droite est recalée dessus (elle dérive de quelques pixels sur la
    // longueur après la régression sur les segments), puis un second suivi
    // (±2 px) donne l'étendue définitive.
    const main = m.segs[0];
    let tc = ((main.x1 + main.x2) / 2) * dx + ((main.y1 + main.y2) / 2) * dy;
    const first = traceExtent(edges, m, tc, maxGap, 3);
    snapLine(m, first.samples);
    tc = ((main.x1 + main.x2) / 2) * m.dx + ((main.y1 + main.y2) / 2) * m.dy;
    const traced = traceExtent(edges, m, tc, maxGap, 2);
    m.tmin = traced.tmin;
    m.tmax = traced.tmax;
    m.weight = traced.length;
  }
  // Famille : les droites parallèles et très proches (bord de la carte et
  // bord de sa pochette, bord extérieur et intérieur de la bordure) décrivent
  // le même côté ; leurs étendues se complètent quand l'une est coupée par un
  // reflet ou une arête qui la croise. Chaque droite hérite de l'étendue de
  // sa famille pour l'ancrage des coins.
  const famTol = TUNE.familyDist * Math.max(W, H);
  const famPhi = (FAMILY_DEG * Math.PI) / 180;
  for (const m of merged) {
    m.fmin = m.tmin;
    m.fmax = m.tmax;
  }
  for (let i = 0; i < merged.length; i++) {
    const a = merged[i];
    if (a.weight < 0.1 * minDim) continue;
    for (let j = i + 1; j < merged.length; j++) {
      const b = merged[j];
      if (b.weight < 0.1 * minDim || angDiff(a.phi, b.phi) > famPhi) continue;
      // distance entre les deux droites, mesurée au milieu de l'étendue de b
      const tb = (b.tmin + b.tmax) / 2;
      const px = Math.cos(b.phi) * b.rho + b.dx * tb;
      const py = Math.sin(b.phi) * b.rho + b.dy * tb;
      if (distTo(a, px, py) > famTol) continue;
      // abscisses de b exprimées le long de a (directions quasi égales)
      const same = a.dx * b.dx + a.dy * b.dy > 0;
      const bmin = same ? b.tmin : -b.tmax;
      const bmax = same ? b.tmax : -b.tmin;
      const amin = same ? a.tmin : -a.tmax;
      const amax = same ? a.tmax : -a.tmin;
      a.fmin = Math.min(a.fmin, bmin);
      a.fmax = Math.max(a.fmax, bmax);
      b.fmin = Math.min(b.fmin, same ? amin : -amax);
      b.fmax = Math.max(b.fmax, same ? amax : -amin);
    }
  }
  // Isolement : un vrai bord a au moins un côté sans contours à 5 px (le
  // fond, ou la bande unie de la bordure) ; une « droite » née de la texture
  // d'une illustration holo baigne dans les contours des deux côtés.
  const ed = edges.data;
  const isolation = (m) => {
    const x0 = Math.cos(m.phi) * m.rho;
    const y0 = Math.sin(m.phi) * m.rho;
    const nx = Math.cos(m.phi) * 5;
    const ny = Math.sin(m.phi) * 5;
    let hitA = 0;
    let hitB = 0;
    let n = 0;
    for (let i = 0; i < 24; i++) {
      const t = m.tmin + ((m.tmax - m.tmin) * (i + 0.5)) / 24;
      const px = x0 + m.dx * t;
      const py = y0 + m.dy * t;
      const ax = Math.round(px + nx);
      const ay = Math.round(py + ny);
      const bx = Math.round(px - nx);
      const by = Math.round(py - ny);
      if (ax < 0 || ay < 0 || ax >= W || ay >= H || bx < 0 || by < 0 || bx >= W || by >= H) continue;
      n++;
      if (ed[ay * W + ax]) hitA++;
      if (ed[by * W + bx]) hitB++;
    }
    return n < 8 ? 0 : 1 - Math.min(hitA, hitB) / n;
  };
  const L = merged
    .filter((m) => m.weight >= 0.15 * minDim && isolation(m) >= 0.6)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 32);
  if (debug) debug.lines = L;
  if (L.length < 4) return [];

  // paires de côtés opposés : directions proches (la perspective d'une carte
  // tenue devant soi fait converger ses côtés de quelques degrés, pas plus) et
  // séparation d'au moins 10 % de l'image
  const maxSkew = (MAX_SKEW_DEG * Math.PI) / 180;
  const pairs = [];
  for (let i = 0; i < L.length; i++) {
    for (let j = i + 1; j < L.length; j++) {
      if (angDiff(L[i].phi, L[j].phi) > maxSkew) continue;
      // point de L[j] le plus proche du centre de l'image, distance à L[i]
      const px = Math.cos(L[j].phi) * L[j].rho;
      const py = Math.sin(L[j].phi) * L[j].rho;
      if (distTo(L[i], px, py) < 0.1 * minDim) continue;
      pairs.push([i, j]);
    }
  }
  const margin = CORNER_MARGIN * Math.max(W, H);
  const out = [];
  const minPerp = (MIN_PERP_DEG * Math.PI) / 180;
  for (let a = 0; a < pairs.length; a++) {
    const [i, j] = pairs[a];
    for (let b = a + 1; b < pairs.length; b++) {
      const [k, m] = pairs[b];
      if (k === i || k === j || m === i || m === j) continue;
      // les deux paires doivent être à peu près perpendiculaires (pas de
      // moyenne d'angles : φ se replie en 0/π pour les côtés quasi verticaux)
      if (angDiff(L[i].phi, L[k].phi) < minPerp || angDiff(L[j].phi, L[m].phi) < minPerp) continue;
      const p = [intersect(L[i], L[k]), intersect(L[i], L[m]), intersect(L[j], L[m]), intersect(L[j], L[k])];
      if (p.some((v) => !v)) continue;
      if (p.some(([x, y]) => x < -margin || y < -margin || x > W + margin || y > H + margin)) continue;
      // Chaque coin doit tomber dans l'étendue réelle de ses deux droites
      // (à 8 % de la longueur du côté près) ; un seul coin peut y échapper,
      // celui que cache la main. Ça élimine les quadrilatères qui prolongent
      // les bords d'une carte jusqu'à une arête du fond.
      const lineOf = [
        [i, k],
        [i, m],
        [j, m],
        [j, k],
      ];
      let loose = 0;
      const overrun = new Map();
      for (let c = 0; c < 4; c++) {
        const [x, y] = p[c];
        for (const li of lineOf[c]) {
          const l = L[li];
          const t = x * l.dx + y * l.dy;
          // longueur du côté porté par cette droite
          const other = lineOf.findIndex((pair, idx) => idx !== c && pair.includes(li));
          const side = other >= 0 ? Math.hypot(p[other][0] - x, p[other][1] - y) : minDim;
          const slack = 0.08 * side;
          if (t < l.fmin - slack || t > l.fmax + slack) {
            loose++;
            break;
          }
          // de combien le contour continue au-delà de ce coin, en part du côté
          const tOther = other >= 0 ? p[other][0] * l.dx + p[other][1] * l.dy : t;
          const beyond = tOther > t ? t - l.tmin : l.tmax - t;
          overrun.set(li, Math.max(overrun.get(li) ?? 0, beyond / side));
        }
      }
      // Un bord de carte s'arrête au coin ; une rangée de touches, le bord
      // d'une table continuent. Deux côtés « traversants » : ce n'est pas la carte.
      const through = [...overrun.values()].filter((v) => v > 0.15).length;
      if (through > 1) continue;
      if (loose > 1) continue;
      const ev = evaluate(edges, gray, orderCorners(p), imgArea);
      if (ev) out.push({ ...ev, through });
    }
  }
  if (TUNE.hiddenSide === "always" || (TUNE.hiddenSide === "fallback" && out.length === 0)) {
    hiddenSideQuads(L, pairs, edges, gray, imgArea, out);
  }
  return out;
}

/**
 * Stratégie C : la main qui tient la carte cache un côté entier (le pouce
 * sur le bas, les doigts sur la droite). Deux côtés opposés et un côté
 * perpendiculaire suffisent : le quatrième est posé parallèle au troisième,
 * là où s'arrêtent les deux côtés opposés (leur étendue tracée) si elle est
 * nette, sinon d'après le format 63/88 (les deux hypothèses : côté court ou
 * côté long visible). Le quadrilatère est noté sans ce côté, et pénalisé.
 */
function hiddenSideQuads(L, pairs, edges, gray, imgArea, out) {
  const W = edges.cols;
  const H = edges.rows;
  const margin = 0.04 * Math.max(W, H);
  const minPerp = (MIN_PERP_DEG * Math.PI) / 180;
  const seen = [];
  for (const [i, j] of pairs) {
    for (let k = 0; k < L.length; k++) {
      if (k === i || k === j) continue;
      const lk = L[k];
      if (angDiff(L[i].phi, lk.phi) < minPerp || angDiff(L[j].phi, lk.phi) < minPerp) continue;
      const p0 = intersect(L[i], lk);
      const p1 = intersect(L[j], lk);
      if (!p0 || !p1) continue;
      // les deux coins doivent être dans l'étendue de leurs droites
      const within = (l, p, slack) => {
        const t = p[0] * l.dx + p[1] * l.dy;
        return t >= l.fmin - slack && t <= l.fmax + slack;
      };
      const s = dist(p0, p1);
      if (s < 0.2 * Math.min(W, H)) continue;
      if (!within(lk, p0, 0.08 * s) || !within(lk, p1, 0.08 * s) || !within(L[i], p0, 0.08 * s) || !within(L[j], p1, 0.08 * s)) continue;
      // de quel côté de k s'étendent i et j (vers l'intérieur de la carte) ?
      const far = (l, p) => {
        const t = p[0] * l.dx + p[1] * l.dy;
        const a = l.fmax - t;
        const b = t - l.fmin;
        return a >= b ? { dir: 1, len: a } : { dir: -1, len: b };
      };
      const fi = far(L[i], p0);
      const fj = far(L[j], p1);
      // direction perpendiculaire à k, orientée vers l'intérieur
      let nx = Math.cos(lk.phi);
      let ny = Math.sin(lk.phi);
      const mi = [p0[0] + L[i].dx * fi.dir * fi.len, p0[1] + L[i].dy * fi.dir * fi.len];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if ((mi[0] - mid[0]) * nx + (mi[1] - mid[1]) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      // hypothèses de profondeur : étendue des deux côtés si elles concordent, puis le format
      const ds = [];
      const li = Math.abs((L[i].dx * fi.dir) * nx + (L[i].dy * fi.dir) * ny) * fi.len;
      const lj = Math.abs((L[j].dx * fj.dir) * nx + (L[j].dy * fj.dir) * ny) * fj.len;
      if (li > 0.3 * s && lj > 0.3 * s && Math.abs(li - lj) < 0.12 * Math.max(li, lj)) ds.push((li + lj) / 2);
      if (TUNE.hiddenRatioGuess) ds.push(s * 0.716, s / 0.716);
      for (const d of ds) {
        // droite du quatrième côté : parallèle à k, à la distance d
        const l4 = { phi: lk.phi, rho: lk.rho + (nx * Math.cos(lk.phi) + ny * Math.sin(lk.phi)) * d };
        const p2 = intersect(L[j], l4);
        const p3 = intersect(L[i], l4);
        if (!p2 || !p3) continue;
        if ([p2, p3].some(([x, y]) => x < -margin || y < -margin || x > W + margin || y > H + margin)) continue;
        // les deux côtés opposés doivent couvrir au moins 60 % du chemin vers le côté caché
        if (li < TUNE.hiddenReach * d || lj < TUNE.hiddenReach * d) continue;
        const q = orderCorners([p0, p1, p2, p3]);
        // le côté reconstruit est celui qui porte p2 et p3
        const onL4 = (p) => Math.abs(p[0] * Math.cos(l4.phi) + p[1] * Math.sin(l4.phi) - l4.rho) < 1e-3;
        const skip = [0, 1, 2, 3].find((c) => onL4(q[c]) && onL4(q[(c + 1) % 4]));
        if (skip === undefined) continue;
        if (seen.some((o) => sameQuad(o, q))) continue;
        seen.push(q);
        const ev = evaluate(edges, gray, q, imgArea, false, skip);
        if (ev) out.push({ ...ev, through: 0 });
      }
    }
  }
}

/**
 * Carte des contours (Canny sur la luminance floutée, dilatée d'un pixel) ;
 * avec `withColor`, on y ajoute les contours du min(R, G, B), où la bordure
 * jaune d'une carte sur une table claire tranche alors qu'elle est presque
 * invisible en gris.
 */
function edgeMap(cv, src, blur, withColor) {
  const edges = new cv.Mat();
  cv.Canny(blur, edges, CANNY_LO, CANNY_HI);
  const raw = TUNE.houghOnRaw ? edges.clone() : null;
  if (withColor) {
    const chans = new cv.MatVector();
    cv.split(src, chans);
    const mn = new cv.Mat();
    const cb = new cv.Mat();
    const ce = new cv.Mat();
    cv.min(chans.get(0), chans.get(1), mn);
    cv.min(mn, chans.get(2), mn);
    cv.GaussianBlur(mn, cb, new cv.Size(5, 5), 0);
    cv.Canny(cb, ce, CANNY_LO, CANNY_HI);
    cv.bitwise_or(edges, ce, edges);
    if (raw) cv.bitwise_or(raw, ce, raw);
    mn.delete();
    cb.delete();
    ce.delete();
    chans.delete();
  }
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.dilate(edges, edges, kernel);
  kernel.delete();
  return { edges, raw };
}

/** Le point est-il dans le quadrilatère convexe (coins ordonnés) ? */
function inside(q, [x, y]) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const s = Math.sign(cr);
    if (s === 0) continue;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Un quadrilatère qui recouvre en grande partie un autre candidat nettement
 * plus petit, bien soutenu et au format carte n'est pas la carte : c'est le
 * cadre, l'écran ou la pochette derrière elle (l'objet au premier plan est
 * celui qu'on scanne), ou un mélange de leurs bords. Le bord intérieur de la
 * bordure d'une carte, lui, fait ≥ 80 % de son bord extérieur : on ne le
 * confond pas avec un objet distinct ; et un détail interne à la carte est
 * trop petit ou trop allongé pour compter.
 */
function demoteContainers(candidates) {
  if (CONTAINER_PENALTY >= 1) return;
  // « Objet distinct » = un vrai rectangle fermé au format carte, parmi les
  // mieux notés : quatre côtés soutenus, bande intérieure unie, format serré
  const strong = [...candidates]
    .sort((x, y) => y.score - x.score)
    .slice(0, 5)
    .filter((c) => c.minSide >= 0.75 && c.rim >= 0.5 && c.ratio >= 0.66 && c.ratio <= 0.78);
  for (const a of candidates) {
    for (const b of strong) {
      if (b === a || b.area >= CONTAINED_RATIO * a.area || b.area < 0.15 * a.area) continue;
      const cx = (b.corners[0][0] + b.corners[1][0] + b.corners[2][0] + b.corners[3][0]) / 4;
      const cy = (b.corners[0][1] + b.corners[1][1] + b.corners[2][1] + b.corners[3][1]) / 4;
      if (!inside(a.corners, [cx, cy])) continue;
      const within = b.corners.filter((p) => inside(a.corners, p)).length;
      // Un rectangle qui partage deux côtés ou plus avec son contenant en
      // est un morceau (moitié basse d'une carte : bord de l'illustration +
      // trois bords de la carte), pas un objet posé devant
      if (within >= 2 && sharedSides(a.corners, b.corners) < 2) {
        a.score *= CONTAINER_PENALTY;
        a.contains = true;
        break;
      }
    }
  }
}

/** Distance d'un point à la droite (a, b) */
function lineDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1);
}

/**
 * Nombre de côtés de `inner` portés par un côté de `outer`, à la largeur
 * d'une bordure de carte près (5 % de la diagonale) : la moitié basse d'une
 * carte s'arrête au bord intérieur de sa bordure, pas à son bord extérieur.
 */
function sharedSides(outer, inner) {
  const diag = Math.hypot(outer[2][0] - outer[0][0], outer[2][1] - outer[0][1]);
  const tol = 0.05 * diag;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const p = inner[i];
    const q = inner[(i + 1) % 4];
    for (let j = 0; j < 4; j++) {
      const a = outer[j];
      const b = outer[(j + 1) % 4];
      if (lineDist(p, a, b) <= tol && lineDist(q, a, b) <= tol) {
        n++;
        break;
      }
    }
  }
  return n;
}

/**
 * Un candidat dont deux côtés ou plus sont portés par les côtés d'un candidat
 * plus grand et bien soutenu n'est qu'un morceau de celui-ci (moitié de
 * carte découpée par le bord de l'illustration ou de la zone de texte) : il
 * ne doit pas passer devant la carte entière.
 */
function demoteFragments(candidates) {
  for (const b of candidates) {
    for (const a of candidates) {
      // le contenant doit être un rectangle solide (ses quatre côtés soutenus)
      // et nettement plus grand : la moitié d'une carte, pas un quadrilatère
      // à peine plus large qui prend l'ombre d'un doigt pour un bord
      if (a === b || a.area <= 1.5 * b.area || a.minSide < 0.75) continue;
      if (sharedSides(a.corners, b.corners) >= 2) {
        b.score *= FRAGMENT_PENALTY;
        b.fragment = true;
        break;
      }
    }
  }
}

/** Deux quadrilatères (coins ordonnés) décrivent-ils le même objet ? */
function sameQuad(a, b) {
  const diag = Math.hypot(a[2][0] - a[0][0], a[2][1] - a[0][1]);
  let e = 0;
  for (let i = 0; i < 4; i++) e += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  return e / 4 < 0.06 * diag;
}

/**
 * Cherche des cartes dans une image RGBA : jusqu'à `k` candidats distincts,
 * du plus vraisemblable au moins vraisemblable (coins ordonnés haut-gauche,
 * haut-droit, bas-droit, bas-gauche, côté long vertical). Le premier est en
 * général la carte ; quand un cadre ou un écran derrière lui vole la vedette,
 * le suivant est la carte — c'est la reconnaissance qui tranche.
 * @param {any} cv OpenCV.js
 * @param {any} src cv.Mat RGBA
 * @param {number} [k]
 */
export function detectCardQuads(cv, src, k = 3, debug) {
  const W = src.cols;
  const H = src.rows;
  const imgArea = W * H;
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  gray.delete();
  let edges = null;
  let raw = null;
  let candidates = [];
  const collect = (withColor) => {
    edges?.delete();
    raw?.delete();
    ({ edges, raw } = edgeMap(cv, src, blur, withColor));
    const a = closedContours(cv, edges, blur, imgArea);
    const b = houghQuads(cv, edges, blur, imgArea, debug, raw);
    if (debug) {
      debug.closed = a.length;
      debug.hough = b.length;
    }
    return a.concat(b);
  };
  try {
    candidates = collect(false);
    if (candidates.length === 0 && COLOR_FALLBACK) candidates = collect(true);
    if (debug) {
      debug.edges = edges;
      debug.blur = blur;
      const e = edges;
      debug.evaluate = (q) => evaluate(e, blur, orderCorners(q), imgArea, true);
    }
  } finally {
    raw?.delete();
    if (!debug) {
      edges?.delete();
      blur.delete();
    }
  }
  demoteContainers(candidates);
  demoteFragments(candidates);
  candidates.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of candidates) {
    if (out.some((o) => sameQuad(o.corners, c.corners))) continue;
    out.push(c);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Le candidat le plus vraisemblable, ou null.
 * @param {any} cv OpenCV.js
 * @param {any} src cv.Mat RGBA
 */
export function detectCardQuad(cv, src, debug) {
  return detectCardQuads(cv, src, 1, debug)[0] ?? null;
}

/**
 * Redresse la carte (homographie) en CARD_W×CARD_H. Renvoie un cv.Mat RGBA à
 * libérer par l'appelant.
 * @param {any} cv
 * @param {any} src cv.Mat RGBA
 * @param {Pt[]} corners
 */
export function warpCard(cv, src, corners) {
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, CARD_W, 0, CARD_W, CARD_H, 0, CARD_H]);
  const M = cv.getPerspectiveTransform(from, to);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(CARD_W, CARD_H), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
  from.delete();
  to.delete();
  M.delete();
  return dst;
}

/**
 * Suivi : cherche la carte autour de sa dernière position (fenêtre élargie
 * de `margin` de chaque côté), donc plus vite et sans se laisser distraire
 * par le reste de l'image. Coins renvoyés dans le repère de l'image entière.
 * Renvoie [] si la fenêtre est trop petite ; l'appelant retombe alors sur
 * une recherche complète.
 * @param {any} cv OpenCV.js
 * @param {any} src cv.Mat RGBA
 * @param {Pt[]} prev coins de la carte à l'image précédente
 * @param {number} [k]
 * @param {number} [margin]
 */
export function trackCardQuad(cv, src, prev, k = 3, margin = 0.35) {
  const xs = prev.map((p) => p[0]);
  const ys = prev.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin * w));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin * h));
  const x1 = Math.min(src.cols, Math.ceil(Math.max(...xs) + margin * w));
  const y1 = Math.min(src.rows, Math.ceil(Math.max(...ys) + margin * h));
  if (x1 - x0 < 48 || y1 - y0 < 48) return [];
  const roi = src.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
  let found = [];
  try {
    found = detectCardQuads(cv, roi, k);
  } finally {
    roi.delete();
  }
  return found.map((q) => ({ ...q, corners: q.corners.map(([x, y]) => [x + x0, y + y0]) }));
}
