'use client';

// Customer login dialog — email OTP only. Two stages (email → code)
// with a 60-second resend cooldown. Hooks into the existing Supabase
// auth pipeline via the /api/auth/customer/* routes.

import { useEffect, useState } from 'react';
import type { PublicTenant } from '@/lib/tenant';

interface Props {
  tenant: PublicTenant;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialEmail?: string;
}

type Stage = 'email' | 'code';

export function LoginDialog({ tenant, open, onClose, onSuccess, initialEmail }: Props) {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) {
      setStage('email');
      setCode('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (resendAt === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  if (!open) return null;

  async function sendOtp() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Masukkan email yang valid.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/customer/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Gagal mengirim kode.');
        return;
      }
      setStage('code');
      setResendAt(Date.now() + 60_000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    if (code.trim().length < 4) {
      setError('Masukkan kode 6 digit.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/customer/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Kode salah.');
        return;
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const cooldownSec = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const canResend = cooldownSec === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
        style={{ color: tenant.colors.dark }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div
              className="text-xs uppercase tracking-[0.18em] opacity-70"
              style={{ color: tenant.colors.primary }}
            >
              {tenant.name}
            </div>
            <h2 className="text-xl font-semibold tracking-tight mt-1">
              {stage === 'email' ? 'Masuk / Daftar' : 'Kode dari email'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="opacity-60 hover:opacity-100 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {stage === 'email' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendOtp();
            }}
            className="space-y-3"
          >
            <label className="block text-sm space-y-1">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-full text-white text-sm font-medium disabled:opacity-50"
              style={{ background: tenant.colors.primary }}
            >
              {busy ? 'Mengirim…' : 'Kirim kode'}
            </button>
            <p className="text-xs opacity-60 text-center">
              Kode 6 digit dikirim ke email. Tidak ada password.
            </p>
          </form>
        )}

        {stage === 'code' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyOtp();
            }}
            className="space-y-3"
          >
            <p className="text-sm opacity-70">
              Kode dikirim ke <span className="font-medium">{email}</span>. Cek inbox atau spam.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              placeholder="123456"
              className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white text-center tracking-[0.4em] text-lg focus:outline-none focus:border-zinc-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-full text-white text-sm font-medium disabled:opacity-50"
              style={{ background: tenant.colors.primary }}
            >
              {busy ? 'Memverifikasi…' : 'Masuk'}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setStage('email')}
                className="underline opacity-70 hover:opacity-100"
              >
                Ganti email
              </button>
              <button
                type="button"
                onClick={() => canResend && sendOtp()}
                disabled={!canResend || busy}
                className="underline opacity-70 hover:opacity-100 disabled:opacity-40"
              >
                {canResend ? 'Kirim ulang kode' : `Kirim ulang dalam ${cooldownSec}s`}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
