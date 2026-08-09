import Link from "next/link";
import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages } from "@/lib/images";
import { AppShell } from "@/components/app-shell";
import { GradedSlab } from "@/components/graded-slab";

export const metadata = {
  title: "Pré-gradées — TailTCG",
};

export default async function PregradesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: gradings }, { data: items }] = await Promise.all([
    supabase
      .from("item_gradings")
      .select(
        "item_id, grade, centering, corners, edges, surface, created_at, rectified_path"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("collection_value")
      .select("id, card_name, set_name, local_id, image_url"),
  ]);

  // Dernière évaluation par exemplaire
  const latest = new Map<string, NonNullable<typeof gradings>[number]>();
  for (const g of gradings ?? []) {
    if (!latest.has(g.item_id)) latest.set(g.item_id, g);
  }

  const signedItems = await signStorageImages(
    (items ?? []) as {
      id: string;
      card_name: string;
      set_name: string;
      local_id: string;
      image_url: string;
    }[],
    user.id
  );
  const itemById = new Map(signedItems.map((i) => [i.id, i]));

  // Visuels redressés (calque carte) : prioritaires dans le boîtier
  const rectifiedUrls = new Map<string, string>();
  {
    const withRect = [...latest.values()].filter((g) => g.rectified_path);
    if (withRect.length > 0) {
      const admin = createAdminClient();
      const paths = withRect.map((g) => g.rectified_path as string);
      const { data: signed } = await admin.storage
        .from("card-photos")
        .createSignedUrls(paths, 3600);
      withRect.forEach((g, i) => {
        const url = signed?.[i]?.signedUrl;
        if (url) rectifiedUrls.set(g.item_id, url);
      });
    }
  }

  // Photos perso en secours de vignette
  const photoFallbacks = new Map<string, string>();
  if (latest.size > 0) {
    const { data: allPhotos } = await supabase
      .from("item_photos")
      .select("item_id, path, position")
      .in("item_id", [...latest.keys()])
      .order("position");
    const firstByItem = new Map<string, string>();
    for (const p of allPhotos ?? []) {
      if (!firstByItem.has(p.item_id)) firstByItem.set(p.item_id, p.path);
    }
    if (firstByItem.size > 0) {
      const admin = createAdminClient();
      const paths = [...firstByItem.values()];
      const { data: signed } = await admin.storage
        .from("card-photos")
        .createSignedUrls(paths, 3600);
      const urlByPath = new Map(paths.map((p, i) => [p, signed?.[i]?.signedUrl]));
      for (const [itemId, path] of firstByItem) {
        const url = urlByPath.get(path);
        if (url) photoFallbacks.set(itemId, url);
      }
    }
  }

  const slabs = [...latest.values()]
    .map((g) => ({ g, item: itemById.get(g.item_id) }))
    .filter(
      (s): s is { g: (typeof s)["g"]; item: NonNullable<(typeof s)["item"]> } =>
        s.item != null
    );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">
          Pré-gradées
        </h1>
        <p className="mb-6 text-sm text-muted">
          Tes cartes évaluées avec l&apos;atelier de pré-gradation, présentées
          en boîtier.
        </p>

        {slabs.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <Award size={44} strokeWidth={1.3} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">
              Aucune carte pré-gradée
            </p>
            <p className="max-w-sm text-sm text-muted">
              Ouvre une carte, ajoute une photo recto (et verso), puis lance
              « Pré-grader » : centrage mesuré, coins zoomés, verdict — et le
              boîtier apparaîtra ici.
            </p>
          </div>
        ) : (
          <ul className="rise-in grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {slabs.map(({ g, item }) => (
              <li key={g.item_id}>
                <Link
                  href={`/carte/${g.item_id}`}
                  className="group block transition-transform duration-300 hover:-translate-y-1"
                >
                  <GradedSlab
                    name={item.card_name}
                    setName={item.set_name}
                    localId={item.local_id}
                    imageUrl={
                      rectifiedUrls.get(g.item_id) ?? item.image_url ?? null
                    }
                    fallback={photoFallbacks.get(g.item_id) ?? null}
                    grade={g.grade ?? 0}
                    centering={g.centering ?? 0}
                    corners={g.corners ?? 0}
                    edges={g.edges ?? 0}
                    surface={g.surface ?? 0}
                  />
                  <p className="mt-2 text-center text-xs text-faint">
                    évaluée le{" "}
                    {g.created_at
                      ? new Date(g.created_at).toLocaleDateString("fr-FR")
                      : "—"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
