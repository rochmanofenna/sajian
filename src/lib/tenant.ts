// Tenant resolver. Reads `x-tenant-slug` set by middleware; falls back to the
// Host header for API routes (the matcher excludes /api/* so the header never
// makes it there). Cached per request via React `cache()`.
//
// Root domain (sajian.app / localhost:3000 / vercel preview) → null. Callers
// decide whether to render a marketing page, redirect, or 404.

import { cache } from 'react';
import { headers } from 'next/headers';
import type { PosProvider, ThemeTemplate } from './tenant-types';
import { createServiceClient } from './supabase/service';

// Re-export client-safe fragments so server callers get a single import
// surface. Anything new that's also used from a Client Component should
// live in `./tenant-types.ts`.
export { THEME_TEMPLATES } from './tenant-types';
export type { PosProvider, ThemeTemplate } from './tenant-types';

export interface TenantTier {
  name: string;
  min: number;
  color: string;
  emoji?: string;
}

export interface TenantReward {
  name: string;
  points: number;
  description?: string;
}

export interface TenantFeatures {
  reservations: boolean;
  delivery: boolean;
  cashier_payment: boolean;
  member_rewards: boolean;
  ai_ordering: boolean;
}

export interface TenantColors {
  primary: string;
  accent: string;
  background: string;
  dark: string;
}

export interface ESBPosConfig {
  esb_company_code: string;
  esb_default_branch: string;
  esb_bearer_token: string;
  esb_environment: 'staging' | 'production';
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  colors: TenantColors;
  contact_email: string | null;
  support_whatsapp: string | null;
  country_code: string;
  currency_symbol: string;
  locale: string;
  fallback_coords: { lat: number; lng: number } | null;
  features: TenantFeatures;
  tiers: TenantTier[];
  rewards: TenantReward[];
  pos_provider: PosProvider;
  pos_config: ESBPosConfig | null;
  operating_hours: Record<string, unknown> | null;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  is_active: boolean;
  owner_phone: string | null;
  owner_name: string | null;
  theme_template: ThemeTemplate;
  hero_image_url: string | null;
  created_at: string;
  updated_at: string;
}

// Strictly the fields safe to ship to the browser. Anything that touches
// auth/PII (pos_config, contact_email, owner_*) stays server-side only.
export type PublicTenant = Omit<
  Tenant,
  'pos_config' | 'contact_email' | 'owner_phone' | 'owner_name'
>;

export function toPublicTenant(t: Tenant): PublicTenant {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    logo_url: t.logo_url,
    colors: t.colors,
    support_whatsapp: t.support_whatsapp,
    country_code: t.country_code,
    currency_symbol: t.currency_symbol,
    locale: t.locale,
    fallback_coords: t.fallback_coords,
    features: t.features,
    tiers: t.tiers,
    rewards: t.rewards,
    pos_provider: t.pos_provider,
    operating_hours: t.operating_hours,
    subscription_tier: t.subscription_tier,
    is_active: t.is_active,
    theme_template: t.theme_template,
    hero_image_url: t.hero_image_url,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

// Hostnames that should never resolve to a tenant.
const ROOT_HOSTS = new Set(['sajian.app', 'www.sajian.app', 'localhost', 'localhost:3000']);

export function slugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const cleanHost = host.split(':')[0].toLowerCase();

  if (cleanHost === 'sajian.app' || cleanHost === 'www.sajian.app') return null;
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') return null;
  if (ROOT_HOSTS.has(host.toLowerCase())) return null;

  // Any *.vercel.app URL (preview or prod alias) → marketing.
  // Tenants are only ever resolved from subdomains of sajian.app.
  if (cleanHost.endsWith('.vercel.app')) return null;

  // Subdomain = first label. Works for mindiology.sajian.app AND mindiology.localhost.
  const first = cleanHost.split('.')[0];
  if (!first || first === 'www') return null;
  return first;
}

export const getTenantSlug = cache(async (): Promise<string | null> => {
  const h = await headers();
  const explicit = h.get('x-tenant-slug');
  if (explicit) return explicit;
  return slugFromHost(h.get('host'));
});

export const getTenant = cache(async (): Promise<Tenant | null> => {
  const slug = await getTenantSlug();
  if (!slug) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error(`[tenant] lookup failed for slug="${slug}":`, error.message);
    return null;
  }
  return (data as Tenant | null) ?? null;
});

// Throws 404-equivalent if the tenant can't be resolved. Use from pages that
// only make sense inside a tenant context.
export async function requireTenant(): Promise<Tenant> {
  const t = await getTenant();
  if (!t) {
    throw new Error('NO_TENANT');
  }
  return t;
}

// Page-level fetchers. These return PublicTenant so the object is safe to
// pass directly as a prop to a Client Component (which serializes into the
// RSC payload). Never use the full `getTenant()` / `requireTenant()` inside
// a page that hands the tenant to a "use client" boundary — pos_config would
// leak.
export async function getPublicTenant(): Promise<PublicTenant | null> {
  const t = await getTenant();
  return t ? toPublicTenant(t) : null;
}

export async function requirePublicTenant(): Promise<PublicTenant> {
  return toPublicTenant(await requireTenant());
}
