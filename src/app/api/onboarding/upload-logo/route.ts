// POST /api/onboarding/upload-logo
//
// Stores an owner-supplied logo during the onboarding chat. The pre-launch
// flow has no tenant row yet, so we can't use /api/admin/tenant/image (which
// requires `requireOwnerOrThrow`). We scope uploads to the authenticated
// user's folder — same convention that /api/ai/generate-logo uses — and the
// launch step reads `draft.logo_url` straight from there.

import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

function extFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'jpg';
}

export async function POST(req: Request) {
  try {
    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) return badRequest('photo field required');
    if (!ALLOWED.has(file.type)) return badRequest('photo must be jpeg/png/webp/svg');
    if (file.size > MAX_BYTES) return badRequest('photo must be < 5MB');

    const path = `user-${user.id}/logos/${nanoid()}.${extFor(file.type)}`;
    const service = createServiceClient();
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await service.storage.from('assets').upload(path, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: pub } = service.storage.from('assets').getPublicUrl(path);
    return NextResponse.json({ logo_url: pub.publicUrl });
  } catch (err) {
    return errorResponse(err);
  }
}
