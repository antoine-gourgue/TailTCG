import { NextResponse, type NextRequest } from "next/server";
import { searchCards } from "@/lib/tcgdex";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ cards: [] });
  }

  try {
    const cards = await searchCards(q);
    return NextResponse.json({ cards });
  } catch {
    return NextResponse.json(
      { cards: [], error: "TCGdex est injoignable, réessaie dans un instant." },
      { status: 502 }
    );
  }
}
