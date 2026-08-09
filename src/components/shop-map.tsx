"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatEur } from "@/lib/domain";
import type { SourceWithStats } from "./shops-client";

// Marqueur en CSS pur : pas d'assets Leaflet à recâbler
const pin = L.divIcon({
  className: "",
  html: '<div class="shop-pin"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10],
});

// Cadre la carte sur les boutiques : une seule → vue rapprochée,
// plusieurs → englobe tous les points, aucune → France entière
function FitToShops({
  points,
  pointsKey,
}: {
  points: [number, number][];
  pointsKey: string;
}) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 14 });
    }
    // Recadre uniquement quand la liste des positions change réellement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey]);
  return null;
}

export default function ShopMap({ shops }: { shops: SourceWithStats[] }) {
  const located = shops.filter((s) => s.lat != null && s.lng != null);
  const points = located.map((s) => [s.lat!, s.lng!] as [number, number]);
  const pointsKey = points.map((p) => p.join(",")).join("|");

  return (
    <MapContainer
      center={[46.6, 2.4]}
      zoom={6}
      scrollWheelZoom={false}
      className="z-0 h-64 w-full rounded-2xl border border-edge md:h-105"
    >
      <TileLayer
        attribution='&copy; les contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToShops points={points} pointsKey={pointsKey} />
      {located.map((shop) => (
        <Marker key={shop.id} position={[shop.lat!, shop.lng!]} icon={pin}>
          <Popup>
            <div className="text-sm">
              <p className="mb-0.5 font-semibold">{shop.name}</p>
              {(shop.address || shop.city) && (
                <p className="mb-1 text-xs">
                  {[shop.address, shop.city].filter(Boolean).join(", ")}
                </p>
              )}
              <p className="mb-1">
                {shop.cards} carte{shop.cards > 1 ? "s" : ""} achetée
                {shop.cards > 1 ? "s" : ""} · {formatEur(shop.spent)}
              </p>
              <a href={`/?source=${shop.id}`} className="underline">
                Voir ces cartes
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
