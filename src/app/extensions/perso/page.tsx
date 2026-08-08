import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/app-shell";
import { Logo } from "@/components/logo";
import {
  CustomCardsGrid,
  type CustomCardTile,
} from "@/components/custom-cards-grid";

export const metadata = {
  title: "Cartes hors catalogue — TailTCG",
};

export default async function PersoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customs } = await supabase
    .from("custom_cards")
    .select("id, name, set_name, local_id, image_path")
    .order("created_at", { ascending: false });

  let tiles: CustomCardTile[] = [];
  if (customs && customs.length > 0) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("card-photos")
      .createSignedUrls(
        customs.map((c) => c.image_path),
        3600
      );
    tiles = customs.map((c, i) => ({
      id: c.id,
      name: c.name,
      setName: c.set_name,
      localId: c.local_id,
      image: signed?.[i]?.signedUrl ?? null,
    }));
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Link
          href="/recherche"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
        >
          ← Extensions
        </Link>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo variant="mark" size={48} />
            <div>
              <h1 className="display text-3xl font-bold tracking-tight">
                Cartes hors catalogue
              </h1>
              <p className="mt-1 flex items-center gap-3 text-sm text-muted">
                <span className="num rounded bg-raised px-1.5 py-0.5 uppercase">
                  perso
                </span>
                <span className="num">
                  {tiles.length} carte{tiles.length > 1 ? "s" : ""}
                </span>
              </p>
            </div>
          </div>
          <Link href="/ajouter/manuel" className="btn btn-ghost">
            + Nouvelle carte
          </Link>
        </div>

        <CustomCardsGrid tiles={tiles} />
      </main>
    </AppShell>
  );
}
