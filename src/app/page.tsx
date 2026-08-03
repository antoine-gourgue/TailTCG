import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="text-center">
        <p className="mb-2 text-sm uppercase tracking-widest text-emerald-400">
          Connecté
        </p>
        <h1 className="mb-1 text-3xl font-semibold text-neutral-100">
          Pokédex Collection
        </h1>
        <p className="mb-8 text-sm text-neutral-400">{user.email}</p>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
