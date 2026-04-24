// sajian.app/login — owner re-entry. Email OTP by default (Supabase's
// built-in Resend provider is the only reliable path today), phone OTP
// available as a tab but gracefully degrades if SMS isn't provisioned.
// Indonesian error copy throughout, tenant-aware redirect on success.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, Phone, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PageNav } from '@/components/chrome/PageNav';
import {
  formatIdPhoneDisplay,
  isLikelyEmail,
  isLikelyIdPhone,
  normalizeIdPhone,
} from '@/lib/auth/phone';
import { mapAuthError, isMethodUnavailable, type AuthMethod } from '@/lib/auth/error-map';

type Stage = 'checking' | 'identify' | 'otp' | 'redirecting';

export default function LoginPage() {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('checking');
  const [method, setMethod] = useState<AuthMethod>('email');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Session-skip: if the user already has a session, jump straight to admin.
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setStage('identify');
        return;
      }
      setHint('Sudah masuk — membuka dashboard…');
      setStage('redirecting');
      await routeToOwnerAdmin(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function routeToOwnerAdmin(userId: string) {
    const host = window.location.host;
    const subLabel = host.split(':')[0].split('.')[0];
    const isApex = subLabel === 'sajian' || subLabel === 'www' || subLabel === 'localhost';

    if (!isApex) {
      const { data: t } = await supabase
        .from('tenants')
        .select('slug, owner_user_id')
        .eq('slug', subLabel)
        .maybeSingle();
      if (t && t.owner_user_id === userId) {
        window.location.href = '/admin';
        return;
      }
    }

    const { data: owned } = await supabase
      .from('tenants')
      .select('slug, created_at')
      .eq('owner_user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const slug = owned?.[0]?.slug;
    if (!slug) {
      setStage('identify');
      setError('Akun ini belum punya toko. Buat toko dulu di /signup.');
      return;
    }
    if (host.includes('localhost')) {
      window.location.href = `http://${slug}.localhost:${window.location.port || 3000}/admin`;
    } else {
      window.location.href = `https://${slug}.sajian.app/admin`;
    }
  }

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
        setHint('Ganti ke email — SMS belum aktif di sini.');
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

    const { data, error } = await supabase.auth.verifyOtp(payload);
    if (error || !data.user) {
      setLoading(false);
      setError(error ? mapAuthError(error, { method, stage: 'verify' }) : 'Kode verifikasi salah.');
      return;
    }
    setStage('redirecting');
    setHint('Mencari toko kamu…');
    await routeToOwnerAdmin(data.user.id);
  }

  const sentTo = method === 'email' ? identifier.trim().toLowerCase() : phoneDisplay || normalizedPhone;

  return (
    <>
      <PageNav label="Masuk" backHref="/" caption="owner login" />

      <main className="auth">
        <div className="auth__ornament" aria-hidden="true">❦</div>

        <section className="auth__card">
          <header className="auth__header">
            <span className="auth__kicker">Sajian · masuk akun</span>
            <h1 className="auth__title">Masuk ke toko kamu.</h1>
            <p className="auth__sub">
              Kode 6 digit akan dikirim ke{' '}
              {method === 'email' ? 'email kamu' : 'nomor HP via SMS'}. Kode cuma berlaku 10 menit.
            </p>
          </header>

          {stage === 'checking' && (
            <div className="auth__wait">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Mengecek sesi…</span>
            </div>
          )}

          {stage === 'identify' && (
            <>
              <MethodToggle method={method} onChange={switchMethod} />
              <form onSubmit={sendOtp} className="auth__form">
                <label className="auth__field">
                  <span className="auth__label">
                    {method === 'email' ? 'Email' : 'Nomor WhatsApp'}
                  </span>
                  <div className="auth__input-wrap">
                    {method === 'email' ? (
                      <Mail className="auth__input-icon" aria-hidden="true" />
                    ) : (
                      <Phone className="auth__input-icon" aria-hidden="true" />
                    )}
                    <input
                      type={method === 'email' ? 'email' : 'tel'}
                      required
                      autoComplete={method === 'email' ? 'email' : 'tel'}
                      inputMode={method === 'email' ? 'email' : 'tel'}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={method === 'email' ? 'nama@domain.com' : '0812 3456 7890'}
                      className="auth__input"
                    />
                  </div>
                  {method === 'phone' && phoneDisplay && (
                    <span className="mt-1 block text-xs text-zinc-500 font-mono">
                      {phoneDisplay}
                    </span>
                  )}
                </label>
                <button type="submit" disabled={!canSend} className="auth__submit">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Kirim kode {method === 'email' ? 'via email' : 'via SMS'}
                </button>
                <p className="auth__fine">
                  Baru pertama kali?{' '}
                  <Link href="/signup" className="auth__link">
                    Buat toko →
                  </Link>
                </p>
              </form>
            </>
          )}

          {stage === 'otp' && (
            <form onSubmit={verifyOtp} className="auth__form">
              <div className="auth__sent">
                Kode sudah dikirim ke <strong className="font-mono">{sentTo}</strong>.{' '}
                <button
                  type="button"
                  onClick={() => setStage('identify')}
                  className="auth__link"
                >
                  Ubah
                </button>
              </div>
              <label className="auth__field">
                <span className="auth__label">Kode verifikasi</span>
                <div className="auth__input-wrap">
                  <KeyRound className="auth__input-icon" aria-hidden="true" />
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="123 456"
                    className="auth__input auth__input--otp"
                  />
                </div>
              </label>
              <button type="submit" disabled={loading || otp.length < 6} className="auth__submit">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Masuk
              </button>
              <p className="auth__fine">
                Nggak nerima kode? Tunggu 1 menit lalu{' '}
                <button
                  type="button"
                  onClick={() => setStage('identify')}
                  className="auth__link"
                >
                  kirim ulang
                </button>
                .
              </p>
            </form>
          )}

          {stage === 'redirecting' && (
            <div className="auth__wait">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{hint ?? 'Mengalihkan…'}</span>
            </div>
          )}

          {error && <div className="auth__error">{error}</div>}
          {hint && stage === 'identify' && (
            <div className="mt-3 text-xs text-zinc-500">{hint}</div>
          )}
        </section>

        <footer className="auth__foot">
          <span className="auth__foot-rule" aria-hidden="true" />
          <span>sajian · untuk f&b indonesia</span>
          <span className="auth__foot-rule" aria-hidden="true" />
        </footer>
      </main>
    </>
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
      aria-label="Metode masuk"
    >
      <button
        type="button"
        onClick={() => onChange('email')}
        aria-pressed={method === 'email'}
        className="rounded-full px-3 h-7 font-medium transition"
        style={
          method === 'email'
            ? { background: '#1B5E3B', color: '#fff' }
            : { color: '#555' }
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
          method === 'phone'
            ? { background: '#1B5E3B', color: '#fff' }
            : { color: '#555' }
        }
      >
        Nomor HP
      </button>
    </div>
  );
}
