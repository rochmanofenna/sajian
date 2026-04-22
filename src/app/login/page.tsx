// sajian.app/login — owner re-entry. Phone OTP, session-skip, tenant-aware
// redirect. Matches the editorial warmth of /signup and /setup so the owner
// never feels like they fell out of the Sajian world.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Phone, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PageNav } from '@/components/chrome/PageNav';
import { formatIdPhoneDisplay, isLikelyIdPhone, normalizeIdPhone } from '@/lib/auth/phone';

type Stage = 'checking' | 'phone' | 'otp' | 'redirecting';

export default function LoginPage() {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('checking');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Session-skip: if the user already has a Supabase session, jump straight
  // to their admin. On a tenant subdomain we verify ownership of that tenant
  // specifically; on apex we find whatever active tenant they own.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStage('phone');
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
      // Fall through to apex-style lookup if subdomain tenant isn't owned by this user.
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
      setStage('phone');
      setError('Akun ini belum punya toko. Buat toko dulu di /signup.');
      return;
    }
    if (host.includes('localhost')) {
      window.location.href = `http://${slug}.localhost:${window.location.port || 3000}/admin`;
    } else {
      window.location.href = `https://${slug}.sajian.app/admin`;
    }
  }

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
    setStage('redirecting');
    setHint('Mencari toko kamu…');
    await routeToOwnerAdmin(data.user.id);
  }

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
              Kode 6 digit akan dikirim via SMS ke nomor HP yang kamu pakai saat daftar.
              Bisa login dari mana aja — kode cuma berlaku 10 menit.
            </p>
          </header>

          {stage === 'checking' && (
            <div className="auth__wait">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Mengecek sesi…</span>
            </div>
          )}

          {stage === 'phone' && (
            <form onSubmit={sendOtp} className="auth__form">
              <label className="auth__field">
                <span className="auth__label">Nomor WhatsApp</span>
                <div className="auth__input-wrap">
                  <Phone className="auth__input-icon" aria-hidden="true" />
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812 3456 7890"
                    className="auth__input"
                  />
                </div>
                {display && <span className="mt-1 block text-xs text-zinc-500 font-mono">{display}</span>}
              </label>
              <button
                type="submit"
                disabled={!canSend}
                className="auth__submit"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Kirim kode via SMS
              </button>
              <p className="auth__fine">
                Baru pertama kali? <Link href="/signup" className="auth__link">Buat toko →</Link>
              </p>
            </form>
          )}

          {stage === 'otp' && (
            <form onSubmit={verifyOtp} className="auth__form">
              <div className="auth__sent">
                Kode sudah dikirim ke <strong className="font-mono">{display || normalized}</strong>.{' '}
                <button type="button" onClick={() => setStage('phone')} className="auth__link">
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
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="auth__submit"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Masuk
              </button>
              <p className="auth__fine">
                Nggak nerima SMS? Tunggu 1 menit lalu{' '}
                <button type="button" onClick={() => setStage('phone')} className="auth__link">
                  kirim ulang
                </button>.
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
