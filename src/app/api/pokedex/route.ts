import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPokedex } from "@/lib/pokedex-server";

// Le Pokédex complet (numéro, nom, types, génération) pour le tiroir
// « Ranger une carte » : 1025 lignes, ~40 Ko, mis en cache côté navigateur
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ list: [] }, { status: 401 });

  const list = await loadPokedex(supabase);
  return NextResponse.json(
    { list },
    { headers: { "Cache-Control": "private, max-age=86400" } }
  );
}
