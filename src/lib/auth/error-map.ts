// Translate Supabase / network auth errors to user-friendly Indonesian.
// Unknown errors fall back to a generic message so the UI never shows raw
// "Unsupported phone provider" etc.

export type AuthMethod = 'email' | 'phone';

interface MapContext {
  method: AuthMethod;
  stage: 'send' | 'verify';
}

const PATTERNS: Array<{ match: RegExp; msg: (ctx: MapContext) => string }> = [
  // --- phone / sms provider unavailable ----------------------------------
  // Supabase returns "Signups not allowed for otp" when the provider has
  // signups disabled. It ALSO returns the same string on login for a
  // non-existent user — distinguish by stage. Phone users get a fallback
  // suggestion; email users get "try again" without "contact support"
  // (the config fix is in Supabase, not a support ticket).
  {
    match: /signups?\s+not\s+allowed\s+for\s+otp/i,
    msg: ({ method, stage }) => {
      if (stage === 'verify') return 'Kode verifikasi salah. Coba lagi.';
      if (method === 'phone') {
        return 'SMS belum tersedia. Silakan pakai email untuk sementara.';
      }
      return 'Akun belum terdaftar. Daftar dulu di /signup.';
    },
  },
  {
    match: /unsupported\s+phone\s+provider/i,
    msg: () => 'SMS belum aktif. Silakan pakai email.',
  },
  {
    match: /phone\s+provider.*not\s+configured/i,
    msg: () => 'SMS belum aktif. Silakan pakai email.',
  },
  {
    match: /email\s+provider.*not\s+configured|email\s+not\s+enabled|email\s+signups?\s+disabled/i,
    msg: () => 'Login email belum aktif. Coba lagi nanti atau hubungi support.',
  },
  // --- verification failures ---------------------------------------------
  {
    match: /invalid\s+login\s+credentials/i,
    msg: () => 'Kode verifikasi salah. Coba lagi.',
  },
  {
    match: /otp\s+expired|token\s+has\s+expired/i,
    msg: () => 'Kode sudah kadaluarsa. Kirim ulang kode baru.',
  },
  {
    match: /token\s+(is\s+)?(invalid|incorrect)/i,
    msg: () => 'Kode verifikasi salah. Coba lagi.',
  },
  // --- existence / signup rules ------------------------------------------
  {
    match: /user\s+not\s+found/i,
    msg: () => 'Akun belum terdaftar. Silakan daftar dulu.',
  },
  {
    match: /user\s+already\s+registered/i,
    msg: () => 'Akun sudah terdaftar. Silakan masuk.',
  },
  // --- rate limiting -----------------------------------------------------
  {
    match: /rate\s+limit|too\s+many\s+requests|for\s+security\s+purposes/i,
    msg: () => 'Terlalu banyak percobaan. Tunggu 1 menit lalu coba lagi.',
  },
  {
    match: /email\s+rate\s+limit\s+exceeded/i,
    msg: () => 'Kode sudah dikirim. Tunggu 1 menit sebelum minta kode baru.',
  },
  // --- input validation --------------------------------------------------
  {
    match: /invalid\s+email/i,
    msg: () => 'Format email tidak valid.',
  },
  {
    match: /invalid\s+phone/i,
    msg: () => 'Nomor HP tidak valid. Gunakan format 0812xxxxxxxx.',
  },
  // --- network -----------------------------------------------------------
  {
    match: /network|failed\s+to\s+fetch|load\s+failed/i,
    msg: () => 'Gagal terhubung ke server. Cek koneksi internet.',
  },
];

export function mapAuthError(err: unknown, ctx: MapContext): string {
  if (!err) return 'Terjadi kesalahan. Coba lagi nanti.';
  // Log the raw error so the real Supabase code / status is visible in
  // Vercel logs when a user reports a cryptic Indonesian message.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.error('[auth] raw supabase error', {
      method: ctx.method,
      stage: ctx.stage,
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      ...(typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {}),
    });
  }
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);
  for (const { match, msg } of PATTERNS) {
    if (match.test(message)) return msg(ctx);
  }
  return 'Terjadi kesalahan. Coba lagi nanti.';
}

// Tells the UI whether a given error means the chosen method is unavailable,
// so it can auto-suggest switching to the other method.
export function isMethodUnavailable(err: unknown, method: AuthMethod): boolean {
  if (!err) return false;
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);
  if (method === 'phone') {
    return /unsupported\s+phone\s+provider|phone\s+provider.*not\s+configured|signups?\s+not\s+allowed\s+for\s+otp/i.test(
      message,
    );
  }
  return /email\s+provider.*not\s+configured|email\s+not\s+enabled/i.test(message);
}
