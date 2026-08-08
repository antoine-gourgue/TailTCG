import { redirect } from "next/navigation";

// Fusionnée dans la page Ajouter : recherche + catalogue au même endroit
export default async function ExtensionsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  redirect(lang === "ja" ? "/recherche?lang=ja" : "/recherche");
}
