// Owner-gated payment-method toggles.
//   GET  /api/admin/payment-methods            — list current state
//   POST /api/admin/payment-methods            — upsert toggle/config
//
// Methods follow the convention used in lib/payments/xendit.ts:
// 'qris' | 'va_bca' | 'va_mandiri' | 'va_bni' | 'gopay' | 'ovo' |
// 'shopeepay' | 'cash_on_delivery' | 'card'. Unknown methods rejected.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const KNOWN_METHODS = [
  'qris',
  'va_bca',
  'va_mandiri',
  'va_bni',
  'gopay',
  'ovo',
  'shopeepay',
  'dana',
  'card',
  'cash_on_delivery',
  'cashier',
] as const;

const bodySchema = z.object({
  method: z.enum(KNOWN_METHODS),
  is_enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const service = createServiceClient();
    const { data, error } = await service
      .from('tenant_payment_methods')
      .select('method, is_enabled, config, updated_at')
      .eq('tenant_id', tenant.id);
    if (error) throw error;
    return NextResponse.json({ methods: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const service = createServiceClient();
    const { data, error } = await service
      .from('tenant_payment_methods')
      .upsert(
        {
          tenant_id: tenant.id,
          method: parsed.data.method,
          is_enabled: parsed.data.is_enabled,
          ...(parsed.data.config !== undefined ? { config: parsed.data.config } : {}),
        },
        { onConflict: 'tenant_id,method' },
      )
      .select('method, is_enabled, config')
      .single();
    if (error) throw error;
    revalidatePath('/', 'layout');
    return NextResponse.json({ method: data });
  } catch (err) {
    return errorResponse(err);
  }
}
