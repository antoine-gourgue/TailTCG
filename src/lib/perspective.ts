// Redressement de perspective : projette le quadrilatère des 4 coins
// d'une carte photographiée vers un rectangle au format carte (63×88).
// Canvas 2D ne sait pas faire de projective : on découpe en grille et
// on approxime chaque cellule par deux triangles affines.

export type Pt = { x: number; y: number };

/** Homographie du carré unité vers un quadrilatère (Heckbert) */
function homography(p00: Pt, p10: Pt, p11: Pt, p01: Pt) {
  const sx = p00.x - p10.x + p11.x - p01.x;
  const sy = p00.y - p10.y + p11.y - p01.y;

  let a: number, b: number, d: number, e: number, g: number, h: number;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = p10.x - p00.x;
    b = p01.x - p00.x;
    d = p10.y - p00.y;
    e = p01.y - p00.y;
    g = 0;
    h = 0;
  } else {
    const dx1 = p10.x - p11.x;
    const dx2 = p01.x - p11.x;
    const dy1 = p10.y - p11.y;
    const dy2 = p01.y - p11.y;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = p10.x - p00.x + g * p10.x;
    b = p01.x - p00.x + h * p01.x;
    d = p10.y - p00.y + g * p10.y;
    e = p01.y - p00.y + h * p01.y;
  }
  const c = p00.x;
  const f = p00.y;

  return (u: number, v: number): Pt => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}

/** Triangle texturé : mappe (source px) → (destination px) en affine */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s0: Pt,
  s1: Pt,
  s2: Pt,
  d0: Pt,
  d1: Pt,
  d2: Pt
) {
  const delta = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(delta) < 1e-9) return;
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / delta;
  const b = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / delta;
  const c = d0.x - a * s0.x - b * s0.y;
  const d = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / delta;
  const e = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / delta;
  const f = d0.y - d * s0.x - e * s0.y;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  // Légère dilatation du clip pour masquer les coutures entre triangles
  ctx.lineWidth = 1.5;
  ctx.clip();
  ctx.transform(a, d, b, e, c, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Dessine la carte redressée dans le canvas fourni.
 * quad : les 4 coins de la carte dans la photo, en fractions [0..1]
 * (ordre : haut-gauche, haut-droit, bas-droit, bas-gauche).
 * pad : marge du calque autour de la carte (fraction du canvas).
 */
export function warpCardToCanvas(
  img: HTMLImageElement,
  quad: [Pt, Pt, Pt, Pt],
  canvas: HTMLCanvasElement,
  { grid = 16, pad = 0.03, background = "#14110e" } = {}
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const toPx = (p: Pt): Pt => ({
    x: p.x * img.naturalWidth,
    y: p.y * img.naturalHeight,
  });
  const src = homography(toPx(quad[0]), toPx(quad[1]), toPx(quad[2]), toPx(quad[3]));

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  const x0 = W * pad;
  const y0 = H * pad;
  const cw = W * (1 - 2 * pad);
  const ch = H * (1 - 2 * pad);

  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const u0 = i / grid;
      const u1 = (i + 1) / grid;
      const v0 = j / grid;
      const v1 = (j + 1) / grid;
      const s00 = src(u0, v0);
      const s10 = src(u1, v0);
      const s11 = src(u1, v1);
      const s01 = src(u0, v1);
      const d00 = { x: x0 + u0 * cw, y: y0 + v0 * ch };
      const d10 = { x: x0 + u1 * cw, y: y0 + v0 * ch };
      const d11 = { x: x0 + u1 * cw, y: y0 + v1 * ch };
      const d01 = { x: x0 + u0 * cw, y: y0 + v1 * ch };
      drawTriangle(ctx, img, s00, s10, s11, d00, d10, d11);
      drawTriangle(ctx, img, s00, s11, s01, d00, d11, d01);
    }
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
