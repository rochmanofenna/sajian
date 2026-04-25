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
  // Typography overrides. Null = template default. Either field
  // accepts a Google Fonts family name; the root layout fetches the
  // CSS link dynamically and exposes them as --font-heading /
  // --font-body so storefront templates can pick them up.
  heading_font_family: string | null;
  body_font_family: string | null;
  multi_branch_mode: boolean | null;
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
    heading_font_family: t.heading_font_family,
    body_font_family: t.body_font_family,
    multi_branch_mode: t.multi_branch_mode,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

// Hostnames that should never resolve to a tenant.
// Hosts that are the "app" (marketing + owner dashboard). NONE of them
// ever resolve to a tenant slug — they are the sajian.app product
// surface itself. Anything else ending in `.sajian.app` is considered
// a tenant subdomain.
const APP_HOSTS = new Set([
  'sajian.app',
  'www.sajian.app',
  'app.sajian.app',
  'localhost',
  'localhost:3000',
  '127.0.0.1',
]);

export function slugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const lowered = host.toLowerCase();
  const cleanHost = lowered.split(':')[0];

  if (APP_HOSTS.has(lowered) || APP_HOSTS.has(cleanHost)) return null;

  // Any *.vercel.app URL (preview or prod alias) → marketing / app.
  // Tenants are only ever resolved from subdomains of sajian.app.
  if (cleanHost.endsWith('.vercel.app')) return null;

  // Subdomain = first label. Works for mindiology.sajian.app AND
  // mindiology.localhost. Preview origin (preview.sajian.app) resolves
  // to slug='preview'; callers that care handle it explicitly.
  const first = cleanHost.split('.')[0];
  if (!first || first === 'www' || first === 'app') return null;
  return first;
}

export const getTenantSlug = cache(async (): Promise<string | null> => {
  const h = await headers();
  const explicit = h.get('x-tenant-slug');
  if (explicit) return explicit;
  return slugFromHost(h.get('host'));
});

// Fetches the tenant row regardless of is_active. Use this when the caller
// wants to handle the "deactivated tenant" case explicitly (storefront shows
// an offline notice; admin lets the owner reactivate).
export const getTenantAnyStatus = cache(async (): Promise<Tenant | null> => {
  const slug = await getTenantSlug();
  if (!slug) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error(`[tenant] lookup failed for slug="${slug}":`, error.message);
    return null;
  }
  return (data as Tenant | null) ?? null;
});

// Active-only lookup. Returns null for deactivated tenants so callers that
// only care about the live storefront don't need to think about the inactive
// case. Most API routes and storefront pages use this.
export const getTenant = cache(async (): Promise<Tenant | null> => {
  const t = await getTenantAnyStatus();
  return t && t.is_active ? t : null;
});

// Throws 404-equivalent if the tenant can't be resolved. Use from pages that
// only make sense inside a tenant context. Tenant must be active.
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

export async function getPublicTenantAnyStatus(): Promise<PublicTenant | null> {
  const t = await getTenantAnyStatus();
  return t ? toPublicTenant(t) : null;
}

export async function requirePublicTenant(): Promise<PublicTenant> {
  return toPublicTenant(await requireTenant());
}
