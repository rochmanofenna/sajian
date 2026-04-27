'use client';

// Owner signup. Email OTP by default (Supabase Resend provider is the only
// reliable path today), phone OTP available as a tab but degrades gracefully
// when SMS isn't provisioned. Either way: a 6-digit code, verify, and land
// on /setup to start the AI onboarding.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Phone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  formatIdPhoneDisplay,
  isLikelyEmail,
  isLikelyIdPhone,
  normalizeIdPhone,
} from '@/lib/auth/phone';
import { mapAuthError, isMethodUnavailable, type AuthMethod } from '@/lib/auth/error-map';
import { OTP_LENGTH } from '@/lib/auth/otp';

type Stage = 'identify' | 'otp';

export default function SignupPage() {
  const router = useRouter();
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
    setError(null);
    setHint(null);
    if (!canSend) {
      setError(
        method === 'email' ? 'Masukkan email yang valid.' : 'Nomor HP Indonesia tidak valid.',
      );
      return;
    }
    setLoading(true);

    const payload =
      method === 'email'
        ? { email: identifier.trim().toLowerCase() }
        : { phone: normalizedPhone };

    const { error } = await supabase.auth.signInWithOtp({
      ...payload,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      setError(mapAuthError(error, { method, stage: 'send' }));
      if (isMethodUnavailable(error, method) && method === 'phone') {
        setHint('Coba pakai email — SMS belum aktif di sini.');
      }
      return;
    }
    setStage('otp');
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload =
      method === 'email'
        ? { email: identifier.trim().toLowerCase(), token: otp, type: 'email' as const }
        : { phone: normalizedPhone, token: otp, type: 'sms' as const };

    const { data, error } = await supabase.auth.verifyOtp(payload);
    if (error || !data.user) {
      setLoading(false);
      setError(error ? mapAuthError(error, { method, stage: 'verify' }) : 'Kode verifikasi salah.');
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

  const sentTo = method === 'email' ? identifier.trim().toLowerCase() : phoneDisplay || normalizedPhone;

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Buat toko kamu</h1>
      <p className="text-zinc-600 mb-6">
        Masuk pakai email atau nomor WhatsApp. 15 menit sampai restoran kamu online.
      </p>

      {stage === 'identify' && (
        <>
          <MethodToggle method={method} onChange={switchMethod} />
          <form onSubmit={sendOtp} className="space-y-4">
            <label className="block">
              <span className="text-sm text-zinc-700">
                {method === 'email' ? 'Email' : 'Nomor WhatsApp'}
              </span>
              <div className="mt-1 flex items-center rounded-lg border border-[#1B5E3B]/20 bg-white h-12 px-3">
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
              className="w-full h-12 rounded-full bg-[#1B5E3B] text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Kirim kode {method === 'email' ? 'via email' : 'via SMS'}
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
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
              placeholder="12345678"
              className="mt-1 w-full h-12 px-4 rounded-lg border border-[#1B5E3B]/20 bg-white tracking-widest text-lg"
            />
          </label>

          <button
            type="submit"
            disabled={loading || otp.length < OTP_LENGTH}
            className="w-full h-12 rounded-full bg-[#1B5E3B] text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verifikasi
          </button>

          <p className="text-xs text-zinc-500 pt-2">
            Cek{' '}
            {method === 'email'
              ? 'kotak masuk (dan folder spam) untuk email dari Sajian'
              : 'SMS dari nomor resmi'}
            . Kalau gak dapet, kasih 1 menit lagi lalu klik &ldquo;Ubah&rdquo; untuk kirim ulang.
          </p>
        </form>
      )}

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      {hint && stage === 'identify' && !error && (
        <div className="mt-2 text-xs text-zinc-500">{hint}</div>
      )}
    </div>
  );
}

function MethodToggle({
  method,
  onChange,
}: {
  method: AuthMethod;
  onChange: (next: AuthMethod) => void;
}) {
  return (
    <div
      className="mb-4 inline-flex rounded-full border border-zinc-200 p-0.5 text-xs"
      role="group"
      aria-label="Metode daftar"
    >
      <button
        type="button"
        onClick={() => onChange('email')}
        aria-pressed={method === 'email'}
        className="rounded-full px-3 h-7 font-medium transition"
        style={
          method === 'email' ? { background: '#1B5E3B', color: '#fff' } : { color: '#555' }
        }
      >
        Email
      </button>
      <button
        type="button"
        onClick={() => onChange('phone')}
        aria-pressed={method === 'phone'}
        className="rounded-full px-3 h-7 font-medium transition"
        style={
          method === 'phone' ? { background: '#1B5E3B', color: '#fff' } : { color: '#555' }
        }
      >
        Nomor HP
      </button>
    </div>
  );
}
