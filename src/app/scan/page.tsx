import { redirect } from "next/navigation";
import { canScan } from "@/lib/scan/access";
import { ScanClient } from "@/app/scan/scan-client";

export const metadata = { title: "Scanner une carte — TailTCG" };

// Scan direct depuis le téléphone (connecté) : caméra → reconnaissance →
// fiche d'ajout. Depuis un ordinateur, passer par le relais QR de Recherche.
// Bêta : comptes autorisés seulement.
export default async function ScanPage() {
  if (!(await canScan())) redirect("/recherche");
  return <ScanClient />;
}
