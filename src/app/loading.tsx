import { PageLoader } from "@/components/page-loader";

// Écran de chargement global (App Router) : logo animé pendant que la
// page suivante prépare ses données
export default function Loading() {
  return <PageLoader />;
}
