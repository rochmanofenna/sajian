'use client';

// Phone OTP signup for new restaurant owners. Supabase Auth phone provider
// sends a 6-digit code via SMS (WhatsApp when configured) to the Indonesian
// mobile number. Phone is more idiomatic than email for F&B owners in Jakarta.
//
// Flow:
//   1. Owner types 08xxx / +628xxx / 628xxx — we normalize to E.164 +62xxx
//   2. signInWithOtp({ phone }) — SMS sent
//   3. verifyOtp({ phone, token, type: 'sms' }) — session established
//   4. If this user already owns a tenant → nudge to it; else → /setup

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatIdPhoneDisplay, isLikelyIdPhone, normalizeIdPhone } from '@/lib/auth/phone';

type Stage = 'phone' | 'otp';

export default function SignupPage() {
  const router = useRouter();
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
    setError(null);
    if (!canSend) {
      setError('Nomor HP tidak valid');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
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
      phone: normalized,
      token: otp,
      type: 'sms',
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
      router.push(`/?existing=${encodeURIComponent(existing.slug)}`);
    } else {
      router.push('/setup');
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Buat toko kamu</h1>
      <p className="text-zinc-600 mb-8">
        Masuk pakai nomor WhatsApp / HP. 15 menit sampai restoran kamu online.
      </p>

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
              className="mt-1 w-full h-12 px-4 rounded-lg border border-[#1B5E3B]/20 bg-white"
            />
            {display && (
              <span className="mt-1 block text-xs text-zinc-500 font-mono">{display}</span>
            )}
          </label>

          <button
            type="submit"
            disabled={!canSend}
            className="w-full h-12 rounded-full bg-[#1B5E3B] text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Kirim Kode via SMS
          </button>
        </form>
      )}

      {stage === 'otp' && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div className="text-sm text-zinc-600">
            Kode terkirim ke <span className="font-medium font-mono">{display || normalized}</span>.{' '}
            <button
              type="button"
              onClick={() => setStage('phone')}
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
              placeholder="123456"
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
            Cek SMS dari nomor resmi. Kalau gak dapet, kasih 1 menit lagi lalu
            klik &ldquo;Ubah&rdquo; untuk kirim ulang.
          </p>
        </form>
      )}

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
    </div>
  );
}
