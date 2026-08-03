// Géocodage Nominatim (OSM) — côté serveur uniquement, à la création ou
// modification d'une boutique. Jamais en boucle : 1 requête par enregistrement,
// User-Agent identifiable exigé par leur politique d'usage.

type NominatimResult = { lat: string; lon: string };

async function queryNominatim(
  q: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
      {
        headers: {
          "User-Agent":
            "PokedexCollection/1.0 (site perso ; antoine.gourguemail@gmail.com)",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const results: NominatimResult[] = await res.json();
    if (!results.length) return null;
    const lat = Number.parseFloat(results[0].lat);
    const lng = Number.parseFloat(results[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export async function geocodeAddress(
  address: string | null | undefined,
  city: string | null | undefined
): Promise<{ lat: number; lng: number } | null> {
  if (!address && !city) return null;

  const precise = await queryNominatim(
    [address, city, "France"].filter(Boolean).join(", ")
  );
  if (precise) return precise;

  // Adresse introuvable : repli sur le centre-ville, en respectant la
  // limite Nominatim d'une requête par seconde
  if (address && city) {
    await new Promise((r) => setTimeout(r, 1100));
    return queryNominatim(`${city}, France`);
  }
  return null;
}
