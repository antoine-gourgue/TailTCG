import { redirect } from "next/navigation";

// Les statistiques vivent désormais sur le tableau de bord Collection
export default function StatsPage() {
  redirect("/collection");
}
