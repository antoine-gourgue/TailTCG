import { PageLoader } from "@/components/page-loader";

// Catalogue : le loader TailTCG tant que sets, cartes, visuels et cotes ne
// sont pas tous récupérés (TCGdex, puis la base) — jamais de page partielle
export default function Loading() {
  return <PageLoader />;
}
