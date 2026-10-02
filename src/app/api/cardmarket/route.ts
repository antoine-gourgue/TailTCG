import { NextResponse, type NextRequest } from "next/server";
import { cardmarketIdFor } from "@/lib/cardmarket";
import { cardmarketUrl } from "@/lib/tcgdex";

/**
 * Lien Cardmarket résolu au clic : ?card=<id TCGdex>&name=…&n=<numéro>. Mène
 * à la fiche produit quand TCGdex connaît son idProduct (FR puis JA, corrigé
 * par la table locale), sinon à la recherche « nom numéro ». Évite à une page
 * qui liste beaucoup de cartes une requête TCGdex par carte à l'affichage.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const card = params.get("card")?.trim() ?? "";
  const name = params.get("name")?.trim().slice(0, 120) ?? "";
  const localId = params.get("n")?.trim().slice(0, 20) || undefined;

  const idProduct = card && !card.startsWith("custom:") ? await cardmarketIdFor(card.slice(0, 60)) : null;
  return NextResponse.redirect(cardmarketUrl({ idProduct, name, localId }), 307);
}
