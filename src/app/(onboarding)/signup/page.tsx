'use client';

// Email OTP signup for new restaurant owners. Supabase Auth email provider
// sends a 6-digit code (and a magic link) to the entered email. We use the
// 6-digit code so the flow stays on one page — no email-link round-trip.
//
// Why email instead of phone: Supabase's Phone provider now requires an SMS
// vendor to be configured before it'll save, and Twilio onboarding is a
// detour we don't need for dev. Phone OTP can swap in later without any
// schema change (tenants.owner_user_id + owner_phone are populated from
// whatever identity we end up using).
//
// After verification:
//   • If this user already owns a tenant → nudge them toward it
//   • Otherwise → /setup to start onboarding

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Stage = 'email' | 'otp';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
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
    setError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp,
      type: 'email',
    });
    if (error || !data.user) {
      setLoading(false);
      setError(error?.message ?? 'Kode salah');
      return;
    }

    const { data: existing } = await supabase
      .from('tenants')
      .select('slug')
      .eq('owner_user_id', data.user.id)
      .maybeSingle();

    setLoading(false);
    if (existing?.slug) {
      // No wildcard DNS on localhost, so just show the slug on the landing
      // page for the dev to open via /etc/hosts. In prod this becomes a
      // cross-subdomain redirect.
      router.push(`/?existing=${encodeURIComponent(existing.slug)}`);
    } else {
      router.push('/setup');
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Buat toko kamu</h1>
      <p className="text-zinc-600 mb-8">
        Masuk dengan email. Cuma butuh 15 menit sampai restoran kamu online.
      </p>

      {stage === 'email' && (
        <form onSubmit={sendOtp} className="space-y-4">
          <label className="block">
            <span className="text-sm text-zinc-700">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kamu@contoh.com"
              className="mt-1 w-full h-12 px-4 rounded-lg border border-[#1B5E3B]/20 bg-white"
            />
          </label>

          <button
            type="submit"
            disabled={loading || email.length < 5}
            className="w-full h-12 rounded-full bg-[#1B5E3B] text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Kirim Kode
          </button>
        </form>
      )}

      {stage === 'otp' && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div className="text-sm text-zinc-600">
            Kode terkirim ke <span className="font-medium">{email}</span>.{' '}
            <button
              type="button"
              onClick={() => setStage('email')}
              className="underline text-[#1B5E3B]"
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
              placeholder="22489071"
              className="mt-1 w-full h-12 px-4 rounded-lg border border-[#1B5E3B]/20 bg-white tracking-widest text-lg"
            />
          </label>

          <button
            type="submit"
            disabled={loading || otp.length < 6}
            className="w-full h-12 rounded-full bg-[#1B5E3B] text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verifikasi
          </button>

          <p className="text-xs text-zinc-500 pt-2">
            Cek inbox (dan folder spam) — Supabase kirim email dengan kode 6 digit.
          </p>
        </form>
      )}

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
    </div>
  );
}
