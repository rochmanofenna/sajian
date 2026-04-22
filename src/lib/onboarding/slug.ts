// Slug derivation + validation. The final check against taken slugs happens
// server-side in /api/ai/suggest-slug — this file is safe to call from the
// browser for live previews.

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '') // strip non-ascii accents/emoji
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

// Subdomains must survive DNS: no leading/trailing hyphen, 2..30 chars,
// alphanumeric-plus-hyphen only.
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(slug);
}
