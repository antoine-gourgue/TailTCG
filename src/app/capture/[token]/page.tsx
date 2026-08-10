import { Logo } from "@/components/logo";
import { loadCaptureByToken } from "@/lib/capture";
import { CapturePhone } from "@/components/capture/capture-phone";

export const metadata = { title: "Capture — TailTCG" };

// Page publique ouverte sur le téléphone après avoir flashé le QR desktop
export default async function CapturePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await loadCaptureByToken(token);

  if (!session || session.status !== "pending") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
        <Logo variant="mark" size={44} />
        <p className="display text-xl font-bold">Session terminée</p>
        <p className="text-sm text-muted">
          Ce code a expiré ou a déjà servi. Génère-en un nouveau depuis ton
          ordinateur.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <div className="mb-4 text-center">
        <p className="display text-lg font-bold">
          {session.kind === "detect" ? "Scanner une carte" : "Photographier la carte"}
        </p>
        <p className="text-sm text-muted">
          {session.kind === "detect"
            ? "Cadre la carte dans le rectangle et prends la photo."
            : "Cadre bien la carte, prends une ou plusieurs photos."}
        </p>
      </div>
      <CapturePhone token={token} kind={session.kind} />
    </main>
  );
}
