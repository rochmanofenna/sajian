'use client';

// Customer account menu for storefront headers. Renders "Masuk" when
// logged out, or the customer's initial/name + dropdown when logged in.
// Fetches current session from /api/auth/customer/me on mount and when
// ?login=1 is present (triggers LoginDialog auto-open for the
// middleware-redirected-from-akun case).

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { PublicTenant } from '@/lib/tenant';
import { LoginDialog } from './LoginDialog';

interface Session {
  account: { id: string; email: string; name: string | null };
  tenantProfile: { total_orders: number } | null;
}

export function AccountMenu({ tenant }: { tenant: PublicTenant }) {
  const router = useRouter();
  const params = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/customer/me', { cache: 'no-store' });
      const body = await res.json();
      setSession(body?.session ?? null);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (params.get('login') === '1' && !session) {
      setDialogOpen(true);
    }
  }, [params, session]);

  async function signOut() {
    await fetch('/api/auth/customer/signout', { method: 'POST' });
    setSession(null);
    setOpen(false);
    router.refresh();
  }

  const label = session?.account.name || session?.account.email || 'Akun';
  const initial = (session?.account.name || session?.account.email || '?')[0].toUpperCase();

  if (!session) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-full px-3 h-9 text-xs font-medium border"
          style={{
            borderColor: `${tenant.colors.primary}33`,
            color: tenant.colors.primary,
          }}
        >
          Masuk
        </button>
        <LoginDialog
          tenant={tenant}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSuccess={() => {
            refresh();
          }}
        />
      </>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full h-9 pl-1 pr-3 text-xs font-medium border"
        style={{
          borderColor: `${tenant.colors.primary}33`,
          color: tenant.colors.primary,
          background: 'white',
        }}
      >
        <span
          className="h-7 w-7 rounded-full text-white flex items-center justify-center text-sm"
          style={{ background: tenant.colors.primary }}
        >
          {initial}
        </span>
        <span className="max-w-[10rem] truncate">{label}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-60 rounded-2xl bg-white shadow-lg border p-1 z-30"
          style={{ borderColor: `${tenant.colors.primary}18` }}
          onMouseLeave={() => setOpen(false)}
        >
          <div
            className="px-3 py-2 text-xs opacity-60 truncate"
            style={{ color: tenant.colors.dark }}
          >
            {session.account.email}
          </div>
          <MenuLink href="/akun">Akun saya</MenuLink>
          <MenuLink href="/akun/pesanan">Pesanan saya</MenuLink>
          <MenuLink href="/akun/alamat">Alamat tersimpan</MenuLink>
          <button
            type="button"
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-zinc-50"
          >
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block px-3 py-2 text-sm rounded-xl hover:bg-zinc-50">
      {children}
    </Link>
  );
}
