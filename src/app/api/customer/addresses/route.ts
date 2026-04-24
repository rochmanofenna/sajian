// /api/customer/addresses — list + upsert saved delivery addresses for
// the signed-in customer on the current tenant. Stored as a jsonb array
// on customers.saved_addresses, keyed by a client-supplied id so edits
// are idempotent.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getTenant } from '@/lib/tenant';
import { getCustomerSession } from '@/lib/auth/customer-session';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const addressSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(40),
  recipient: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(32),
  address: z.string().trim().min(4).max(500),
  note: z.string().trim().max(240).optional().nullable(),
});

export type SavedAddress = z.infer<typeof addressSchema> & { id: string };

async function loadProfile(tenantId: string, accountId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from('customers')
    .select('id, saved_addresses')
    .eq('tenant_id', tenantId)
    .eq('customer_account_id', accountId)
    .maybeSingle();
  if (error) throw error;
  if (data) return { service, customerId: data.id as string, list: ((data.saved_addresses as SavedAddress[]) ?? []) };
  // First address for this tenant — materialize the customers row now.
  const { data: inserted, error: insertErr } = await service
    .from('customers')
    .insert({
      tenant_id: tenantId,
      customer_account_id: accountId,
      saved_addresses: [],
    })
    .select('id, saved_addresses')
    .single();
  if (insertErr) throw insertErr;
  return {
    service,
    customerId: inserted.id as string,
    list: (inserted.saved_addresses as SavedAddress[]) ?? [],
  };
}

export async function GET() {
  try {
    const tenant = await getTenant();
    const session = await getCustomerSession(tenant);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!tenant) return badRequest('tenant required');
    const { list } = await loadProfile(tenant.id, session.account.id);
    return NextResponse.json({ addresses: list });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await getTenant();
    const session = await getCustomerSession(tenant);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!tenant) return badRequest('tenant required');
    const parsed = addressSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { service, customerId, list } = await loadProfile(tenant.id, session.account.id);
    const id = parsed.data.id ?? randomUUID();
    const next = parsed.data.id
      ? list.map((a) => (a.id === parsed.data.id ? { ...parsed.data, id } : a))
      : [...list, { ...parsed.data, id }];
    const { error } = await service
      .from('customers')
      .update({ saved_addresses: next })
      .eq('id', customerId);
    if (error) throw error;
    return NextResponse.json({ addresses: next });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const tenant = await getTenant();
    const session = await getCustomerSession(tenant);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!tenant) return badRequest('tenant required');
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return badRequest('id required');
    const { service, customerId, list } = await loadProfile(tenant.id, session.account.id);
    const next = list.filter((a) => a.id !== id);
    const { error } = await service
      .from('customers')
      .update({ saved_addresses: next })
      .eq('id', customerId);
    if (error) throw error;
    return NextResponse.json({ addresses: next });
  } catch (err) {
    return errorResponse(err);
  }
}
