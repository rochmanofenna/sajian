// Tiny in-process rate limiter for AI endpoints. Keyed by userId + endpoint.
//
// Each serverless instance has its own Map, so this is approximate — a user
// can exceed the limit linearly with the number of cold containers Vercel
// spins up. Good enough to stop the obvious abuse (running extract-menu in
// a loop) without standing up Redis. Swap for Upstash or Vercel Ratelimit
// once traffic justifies it.
//
// Usage:
//   const { ok, retryAfter } = allow('menu-extract', userId, { max: 20, windowMs: 60_000 });
//   if (!ok) return NextResponse.json({ error: '...' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });

interface Bucket {
  hits: number[];
}

interface Options {
  max: number;
  windowMs: number;
}

const BUCKETS = new Map<string, Bucket>();

export function allow(
  endpoint: string,
  key: string,
  { max, windowMs }: Options,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const composite = `${endpoint}:${key}`;
  let bucket = BUCKETS.get(composite);
  if (!bucket) {
    bucket = { hits: [] };
    BUCKETS.set(composite, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => t > now - windowMs);
  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfter };
  }
  bucket.hits.push(now);
  // Keep memory bounded — a super-active user has at most `max` entries,
  // plus we periodically prune empty buckets to avoid leaks.
  if (BUCKETS.size > 2000) {
    for (const [k, v] of BUCKETS.entries()) {
      v.hits = v.hits.filter((t) => t > now - windowMs);
      if (v.hits.length === 0) BUCKETS.delete(k);
    }
  }
  return { ok: true, retryAfter: 0 };
}

// Preset profiles.
export const AI_RATE_PROFILES = {
  chat: { max: 30, windowMs: 60_000 }, // 30/min — chat is interactive
  extract: { max: 20, windowMs: 60_000 * 5 }, // 20 per 5 min — images are expensive
  logo: { max: 10, windowMs: 60_000 * 5 },
  slug: { max: 60, windowMs: 60_000 },
} as const;
