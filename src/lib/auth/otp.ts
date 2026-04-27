// Single source of truth for the OTP length our Supabase project sends.
// Supabase / GoTrue defaulted to 6-digit codes for years; recent platform
// upgrades changed the default to 8 (longer codes are harder to brute-force).
// Our project follows the platform default. The login + signup UIs both
// import this constant so a future config change is a one-line edit
// instead of a hunt across pages.

export const OTP_LENGTH = 8;
