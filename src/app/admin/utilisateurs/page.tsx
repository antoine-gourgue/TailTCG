import { loadAdminBundle } from "@/lib/admin-data";
import { UsersTable } from "@/components/admin/users-table";

export default async function AdminUsers() {
  const b = await loadAdminBundle();
  return <UsersTable users={b.users} />;
}
