// POST /api/ai/suggest-slug
//
// Derive a DNS-safe slug from a restaurant name, check availability against
// tenants.slug, and return alternatives if taken. No model call — pure
// string munging + a single Supabase query.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateSlug, isValidSlug } from '@/lib/onboarding/slug';
import { errorResponse, badRequest } from '@/lib/api/errors';

interface Body {
  name: string;
}

export async function POST(req: Request) {
  try {
    const { name } = (await req.json()) as Body;
    if (!name || name.trim().length < 2) return badRequest('name required');

    const base = generateSlug(name);
    if (!isValidSlug(base)) return badRequest('nama tidak bisa dijadikan slug, coba yang lain');

    const sb = createServiceClient();
    const candidates = [
      base,
      `${base}-id`,
      `${base}-order`,
      `${base}-${Math.random().toString(36).slice(2, 5)}`,
    ];

    const { data: taken } = await sb
      .from('tenants')
      .select('slug')
      .in('slug', candidates);

    const takenSet = new Set((taken ?? []).map((r) => r.slug));
    const available = candidates.filter((c) => !takenSet.has(c));

    return NextResponse.json({
      slug: base,
      available: !takenSet.has(base),
      alternatives: available.filter((c) => c !== base).slice(0, 3),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
