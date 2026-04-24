// Error normalisation for API routes. ESB sometimes returns stack traces in
// its error body — we strip those out before sending anything to the
// browser. Supabase returns PostgrestError objects that are NOT instances
// of Error (they're plain { message, code, details, hint, status }), so the
// previous version here masked every Postgres failure as "Unknown error".
// We now unwrap duck-typed error objects too and bubble up a stable
// `request_id` the client can show for support look-ups.

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { ESBError } from '@/lib/esb/client';

interface NormalizedError {
  message: string;
  code?: string;
  status: number;
}

function asPostgrestShape(err: unknown):
  | {
      message: string;
      code?: string;
      details?: string;
      hint?: string;
      status?: number;
    }
  | null {
  if (!err || typeof err !== 'object') return null;
  const candidate = err as Record<string, unknown>;
  if (typeof candidate.message !== 'string') return null;
  return {
    message: candidate.message,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    details: typeof candidate.details === 'string' ? candidate.details : undefined,
    hint: typeof candidate.hint === 'string' ? candidate.hint : undefined,
    status: typeof candidate.status === 'number' ? candidate.status : undefined,
  };
}

function normalize(err: unknown): NormalizedError {
  if (err instanceof ESBError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return { message: err.message, status };
  }
  if (err instanceof Error) {
    if (err.message === 'NO_TENANT') return { message: 'Tenant not found', status: 404 };
    if (err.message === 'NOT_OWNER') return { message: 'Not authorised', status: 403 };
    return { message: err.message, status: 500 };
  }
  const pg = asPostgrestShape(err);
  if (pg) {
    return {
      message: [pg.message, pg.details, pg.hint].filter(Boolean).join(' · '),
      code: pg.code,
      status: pg.status ?? 500,
    };
  }
  return { message: 'Unknown error', status: 500 };
}

export function errorResponse(err: unknown): NextResponse {
  const requestId = randomUUID();
  const n = normalize(err);
  // Log full error server-side with the request id so engineers can cross-
  // reference Vercel logs against the trace id shown to the user.
  console.error(`[api] ${requestId} ${n.code ?? ''} ${n.message}`, err);
  const body: Record<string, unknown> = { error: n.message, request_id: requestId };
  if (n.code) body.code = n.code;
  return NextResponse.json(body, { status: n.status });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
