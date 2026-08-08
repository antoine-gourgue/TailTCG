"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";
import { SOURCE_KIND_VALUES, GEOCODED_KINDS, type SourceKind } from "@/lib/domain";

export type SourceFormState = { ok: boolean; message: string } | null;

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createSourceForm(
  _prev: SourceFormState,
  formData: FormData
): Promise<SourceFormState> {
  const name = str(formData, "name");
  const kind = str(formData, "kind");
  if (!name) return { ok: false, message: "Le nom est obligatoire." };
  if (!SOURCE_KIND_VALUES.includes(kind as SourceKind)) {
    return { ok: false, message: "Type invalide." };
  }

  const address = str(formData, "address") || null;
  const city = str(formData, "city") || null;
  const url = str(formData, "url") || null;
  const notes = str(formData, "notes") || null;

  const coords = GEOCODED_KINDS.includes(kind as SourceKind)
    ? await geocodeAddress(address, city)
    : null;

  const supabase = await createClient();
  const { error } = await supabase.from("sources").insert({
    name,
    kind,
    address,
    city,
    url,
    notes,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  });

  if (error) return { ok: false, message: `Création impossible : ${error.message}` };

  revalidatePath("/boutiques");
  const geoNote =
    kind === "shop" && !coords
      ? " (adresse non géolocalisée — précise l'adresse ou la ville puis modifie la fiche)"
      : "";
  return { ok: true, message: `« ${name} » enregistrée${geoNote}.` };
}

export async function updateSourceForm(
  _prev: SourceFormState,
  formData: FormData
): Promise<SourceFormState> {
  const id = str(formData, "source_id");
  const name = str(formData, "name");
  if (!id) return { ok: false, message: "Source introuvable." };
  if (!name) return { ok: false, message: "Le nom est obligatoire." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("sources")
    .select("id, kind, address, city")
    .eq("id", id)
    .single();
  if (!existing) return { ok: false, message: "Source introuvable." };

  const address = str(formData, "address") || null;
  const city = str(formData, "city") || null;

  // Re-géocoder uniquement si l'adresse a changé
  const addressChanged =
    GEOCODED_KINDS.includes(existing.kind as SourceKind) &&
    (address !== existing.address || city !== existing.city);
  const coords = addressChanged ? await geocodeAddress(address, city) : null;

  const { error } = await supabase
    .from("sources")
    .update({
      name,
      address,
      city,
      url: str(formData, "url") || null,
      notes: str(formData, "notes") || null,
      ...(addressChanged ? { lat: coords?.lat ?? null, lng: coords?.lng ?? null } : {}),
    })
    .eq("id", id);

  if (error) return { ok: false, message: `Mise à jour impossible : ${error.message}` };

  revalidatePath("/boutiques");
  return { ok: true, message: "Modifications enregistrées." };
}

export async function deleteSource(formData: FormData): Promise<void> {
  const id = str(formData, "source_id");
  if (!id) return;

  const supabase = await createClient();
  // Les items pointant dessus passent à source_id = null (on delete set null)
  await supabase.from("sources").delete().eq("id", id);
  revalidatePath("/boutiques");
  revalidatePath("/");
}
