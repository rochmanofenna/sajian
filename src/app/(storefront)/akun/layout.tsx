// /akun/* guard. If there's no customer session we bounce the visitor
// back to the tenant root with ?login=1 so the AccountMenu auto-opens
// the LoginDialog. Runs at the nodejs runtime so it can reach Supabase
// Auth + customer_accounts.

import { redirect } from 'next/navigation';
import { requirePublicTenant } from '@/lib/tenant';
import { getCustomerSession } from '@/lib/auth/customer-session';

export default async function AkunLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requirePublicTenant();
  const session = await getCustomerSession(tenant);
  if (!session) redirect('/?login=1');
  return <>{children}</>;
}
