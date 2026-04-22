// Client-safe tenant type fragments. Anything exported from here must not
// pull server-only modules (next/headers, supabase service client, etc.)
// so client components can import it without bundler complaints.
//
// The full server-side `Tenant` type + data-fetching helpers live in
// `./tenant.ts` — import that from server code only.

export type PosProvider = 'sajian_native' | 'esb';
export type ThemeTemplate = 'kedai' | 'warung' | 'modern' | 'food-hall' | 'classic';

export const THEME_TEMPLATES: ThemeTemplate[] = [
  'kedai',
  'warung',
  'modern',
  'food-hall',
  'classic',
];
