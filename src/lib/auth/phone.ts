// Indonesian phone helpers — normalize local input to canonical E.164
// (+62xxxxxxxxx) and render a display string for the form preview.
//
// Accepted inputs:
//   08xxxxxxx      → +62 + the rest
//   +628xxx        → keep
//   628xxx         → prepend +
//   8xxxxxxxx      → assume bare Indonesian mobile (missing leading 0)
// Anything else is considered non-Indonesian and we do NOT attempt to
// normalize it — callers should validate with isLikelyIdPhone() before
// shipping the value to Supabase. Returning an empty string signals
// "not valid Indonesian" so the caller can show an explicit error.

export function normalizeIdPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    const rest = digits.slice(1);
    if (!rest.startsWith('8')) return '';
    return `+62${rest}`;
  }
  if (digits.startsWith('62')) {
    const rest = digits.slice(2);
    if (!rest.startsWith('8')) return '';
    return `+62${rest}`;
  }
  if (digits.startsWith('8')) {
    return `+62${digits}`;
  }
  // Not an Indonesian mobile — refuse to normalize. The validator below
  // will reject it and the UI will show the "must be Indonesian" copy.
  return '';
}

export function isLikelyIdPhone(raw: string): boolean {
  const n = normalizeIdPhone(raw);
  // Indonesian mobile numbers start with 8 after the country code and are
  // 9–12 digits total after +62 (so +62 followed by 9–12 digits, starting
  // with 8). Example: +62 812 3456 7890 (12 digits after +62).
  return /^\+628\d{8,11}$/.test(n);
}

// Display hint for the form: shows the full E.164 as the user types so they
// can verify before hitting send. Returns '' when input isn't plausibly
// Indonesian (so the UI doesn't advertise a value we'd reject).
export function formatIdPhoneDisplay(raw: string): string {
  if (!raw.trim()) return '';
  const n = normalizeIdPhone(raw);
  if (!n.startsWith('+62')) return '';
  const rest = n.slice(3);
  // 812 3456 7890 style grouping
  if (rest.length <= 3) return `+62 ${rest}`;
  if (rest.length <= 7) return `+62 ${rest.slice(0, 3)} ${rest.slice(3)}`;
  return `+62 ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`;
}

// Email is the default path for now — phone stays available but may fall
// back if Supabase's SMS provider is unconfigured.
export function isLikelyEmail(raw: string): boolean {
  const s = raw.trim();
  // Practical RFC 5322 subset — good enough for signup form validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
