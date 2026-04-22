// Indonesian phone helpers — input normalization + display formatting.
// Accepts `08xxxxxxx`, `+628xxx`, `628xxx`, or any whitespace/formatting
// variation. Returns canonical E.164 (`+628xxx`) suitable for passing to
// Supabase signInWithOtp({ phone }) and Xendit.

export function normalizeIdPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('62')) return `+${digits}`;
  if (digits.startsWith('8')) return `+62${digits}`;
  // Anything else (international) — preserve but ensure +.
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export function isLikelyIdPhone(raw: string): boolean {
  const n = normalizeIdPhone(raw);
  // +62 + 8-13 digits (Indonesian mobile numbers are 10-13 digits after +62).
  return /^\+62\d{8,13}$/.test(n);
}

// Display hint for the form: shows the full E.164 as the user types so they
// can verify before hitting send. Returns '' when not yet a plausible phone.
export function formatIdPhoneDisplay(raw: string): string {
  if (!raw.trim()) return '';
  const n = normalizeIdPhone(raw);
  if (!n.startsWith('+62')) return n;
  const rest = n.slice(3);
  // 812 3456 7890 style grouping
  if (rest.length <= 3) return `+62 ${rest}`;
  if (rest.length <= 7) return `+62 ${rest.slice(0, 3)} ${rest.slice(3)}`;
  return `+62 ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`;
}
