'use client';

// Inline phone-OTP login shown when /admin is opened without a session (or
// by a signed-in user who isn't the tenant owner). Uses the same Supabase
// phone-OTP flow as /signup for consistency.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { PublicTenant } from '@/lib/tenant';
import { formatIdPhoneDisplay, isLikelyIdPhone, normalizeIdPhone } from '@/lib/auth/phone';

type Stage = 'phone' | 'otp' | 'error';

export function OwnerLogin({ tenant, reason }: { tenant: PublicTenant; reason: 'unauth' | 'not_owner' }) {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = isLikelyIdPhone(phone) && !loading;
  const normalized = normalizeIdPhone(phone);
  const display = formatIdPhoneDisplay(phone);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) {
      setError('Nomor HP tidak valid');
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStage('otp');
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: otp,
      type: 'sms',
    });
    setLoading(false);
    if (error) {
      setError(error.message ?? 'Kode salah');
      return;
    }
    // Server components re-evaluate the session on reload.
    window.location.reload();
  }

  const primary = tenant.colors.primary;

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="mb-8">
        <div
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em]"
          style={{ color: primary }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: primary }} />
          Admin · {tenant.name}
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Masuk ke dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {reason === 'not_owner'
            ? 'Kamu sudah masuk, tapi akun ini bukan pemilik toko ini. Masuk dengan nomor HP owner yang didaftarkan.'
            : 'Masukkan nomor WhatsApp owner yang didaftarkan saat onboarding. Kami kirim kode 6 digit via SMS.'}
        </p>
      </div>

      {stage === 'phone' && (
        <form onSubmit={sendOtp} className="space-y-4">
          <label className="block">
            <span className="text-sm text-zinc-700">Nomor WhatsApp</span>
            <input
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0812 3456 7890"
              className="mt-1 w-full h-12 px-4 rounded-lg border border-zinc-300 bg-white"
            />
            {display && <span className="mt-1 block text-xs text-zinc-500 font-mono">{display}</span>}
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
      )}

      {stage === 'otp' && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div className="text-sm text-zinc-600">
            Kode terkirim ke <span className="font-medium font-mono">{display || normalized}</span>.{' '}
            <button type="button" onClick={() => setStage('phone')} className="underline" style={{ color: primary }}>
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
    </div>
  );
}
