import { Boxes, LayoutGrid, Package, ScanLine } from "lucide-react";
import type { AdminAccount, AdminEvent } from "@/lib/admin-data";
import { relTime } from "@/lib/admin-format";
import { CardImage } from "@/components/card-image";
import { Avatar, IconBox } from "@/components/admin/admin-ui";

const KIND = {
  cartes: { icon: LayoutGrid, tone: "accent", verb: "a ajouté", noun: "carte" },
  "scellés": { icon: Boxes, tone: "sealed", verb: "a ajouté", noun: "scellé" },
  boosters: { icon: Package, tone: "game", verb: "a ouvert", noun: "booster" },
  scans: { icon: ScanLine, tone: "scan", verb: "a scanné", noun: "carte" },
} as const;

/** Fil des derniers gestes : un groupe par compte, jour et type, avec vignettes */
export function EventFeed({ events, accounts, now }: { events: AdminEvent[]; accounts: Map<string, AdminAccount>; now: number }) {
  if (events.length === 0) return <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">Rien pour l&apos;instant.</p>;
  return (
    <ul className="divide-y divide-ring">
      {events.map((ev) => {
        const a = accounts.get(ev.ownerId);
        const k = KIND[ev.kind];
        return (
          <li key={`${ev.ownerId}-${ev.day}-${ev.kind}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <Avatar name={a?.name ?? a?.email ?? "?"} hue={a?.hue ?? 200} size="sm" />
            <div className="min-w-0 flex-1 text-[13px] leading-snug">
              <span className="font-semibold">{a?.name ?? a?.email ?? "Compte supprimé"}</span> <span className="text-muted">{k.verb}</span>{" "}
              <b>
                {ev.count.toLocaleString("fr-FR")} {k.noun}
                {ev.count > 1 ? "s" : ""}
              </b>
              {ev.images.length > 0 && (
                <div className="mt-1.5 flex gap-1">
                  {ev.images.slice(0, 6).map((src, i) =>
                    ev.kind === "scellés" ? (
                      <span key={i} className="flex h-[26px] w-[34px] items-center justify-center overflow-hidden rounded-[5px] bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
                      </span>
                    ) : (
                      <span key={i} className="card-tile w-[22px] shrink-0 aspect-[63/88] !rounded-[3px]">
                        <CardImage base={src} alt="" placeholder="compact" />
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
            <IconBox icon={k.icon} tone={k.tone} size="sm" />
            <span className="w-16 shrink-0 text-right text-[11px] text-faint">{relTime(ev.at, now)}</span>
          </li>
        );
      })}
    </ul>
  );
}
