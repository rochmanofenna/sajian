// Owner-gated custom-domain registration.
//   GET  /api/admin/custom-domain — fetch current registration
//   POST /api/admin/custom-domain — register or replace; returns
//                                   DNS instructions for the owner
//
// SSL provisioning + verification cron lives elsewhere. This route
// only persists the request + returns the CNAME / TXT records the
// owner should add at their DNS provider. Verified state flips to
// active when the cron sees the records resolve.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const DOMAIN_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

const bodySchema = z.object({
  domain: z.string().trim().toLowerCase().regex(DOMAIN_RE, 'invalid domain'),
});

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const service = createServiceClient();
    const { data, error } = await service
      .from('tenant_custom_domains')
      .select('domain, cname_target, verification_token, verified_at, ssl_status')
      .eq('tenant_id', tenant.id)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ domain: data });
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
    const cnameTarget = `${tenant.slug}.sajian.app`;
    const verificationToken = randomBytes(16).toString('hex');
    const { data, error } = await service
      .from('tenant_custom_domains')
      .upsert(
        {
          tenant_id: tenant.id,
          domain: parsed.data.domain,
          cname_target: cnameTarget,
          verification_token: verificationToken,
          verified_at: null,
          ssl_status: 'pending',
        },
        { onConflict: 'tenant_id' },
      )
      .select('domain, cname_target, verification_token, ssl_status')
      .single();
    if (error) throw error;
    revalidatePath('/', 'layout');
    return NextResponse.json({
      domain: data,
      // Human-readable instructions the AI can relay verbatim.
      dns_instructions: {
        cname: { host: parsed.data.domain, target: cnameTarget },
        txt: { host: `_sajian-verify.${parsed.data.domain}`, value: verificationToken },
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
