// sajian.app/login — owner re-entry. Phone/email OTP. On success we look up
// the tenant this user owns and redirect to [slug].sajian.app/admin.
// Uses email OTP to match the existing /signup flow; when Supabase Phone
// auth is enabled the inputs swap without touching this file's logic.

'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Stage = 'email' | 'otp' | 'redirecting';

export default function LoginPage() {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
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

    setStage('redirecting');
    setHint('Mencari toko kamu…');

    const { data: ownedTenant, error: tErr } = await supabase
      .from('tenants')
      .select('slug')
      .eq('owner_user_id', data.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (tErr) {
      setStage('otp');
      setLoading(false);
      setError(tErr.message);
      return;
    }

    if (!ownedTenant) {
      setStage('otp');
      setLoading(false);
      setError('Akun ini belum punya toko. Buat toko di sajian.app/signup.');
      return;
    }

    // Cross-subdomain redirect. In local dev (.localhost) we fall back to
    // the same origin with a slug query so the owner can open it manually.
    const host = window.location.host;
    const isLocalDev = host.endsWith('.localhost') || host.includes('localhost');
    if (isLocalDev) {
      window.location.href = `http://${ownedTenant.slug}.localhost:${window.location.port || 3000}/admin`;
    } else {
      const apex = host.replace(/^[^.]+\./, '');
      const baseHost = host.startsWith('www.') ? host.slice(4) : apex.includes('.') ? apex : host;
      window.location.href = `https://${ownedTenant.slug}.${baseHost}/admin`;
    }
  }

  return (
    <main className="min-h-screen bg-[#F4EDE0] text-[#0A0B0A] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <a href="/" className="inline-block mb-10 text-lg" style={{ fontFamily: 'var(--font-display, serif)' }}>
          Sajian<span className="text-[#B8732E]">.</span>
        </a>
        <h1 className="text-3xl font-medium tracking-tight mb-2" style={{ fontFamily: 'var(--font-display, serif)' }}>
          Masuk ke toko kamu
        </h1>
        <p className="text-sm text-zinc-600 mb-8">
          Kode verifikasi akan dikirim ke email yang kamu daftarkan saat onboarding.
        </p>

        {stage === 'email' && (
          <form onSubmit={sendOtp} className="space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kamu@contoh.com"
                className="mt-1 w-full h-12 px-4 rounded-full border border-zinc-300 bg-white focus:outline-none focus:border-zinc-800"
              />
            </label>
            <button
              type="submit"
              disabled={loading || email.length < 5}
              className="w-full h-12 rounded-full bg-[#0A0B0A] text-[#F4EDE0] font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Kirim kode
            </button>
          </form>
        )}

        {stage === 'otp' && (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div className="text-xs text-zinc-600">
              Kode dikirim ke <span className="font-medium">{email}</span>.{' '}
              <button type="button" onClick={() => setStage('email')} className="underline">
                Ubah
              </button>
            </div>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Kode verifikasi</span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="123456"
                className="mt-1 w-full h-12 px-4 rounded-full border border-zinc-300 bg-white tracking-widest text-lg focus:outline-none focus:border-zinc-800"
              />
            </label>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full h-12 rounded-full bg-[#0A0B0A] text-[#F4EDE0] font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Masuk
            </button>
          </form>
        )}

        {stage === 'redirecting' && (
          <div className="flex items-center gap-3 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" /> {hint}
          </div>
        )}

        {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

        <p className="mt-10 text-xs text-zinc-500">
          Belum punya toko? <a href="/signup" className="underline">Buat toko →</a>
        </p>
      </div>
    </main>
  );
}
