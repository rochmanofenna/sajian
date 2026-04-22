// Error normalisation for API routes. ESB sometimes returns stack traces in
// its error body — we strip those out before sending anything to the browser.

import { NextResponse } from 'next/server';
import { ESBError } from '@/lib/esb/client';

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ESBError) {
    return NextResponse.json(
      { error: err.message, path: err.path },
      { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
    );
  }
  if (err instanceof Error) {
    if (err.message === 'NO_TENANT') {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    console.error('[api] unexpected error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  console.error('[api] unknown error:', err);
  return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
