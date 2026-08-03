"use client";

import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
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

export default function ShopMap({ shops }: { shops: SourceWithStats[] }) {
  const located = shops.filter((s) => s.lat != null && s.lng != null);

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
