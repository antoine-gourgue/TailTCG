import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Export CSV (séparateur ; et BOM UTF-8 : s'ouvre proprement dans Excel FR)

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function frNumber(value: number | null): string {
  if (value == null) return "";
  return String(value).replace(".", ",");
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non connecté" }, { status: 401 });
  }

  const [{ data: items }, { data: sources }] = await Promise.all([
    supabase.from("collection_value").select("*").order("created_at"),
    supabase.from("sources").select("id, name"),
  ]);

  const sourceName = new Map((sources ?? []).map((s) => [s.id, s.name]));

  const header = [
    "Nom",
    "Set",
    "Numéro",
    "ID TCGdex",
    "Type",
    "Langue",
    "État",
    "Quantité",
    "Prix payé (€)",
    "Valeur estimée (€)",
    "Plus-value (€)",
    "Date d'achat",
    "Source",
    "Gradée",
    "Grade",
    "Lien Cardmarket",
    "Notes",
  ];

  const rows = (items ?? []).map((i) =>
    [
      csvCell(i.card_name),
      csvCell(i.set_name),
      csvCell(i.local_id),
      csvCell(i.tcgdex_id),
      csvCell(i.card_type),
      csvCell(i.language),
      csvCell(i.condition),
      csvCell(i.quantity),
      frNumber(i.purchase_price),
      frNumber(i.current_price),
      frNumber(i.gain),
      csvCell(i.purchase_date),
      csvCell(i.source_id ? sourceName.get(i.source_id) ?? "" : ""),
      i.graded ? "oui" : "non",
      csvCell(i.grade),
      csvCell(i.cardmarket_url),
      csvCell(i.notes),
    ].join(";")
  );

  const csv = "﻿" + [header.join(";"), ...rows].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pokedex-collection-${date}.csv"`,
    },
  });
}
