// GET /api/tenant — public-safe tenant fields. Strips pos_config (contains
// the ESB bearer). Used by the dashboard + storefront client components.

import { NextResponse } from 'next/server';
import { resolveTenant } from '@/lib/api/tenant-api';
import { errorResponse } from '@/lib/api/errors';

export async function GET() {
  try {
    const t = await resolveTenant();
    return NextResponse.json({
      tenant: {
        id: t.id,
        slug: t.slug,
        name: t.name,
        tagline: t.tagline,
        logo_url: t.logo_url,
        colors: t.colors,
        currency_symbol: t.currency_symbol,
        locale: t.locale,
        features: t.features,
        tiers: t.tiers,
        support_whatsapp: t.support_whatsapp,
        pos_provider: t.pos_provider,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
