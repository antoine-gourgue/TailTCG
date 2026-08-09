import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/* Police du site + logo, chargés une fois par instance */
let assetsPromise: Promise<{
  regular: Buffer;
  bold: Buffer;
  logo: string;
}> | null = null;

function loadAssets() {
  assetsPromise ??= (async () => {
    const [regular, bold, logoPng] = await Promise.all([
      readFile(
        path.join(process.cwd(), "src/lib/og-fonts/instrument-sans-400.woff")
      ),
      readFile(
        path.join(process.cwd(), "src/lib/og-fonts/instrument-sans-700.woff")
      ),
      readFile(path.join(process.cwd(), "src/app/apple-icon.png")),
    ]);
    return {
      regular,
      bold,
      logo: `data:image/png;base64,${logoPng.toString("base64")}`,
    };
  })();
  return assetsPromise;
}

/**
 * Image OG des pages de vitrine : marque, titre, stats et jusqu'à
 * trois cartes en éventail. Satori : display flex partout, styles inline.
 */
export async function renderCollectionOg({
  title,
  subtitle,
  cardUrls,
  cta,
}: {
  title: string;
  subtitle: string;
  cardUrls: string[];
  /** Bouton d'appel à l'action affiché sous le sous-titre */
  cta?: string;
}) {
  const { regular, bold, logo } = await loadAssets();
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
              alignItems: "center",
              gap: 18,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={64} height={64} alt="" />
            <div
              style={{
                display: "flex",
                fontSize: 38,
                fontWeight: 700,
                letterSpacing: -0.5,
              }}
            >
              <span>Tail</span>
              <span style={{ color: "#e4572e" }}>TCG</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                display: "flex",
                fontSize: 58,
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: -1.5,
                maxWidth: 640,
              }}
            >
              {title}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: "#bab0a4" }}>
              {subtitle}
            </div>
            {cta && (
              <div style={{ display: "flex", marginTop: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "#e4572e",
                    color: "#fff7f2",
                    fontSize: 26,
                    fontWeight: 700,
                    padding: "14px 30px",
                    borderRadius: 999,
                    boxShadow: "0 12px 30px rgba(228,87,46,0.35)",
                  }}
                >
                  {cta}
                </div>
              </div>
            )}
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
    {
      ...OG_SIZE,
      fonts: [
        {
          name: "Instrument Sans",
          data: regular,
          weight: 400,
          style: "normal",
        },
        { name: "Instrument Sans", data: bold, weight: 700, style: "normal" },
      ],
    }
  );
}

/** URL d'aperçu OG d'une carte : uniquement les scans TCGdex publics */
export function ogCardUrl(imageBase: string | null): string | null {
  if (!imageBase || !imageBase.includes("assets.tcgdex.net")) return null;
  return `${imageBase}/high.png`;
}
