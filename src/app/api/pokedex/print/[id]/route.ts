import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { artworkUrl } from "@/lib/pokedex";

/**
 * Fond de carte pour l'impression : fond blanc + artwork composés en un seul
 * JPEG (630 × 880 px, ≈ 254 dpi au format 63 × 88 mm). Chrome garde les JPEG
 * tels quels dans un PDF, là où un PNG transparent serait réencodé et ferait
 * exploser la taille du fichier. Le nom et le numéro restent en texte
 * vectoriel côté page, dans les bandes blanches du haut et du bas.
 */
const W = 630;
const H = 880;
const PAD_X = 63;
/** Bande blanche du haut (nom) et du bas (numéro) : l'artwork ne les touche pas */
const TOP = 230;
const BOTTOM = 120;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Bad id", { status: 400 });

  const supabase = await createClient();
  const { data: p } = await supabase.from("pokedex").select("id").eq("id", id).maybeSingle();
  if (!p) return new NextResponse("Not found", { status: 404 });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/></svg>`;

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
