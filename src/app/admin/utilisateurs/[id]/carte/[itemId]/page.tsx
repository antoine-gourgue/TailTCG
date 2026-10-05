import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, ExternalLink, Image as ImageIcon, MapPin, NotebookTabs, Tag } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminData } from "@/lib/admin-data";
import { applyRectifiedImages, signStorageImages } from "@/lib/images";
import { shortDate } from "@/lib/admin-format";
import { rarityLabel, raritySymbol } from "@/lib/rarity";
import { cardmarketUrl, hostedLogo } from "@/lib/tcgdex";
import { CONDITIONS, formatEur } from "@/lib/domain";
import { CardImage } from "@/components/card-image";
import { SetLogo } from "@/components/game/set-logo";
import { ValueHistoryChart } from "@/components/value-history-chart";
import { SlabReportTile } from "@/components/slab-report-tile";
import type { GradingReportData } from "@/components/grading-report";
import { AdminItemEdit, ItemDangerZone } from "@/components/admin/admin-item-edit";
import { Badge, HeroStat, IconBox, OwnerBack, PanelHead } from "@/components/admin/admin-ui";

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

export default async function AdminItemDetail({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const db = createAdminClient();

  const [{ data: item }, d] = await Promise.all([db.from("items").select("*").eq("id", itemId).eq("owner_id", id).maybeSingle(), loadAdminData()]);
  if (!item) notFound();
  const owner = d.accounts.find((a) => a.id === id);
  const ownerName = owner?.name ?? owner?.email ?? "Compte";
  const isCustom = item.tcgdex_id?.startsWith("custom:") ?? false;

  const [{ data: sources }, { data: photoRows }, { data: grading }, { data: history }, { data: snaps }, { data: links }, { data: setRows }] = await Promise.all([
    db.from("sources").select("id, name").eq("owner_id", id).order("name"),
    db.from("item_photos").select("id, path, label").eq("item_id", itemId).order("position"),
    db
      .from("item_gradings")
      .select("grade, centering, corners, edges, surface, created_at, rectified_path, rectified_verso_path, ratios, details")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("item_value_history").select("recorded_at, value").eq("item_id", itemId).order("recorded_at"),
    item.tcgdex_id && !isCustom
      ? db.from("price_snapshots").select("captured_at, reference").eq("tcgdex_id", item.tcgdex_id).not("reference", "is", null).order("captured_at")
      : Promise.resolve({ data: null }),
    db.from("binder_items").select("binder_id, binders(id, name)").eq("item_id", itemId),
    item.set_id ? db.from("catalog_sets").select("lang, logo").eq("id", item.set_id) : Promise.resolve({ data: null }),
  ]);

  // Visuel : redressé de pré-gradation > visuel hors catalogue signé > scan officiel
  const [{ image_url: heroImage }] = await applyRectifiedImages(
    [{ item_id: itemId, rectified_path: grading?.rectified_path ?? null }],
    await signStorageImages([{ id: itemId, image_url: item.image_url }], id),
    id,
  );
  const signedPaths = [...(photoRows ?? []).map((p) => p.path), grading?.rectified_path, grading?.rectified_verso_path].filter((p): p is string => !!p);
  const signed = new Map<string, string | null>();
  if (signedPaths.length) {
    const { data } = await db.storage.from("card-photos").createSignedUrls(signedPaths, 3600);
    signedPaths.forEach((p, i) => signed.set(p, data?.[i]?.signedUrl ?? null));
  }
  const photos = (photoRows ?? []).flatMap((p) => (signed.get(p.path) ? [{ url: signed.get(p.path)!, label: p.label }] : []));
  const report: GradingReportData | null = grading
    ? {
        grade: grading.grade ?? 0,
        centering: grading.centering ?? 0,
        corners: grading.corners ?? 0,
        edges: grading.edges ?? 0,
        surface: grading.surface ?? 0,
        createdAt: grading.created_at,
        ratios: (grading.ratios as GradingReportData["ratios"]) ?? null,
        versoRatios: (grading.details as { verso?: GradingReportData["versoRatios"] })?.verso ?? null,
        annotations: (grading.details as { annotations?: GradingReportData["annotations"] })?.annotations ?? [],
        rectoUrl: grading.rectified_path ? (signed.get(grading.rectified_path) ?? null) : null,
        versoUrl: grading.rectified_verso_path ? (signed.get(grading.rectified_verso_path) ?? null) : null,
        cardName: item.card_name ?? "",
        setName: item.set_name ?? "",
        localId: item.local_id ?? "",
      }
    : null;

  // Cote Cardmarket relevée chaque nuit, et valeur saisie au fil du temps
  const marketPoints = (snaps ?? []).map((s) => ({ recorded_at: String(s.captured_at).slice(0, 10), value: Number(s.reference) }));
  const cote = marketPoints.at(-1)?.value ?? null;
  const coteFirst = marketPoints[0]?.value ?? null;
  const coteDelta = cote != null && coteFirst != null && coteFirst > 0 && marketPoints.length > 1 ? ((cote - coteFirst) / coteFirst) * 100 : null;
  const valuePoints = (history ?? []).map((h) => ({ recorded_at: String(h.recorded_at).slice(0, 10), value: Number(h.value) }));

  const qty = item.quantity ?? 1;
  const unit = item.manual_price ?? cote;
  const gain = unit != null && item.purchase_price != null ? (unit - item.purchase_price) * qty : null;
  const gainPct = gain != null && item.purchase_price ? (gain / (item.purchase_price * qty)) * 100 : null;
  const condition = CONDITIONS.find((c) => c.code === item.condition);
  const source = item.source_id ? (sources ?? []).find((s) => s.id === item.source_id) : null;
  const logo = setRows?.find((r) => r.lang === "fr")?.logo ?? setRows?.[0]?.logo ?? (item.set_id ? hostedLogo("fr", item.set_id) : null) ?? null;
  const symbol = raritySymbol(item.rarity);
  const binders = (links ?? []).flatMap((l) => {
    const b = Array.isArray(l.binders) ? l.binders[0] : l.binders;
    return b ? [b] : [];
  });
  const cmLink = item.cardmarket_url ?? (isCustom ? null : cardmarketUrl({ name: item.card_name, localId: item.local_id ?? undefined }));
  const details: { label: string; value: React.ReactNode }[] = [
    { label: "État", value: condition ? `${item.condition} · ${condition.label}` : item.condition },
    { label: "Langue", value: item.language ?? "—" },
    { label: "Variante", value: item.card_type ?? "—" },
    { label: "Quantité", value: <span className="num">× {qty}</span> },
    { label: "Achetée le", value: item.purchase_date ? shortDate(item.purchase_date, d.now) : "—" },
    { label: "Ajoutée le", value: shortDate(item.created_at, d.now) },
    { label: "Boutique", value: source?.name ?? "—" },
    { label: "Identifiant", value: <span className="num text-[12px]">{item.tcgdex_id ?? "—"}</span> },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <OwnerBack href={`/admin/utilisateurs/${id}`} name={ownerName} hue={owner?.hue ?? 200} />

      {/* En-tête : la carte, son identité, ses chiffres */}
      <section className="panel overflow-hidden p-5 sm:p-6" style={{ background: "radial-gradient(70% 90% at 0% 0%, color-mix(in srgb, var(--accent) 12%, var(--surface)), var(--surface) 65%)" }}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-[260px] md:max-w-none">
            <div className={`card-tile aspect-[63/88] shadow-2xl ${item.deleted_at ? "opacity-60" : ""}`}>
              <CardImage base={heroImage || null} alt={item.card_name} quality="high" fallback={photos[0]?.url ?? null} />
            </div>
            {photos.length > 0 && (
              <ul className="mt-3 grid grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <li key={i} className="card-tile aspect-[63/88]">
                    <CardImage base={p.url} alt={p.label ?? ""} direct />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {logo && (
                <span className="flex h-6 items-center">
                  <SetLogo logo={logo} className="max-h-6 max-w-16 object-contain" />
                </span>
              )}
              <span className="font-medium text-foreground">{item.set_name}</span>
              {item.local_id && <span className="num">· {item.local_id}</span>}
            </p>
            <h2 className="display mt-1.5 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{item.card_name}</h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {item.rarity && (
                <Badge tone="gold">
                  {symbol && <span aria-hidden>{symbol}</span>} {rarityLabel(item.rarity)}
                </Badge>
              )}
              {item.deleted_at && <Badge tone="ko">Corbeille depuis le {shortDate(item.deleted_at, d.now)}</Badge>}
              {item.sold_at && (
                <Badge tone="muted">
                  Vendue le {shortDate(item.sold_at, d.now)}
                  {item.sold_price != null ? ` · ${formatEur(item.sold_price)}` : ""}
                </Badge>
              )}
              {item.graded && <Badge tone="ok">Gradée{item.grade ? ` · ${item.grade}` : ""}</Badge>}
              {isCustom && <Badge tone="muted">Hors catalogue</Badge>}
              {item.needs_review && <Badge tone="warn">À revoir</Badge>}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <HeroStat label="Valeur saisie" value={item.manual_price != null ? formatEur(item.manual_price) : "—"} sub={item.manual_price != null && qty > 1 ? `× ${qty} = ${formatEur(item.manual_price * qty)}` : "par exemplaire"} tone={item.manual_price == null ? "faint" : undefined} />
              <HeroStat label="Cote Cardmarket" value={cote != null ? formatEur(cote) : "—"} sub={coteDelta != null ? `${pct(coteDelta)} depuis le premier relevé` : cote != null ? "relevée cette nuit" : isCustom ? "hors catalogue" : "pas de relevé"} tone={cote == null ? "faint" : undefined} />
              <HeroStat label="Payé" value={item.purchase_price != null ? formatEur(item.purchase_price) : "—"} sub={item.purchase_price != null && qty > 1 ? `× ${qty} = ${formatEur(item.purchase_price * qty)}` : "par exemplaire"} tone={item.purchase_price == null ? "faint" : undefined} />
              <HeroStat
                label="Plus-value"
                value={gain != null ? `${gain >= 0 ? "+" : ""}${formatEur(gain)}` : "—"}
                sub={gainPct != null ? `${pct(gainPct)}${item.manual_price == null ? " à la cote" : ""}` : "prix d'achat inconnu"}
                tone={gain == null ? "faint" : gain >= 0 ? "up" : "down"}
              />
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {details.map((x) => (
                <div key={x.label} className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{x.label}</dt>
                  <dd className="mt-0.5 truncate">{x.value}</dd>
                </div>
              ))}
            </dl>
            {item.notes && <p className="mt-4 rounded-xl bg-raised/60 px-3.5 py-2.5 text-[13px] text-muted">{item.notes}</p>}
            {cmLink && (
              <a href={cmLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mt-5">
                Voir sur Cardmarket <ExternalLink size={13} aria-hidden />
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Courbes */}
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className="panel p-5">
          <PanelHead title="Valeur saisie" hint={valuePoints.length ? `${valuePoints.length} relevé${valuePoints.length > 1 ? "s" : ""} au fil des réévaluations` : "Le compte n'a pas encore réévalué cette carte"} />
          {valuePoints.length >= 2 ? (
            <ValueHistoryChart points={valuePoints} minSpanRatio={0.08} height={170} />
          ) : (
            <Empty>{valuePoints.length === 1 ? `Une seule valeur, ${formatEur(valuePoints[0].value)}, le ${shortDate(valuePoints[0].recorded_at, d.now)}.` : "Aucune valeur saisie."}</Empty>
          )}
        </section>
        <section className="panel p-5">
          <PanelHead title="Cote Cardmarket" hint={marketPoints.length ? `${marketPoints.length} relevés nocturnes` : "Aucun relevé pour cette carte"} />
          {marketPoints.length >= 2 ? <ValueHistoryChart points={marketPoints} minSpanRatio={0.08} height={170} /> : <Empty>{isCustom ? "Carte hors catalogue : pas de cote." : "La courbe se dessine dès le deuxième relevé."}</Empty>}
        </section>
      </section>

      {/* Où elle vit : classeurs, pré-gradation */}
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className="panel p-5">
          <PanelHead title="Rangement" hint="Classeurs où le compte a placé cette carte" />
          {binders.length === 0 ? (
            <Empty>Dans aucun classeur.</Empty>
          ) : (
            <ul className="divide-y divide-ring">
              {binders.map((b) => (
                <li key={b.id}>
                  <Link href={`/admin/utilisateurs/${id}/classeur/${b.id}`} className="flex items-center gap-3 py-2.5 transition hover:text-accent-strong">
                    <IconBox icon={NotebookTabs} tone="accent" />
                    <span className="flex-1 font-semibold">{b.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <li className="flex items-center gap-2 rounded-xl bg-raised/60 px-3 py-2">
              <MapPin size={13} className="text-muted" aria-hidden />
              <span className="truncate">{source?.name ?? "Sans boutique"}</span>
            </li>
            <li className="flex items-center gap-2 rounded-xl bg-raised/60 px-3 py-2">
              <CalendarPlus size={13} className="text-muted" aria-hidden />
              <span className="truncate">{shortDate(item.created_at, d.now)}</span>
            </li>
            <li className="flex items-center gap-2 rounded-xl bg-raised/60 px-3 py-2">
              {photos.length ? <ImageIcon size={13} className="text-muted" aria-hidden /> : <Tag size={13} className="text-muted" aria-hidden />}
              <span className="truncate">{photos.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : "Pas de photo"}</span>
            </li>
          </ul>
        </section>
        <section className="panel p-5">
          <PanelHead title="Pré-gradation" hint={report ? `Notée le ${shortDate(report.createdAt, d.now)} · clique le boîtier pour le rapport` : "Pas encore pré-gradée"} />
          {report ? (
            <div className="mx-auto max-w-[220px]">
              <SlabReportTile data={report} imageUrl={report.rectoUrl} />
            </div>
          ) : (
            <Empty>Le compte n&apos;a pas pré-gradé cette carte.</Empty>
          )}
        </section>
      </section>

      <AdminItemEdit
        itemId={itemId}
        ownerId={id}
        sources={sources ?? []}
        defaults={{
          condition: item.condition,
          quantity: qty,
          purchase_price: item.purchase_price,
          manual_price: item.manual_price,
          language: item.language ?? "FR",
          card_type: item.card_type,
          graded: item.graded ?? false,
          grade: item.grade,
          source_id: item.source_id,
          notes: item.notes,
        }}
      />
      <ItemDangerZone itemId={itemId} ownerId={id} trash={item.deleted_at != null} />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
