// GET /api/onboarding/qr?slug=...&format=png|svg
//
// Returns a QR code pointing at https://{slug}.sajian.app. PNG is the
// default (1024px, high contrast, for printing). SVG is available for
// embedding on dashboard pages.

import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { badRequest, errorResponse } from '@/lib/api/errors';
import { isValidSlug } from '@/lib/onboarding/slug';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    const format = url.searchParams.get('format') === 'svg' ? 'svg' : 'png';
    if (!slug || !isValidSlug(slug)) return badRequest('slug required');

    const domain = process.env.PLATFORM_DOMAIN ?? 'sajian.app';
    const target = `https://${slug}.${domain}`;

    if (format === 'svg') {
      const svg = await QRCode.toString(target, { type: 'svg', margin: 2 });
      return new NextResponse(svg, {
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    }

    const png = await QRCode.toBuffer(target, {
      width: 1024,
      margin: 2,
      color: { dark: '#1A1A18', light: '#FFFFFF' },
    });
    const body = new Uint8Array(png);

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${slug}-qr.png"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
