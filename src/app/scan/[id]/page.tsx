import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { isCaptureExpired } from "@/lib/capture";
import { ScanSessionClient } from "@/app/scan/[id]/scan-session-client";
import { scanDetails } from "@/app/scan/actions";

export const metadata = { title: "Cartes scannées — TailTCG" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Desktop : la session de scan ouverte depuis Recherche. Le QR à flasher,
// puis les cartes reconnues par le téléphone qui arrivent en direct, à
// ajouter une à une (fiche complète, enchaînement automatique) ou d'un coup.
export default async function ScanSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("capture_sessions")
    .select("id, token, kind, status, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!session || session.kind !== "detect") notFound();
  const { data: scans } = await supabase
    .from("capture_scans")
    .select("*")
    .eq("session_id", id)
    .order("created_at");
  const details = await scanDetails(scans ?? []);

  return (
    <AppShell>
      <ScanSessionClient
        session={{
          id: session.id,
          token: session.token,
          status: session.status as "pending" | "done" | "cancelled",
          expired: isCaptureExpired(session.expires_at),
        }}
        initialScans={scans ?? []}
        initialDetails={details}
      />
    </AppShell>
  );
}
