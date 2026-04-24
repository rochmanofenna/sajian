'use client';

// Inline login shown when /admin is opened without a session (or by a signed-
// in user who isn't the tenant owner). Mirrors the apex /login UX — email OTP
// by default, phone OTP as a tab, Indonesian error copy, tenant-tinted button.

import { useState } from 'react';
import { Loader2, Mail, Phone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { PublicTenant } from '@/lib/tenant';
import {
  formatIdPhoneDisplay,
  isLikelyEmail,
  isLikelyIdPhone,
  normalizeIdPhone,
} from '@/lib/auth/phone';
import { mapAuthError, isMethodUnavailable, type AuthMethod } from '@/lib/auth/error-map';

type Stage = 'identify' | 'otp';

export function OwnerLogin({
  tenant,
  reason,
}: {
  // Optional: apex (sajian.app/admin) renders this without a host
  // tenant and styles the login neutrally. Subdomain paths still pass
  // the tinted tenant to keep the brand continuity.
  tenant?: PublicTenant;
  reason: 'unauth' | 'not_owner';
}) {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('identify');
  const [method, setMethod] = useState<AuthMethod>('email');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const normalizedPhone = normalizeIdPhone(identifier);
  const phoneDisplay = formatIdPhoneDisplay(identifier);
  const canSend =
    !loading &&
    (method === 'email' ? isLikelyEmail(identifier) : isLikelyIdPhone(identifier));

  function switchMethod(next: AuthMethod) {
    if (next === method) return;
    setMethod(next);
    setIdentifier('');
    setOtp('');
    setError(null);
    setHint(null);
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) {
      setError(
        method === 'email' ? 'Masukkan email yang valid.' : 'Nomor HP Indonesia tidak valid.',
      );
      return;
    }
    setLoading(true);
    setError(null);
    setHint(null);

    const payload =
      method === 'email'
        ? { email: identifier.trim().toLowerCase() }
        : { phone: normalizedPhone };

    const { error } = await supabase.auth.signInWithOtp({
      ...payload,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      setError(mapAuthError(error, { method, stage: 'send' }));
      if (isMethodUnavailable(error, method) && method === 'phone') {
        setHint('Ganti ke email — SMS belum aktif.');
      }
      return;
    }
    setStage('otp');
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload =
      method === 'email'
        ? { email: identifier.trim().toLowerCase(), token: otp, type: 'email' as const }
        : { phone: normalizedPhone, token: otp, type: 'sms' as const };

    const { error } = await supabase.auth.verifyOtp(payload);
    setLoading(false);
    if (error) {
      setError(mapAuthError(error, { method, stage: 'verify' }));
      return;
    }
    // Server components re-evaluate the session on reload.
    window.location.reload();
  }

  const primary = tenant?.colors.primary ?? '#111827';
  const brandLabel = tenant ? `Admin · ${tenant.name}` : 'Admin Sajian';
  const sentTo = method === 'email' ? identifier.trim().toLowerCase() : phoneDisplay || normalizedPhone;

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="mb-8">
        <div
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em]"
          style={{ color: primary }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: primary }} />
          {brandLabel}
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Masuk ke dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {reason === 'not_owner'
            ? 'Kamu sudah masuk, tapi akun ini bukan pemilik toko ini. Masuk dengan akun owner yang didaftarkan.'
            : 'Masukkan email atau nomor WhatsApp owner yang didaftarkan saat onboarding. Kami kirim kode 6 digit.'}
        </p>
      </div>

      {stage === 'identify' && (
        <>
          <div
            className="mb-4 inline-flex rounded-full border border-zinc-200 p-0.5 text-xs"
            role="group"
            aria-label="Metode masuk"
          >
            <button
              type="button"
              onClick={() => switchMethod('email')}
              aria-pressed={method === 'email'}
              className="rounded-full px-3 h-7 font-medium transition"
              style={
                method === 'email'
                  ? { background: primary, color: '#fff' }
                  : { color: '#555' }
              }
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => switchMethod('phone')}
              aria-pressed={method === 'phone'}
              className="rounded-full px-3 h-7 font-medium transition"
              style={
                method === 'phone'
                  ? { background: primary, color: '#fff' }
                  : { color: '#555' }
              }
            >
              Nomor HP
            </button>
          </div>

          <form onSubmit={sendOtp} className="space-y-4">
            <label className="block">
              <span className="text-sm text-zinc-700">
                {method === 'email' ? 'Email' : 'Nomor WhatsApp'}
              </span>
              <div className="mt-1 flex items-center h-12 px-3 rounded-lg border border-zinc-300 bg-white">
                {method === 'email' ? (
                  <Mail className="h-4 w-4 text-zinc-400 mr-2" aria-hidden="true" />
                ) : (
                  <Phone className="h-4 w-4 text-zinc-400 mr-2" aria-hidden="true" />
                )}
                <input
                  type={method === 'email' ? 'email' : 'tel'}
                  required
                  autoComplete={method === 'email' ? 'email' : 'tel'}
                  inputMode={method === 'email' ? 'email' : 'tel'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={method === 'email' ? 'nama@domain.com' : '0812 3456 7890'}
                  className="flex-1 bg-transparent focus:outline-none"
                />
              </div>
              {method === 'phone' && phoneDisplay && (
                <span className="mt-1 block text-xs text-zinc-500 font-mono">{phoneDisplay}</span>
              )}
            </label>
            <button
              type="submit"
              disabled={!canSend}
              className="w-full h-12 rounded-full font-medium text-white flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: primary }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Kirim kode
            </button>
          </form>
        </>
      )}

      {stage === 'otp' && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div className="text-sm text-zinc-600">
            Kode terkirim ke <span className="font-medium font-mono">{sentTo}</span>.{' '}
            <button
              type="button"
              onClick={() => setStage('identify')}
              className="underline"
              style={{ color: primary }}
            >
              Ubah
            </button>
          </div>
          <label className="block">
            <span className="text-sm text-zinc-700">Kode verifikasi</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="123456"
              className="mt-1 w-full h-12 px-4 rounded-lg border border-zinc-300 bg-white tracking-widest text-lg"
            />
          </label>
          <button
            type="submit"
            disabled={loading || otp.length < 6}
            className="w-full h-12 rounded-full font-medium text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: primary }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verifikasi
          </button>
        </form>
      )}

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      {hint && !error && <div className="mt-2 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}
