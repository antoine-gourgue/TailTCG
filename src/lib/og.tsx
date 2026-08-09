import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Image OG des pages de vitrine : marque, titre, stats et jusqu'à
 * trois cartes en éventail. Satori : display flex partout, styles inline.
 */
export function renderCollectionOg({
  title,
  subtitle,
  cardUrls,
}: {
  title: string;
  subtitle: string;
  cardUrls: string[];
}) {
  const cards = cardUrls.slice(0, 3);
  const mid = (cards.length - 1) / 2;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #17130f 0%, #211a14 100%)",
          color: "#f5efe8",
          padding: 64,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            paddingRight: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: 4,
            }}
          >
            <span>TAIL</span>
            <span style={{ color: "#e4572e" }}>TCG</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                display: "flex",
                fontSize: 60,
                fontWeight: 800,
                lineHeight: 1.1,
                maxWidth: 640,
              }}
            >
              {title}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: "#bab0a4" }}>
              {subtitle}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#847a6e" }}>
            tailtcg.vercel.app
          </div>
        </div>

        {cards.length > 0 && (
          <div
            style={{
              display: "flex",
              position: "relative",
              width: 400,
              height: "100%",
            }}
          >
            {cards.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                width={224}
                height={312}
                style={{
                  position: "absolute",
                  left: 70 + (i - mid) * 78,
                  top: 95 + Math.abs(i - mid) * 26,
                  transform: `rotate(${(i - mid) * 11}deg)`,
                  borderRadius: 14,
                  boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
                  zIndex: i === Math.round(mid) ? 2 : 1,
                }}
              />
            ))}
          </div>
        )}
      </div>
    ),
    OG_SIZE
  );
}

/** URL d'aperçu OG d'une carte : uniquement les scans TCGdex publics */
export function ogCardUrl(imageBase: string | null): string | null {
  if (!imageBase || !imageBase.includes("assets.tcgdex.net")) return null;
  return `${imageBase}/high.png`;
}
