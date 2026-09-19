import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/supabase/server";
import { ScanClient } from "@/app/scan/scan-client";

export const metadata = { title: "Scanner une carte — TailTCG" };

// Scan direct depuis le téléphone (connecté) : caméra → reconnaissance →
// fiche d'ajout. Depuis un ordinateur, passer par le relais QR de Recherche.
export default async function ScanPage() {
  if (!(await currentUserId())) redirect("/login");
  return <ScanClient />;
}
