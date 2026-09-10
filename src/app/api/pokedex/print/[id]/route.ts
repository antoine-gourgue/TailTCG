import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { artworkUrl, TYPE_COLOR } from "@/lib/pokedex";

/**
 * Fond de carte pour l'impression : dégradé + artwork composés en un seul
 * JPEG (630 × 880 px, ≈ 254 dpi au format 63 × 88 mm). Chrome garde les JPEG
 * tels quels dans un PDF, là où un WebP transparent serait réencodé sans
 * perte et ferait exploser la taille du fichier. Le nom et le numéro restent
 * en texte vectoriel côté page.
 */
const W = 630;
const H = 880;
const PAD_X = 63;
const TOP = 150;
const BOTTOM = 120;

function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const c = (i: number) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t));
  return `#${[1, 3, 5].map((i) => c(i).toString(16).padStart(2, "0")).join("")}`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Bad id", { status: 400 });

  const supabase = await createClient();
  const { data: p } = await supabase.from("pokedex").select("id, types").eq("id", id).maybeSingle();
  if (!p) return new NextResponse("Not found", { status: 404 });

  const main = TYPE_COLOR[p.types?.[0] ?? ""] ?? "#8b8f9a";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="${mix(main, "#17161a", 0.42)}"/>
        <stop offset="55%" stop-color="${mix(main, "#141317", 0.2)}"/>
        <stop offset="100%" stop-color="#0e0d10"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="25" ry="25" fill="none" stroke="${mix(main, "#17161a", 0.55)}" stroke-width="3"/>
  </svg>`;

  const artRes = await fetch(artworkUrl(p.id), { next: { revalidate: 86_400 } });
  if (!artRes.ok) return new NextResponse("Artwork missing", { status: 502 });
  const boxW = W - 2 * PAD_X;
  const boxH = H - TOP - BOTTOM;
  const art = await sharp(Buffer.from(await artRes.arrayBuffer()))
    .resize(boxW, boxH, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const meta = await sharp(art).metadata();
  const aw = meta.width ?? boxW;
  const ah = meta.height ?? boxH;

  const jpeg = await sharp(Buffer.from(svg))
    .composite([{ input: art, left: Math.round((W - aw) / 2), top: Math.round(TOP + (boxH - ah) / 2) }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
