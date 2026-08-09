import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";

export const metadata = { title: "Back-office — TailTCG" };

// Verrou global du back-office + coquille commune
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-5 flex items-center gap-2.5">
          <ShieldCheck size={22} className="text-accent-strong" aria-hidden />
          <h1 className="display text-3xl font-bold tracking-tight">Back-office</h1>
        </div>
        <AdminTabs />
        {children}
      </main>
    </AppShell>
  );
}
