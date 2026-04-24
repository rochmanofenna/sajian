'use client';

// /akun — customer profile. Name + phone are editable (email changes
// require re-verification and are handled separately). Renders a simple
// in-page form that PATCHes /api/customer/profile.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { PageNav } from '@/components/chrome/PageNav';
import {
  formatIdPhoneDisplay,
  isLikelyIdPhone,
  normalizeIdPhone,
} from '@/lib/auth/phone';

interface SessionShape {
  account: { id: string; email: string; name: string | null; phone: string | null };
  tenantProfile: { total_orders: number; total_spent: number } | null;
}

export function AccountProfileView({ tenant }: { tenant: PublicTenant }) {
  const [session, setSession] = useState<SessionShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/customer/me', { cache: 'no-store' });
        const body = await res.json();
        const s = (body?.session as SessionShape | null) ?? null;
        setSession(s);
        if (s) {
          setName(s.account.name ?? '');
          setPhone(s.account.phone ?? '');
        }
      } catch {
        setSession(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const normalizedPhone = phone.trim() ? normalizeIdPhone(phone) : '';
      if (normalizedPhone && !isLikelyIdPhone(normalizedPhone)) {
        setError('Masukkan nomor HP Indonesia (0812xxxxxxxx).');
        return;
      }
      const res = await fetch('/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          phone: normalizedPhone || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Gagal simpan');
      setMessage('Tersimpan.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const primary = tenant.colors.primary;

  if (loading) {
    return (
      <>
        <PageNav label="Akun" backHref="/" />
        <div className="max-w-md mx-auto py-12 flex justify-center text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <PageNav label="Akun" backHref="/" />
        <div className="max-w-md mx-auto py-12 px-4 text-center space-y-3">
          <p className="text-zinc-600">Kamu belum masuk.</p>
          <Link
            href="/?login=1"
            className="inline-flex h-11 px-5 rounded-full text-white text-sm items-center"
            style={{ background: primary }}
          >
            Masuk
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageNav label="Akun saya" backHref="/" />
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-display, serif)' }}>
            Halo, {session.account.name ?? 'kamu'}
          </h1>
          <p className="text-sm text-zinc-600">{session.account.email}</p>
          {session.tenantProfile && session.tenantProfile.total_orders > 0 && (
            <p className="text-xs text-zinc-500">
              {session.tenantProfile.total_orders} pesanan di {tenant.name}
            </p>
          )}
        </header>

        <section
          className="rounded-2xl border p-4 space-y-3 bg-white"
          style={{ borderColor: `${primary}18` }}
        >
          <Label text="Nama" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
            placeholder="Nama lengkap"
          />
          <Label text="No. WhatsApp" />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
            placeholder="cth: 0812 3456 7890"
          />
          {phone.trim().length > 0 && (
            <div className="text-xs text-zinc-500 font-mono">{formatIdPhoneDisplay(phone)}</div>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full h-11 rounded-full text-white text-sm font-medium disabled:opacity-50"
            style={{ background: primary }}
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
          {message && <p className="text-xs text-emerald-600">{message}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </section>

        <nav className="space-y-2">
          <LinkRow href="/akun/pesanan" label="Pesanan saya" primary={primary} />
          <LinkRow href="/akun/alamat" label="Alamat tersimpan" primary={primary} />
        </nav>
      </div>
    </>
  );
}

function Label({ text }: { text: string }) {
  return <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{text}</div>;
}

function LinkRow({ href, label, primary }: { href: string; label: string; primary: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl border bg-white h-14 px-4 hover:bg-zinc-50"
      style={{ borderColor: `${primary}18` }}
    >
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="h-4 w-4 opacity-60" />
    </Link>
  );
}
