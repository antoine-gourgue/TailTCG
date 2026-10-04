import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
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
      <main className="page py-8">
        <PageHead kicker="Administration" title="Back-office" sub="Vue d'ensemble de tous les comptes et données." className="!mb-4">
          <ShieldCheck size={20} className="text-accent-strong" aria-hidden />
        </PageHead>
        <AdminTabs />
        {children}
      </main>
    </AppShell>
  );
}
