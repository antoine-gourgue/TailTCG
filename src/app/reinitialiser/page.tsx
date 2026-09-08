import { redirect } from "next/navigation";
import { ResetPasswordForm } from "./reset-form";

export const metadata = {
  title: "Nouveau mot de passe — TailTCG",
};

// Page autonome (sans la navigation de l'app) atteinte via le lien de
// réinitialisation admin. Le jeton n'est consommé qu'à la soumission du
// formulaire, donc arriver ici ne connecte à rien.
export default async function ReinitialiserPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  if (!token_hash || type !== "recovery") redirect("/login?error=lien-invalide");

  return <ResetPasswordForm tokenHash={token_hash} />;
}
