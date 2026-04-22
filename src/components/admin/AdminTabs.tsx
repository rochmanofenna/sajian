'use client';

// Tabbed nav for the owner dashboard. Tab state lives in ?tab= so a reload or
// shared link lands on the same panel. Logout lives here so it's always
// one click away.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut, Store, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { PublicTenant } from '@/lib/tenant';

export type AdminTab = 'orders' | 'menu' | 'store' | 'ai';

interface TabDef {
  id: AdminTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'orders', label: 'Pesanan' },
  { id: 'menu', label: 'Menu' },
  { id: 'store', label: 'Toko' },
  { id: 'ai', label: 'AI' },
];

export function AdminTabs({ tenant, active }: { tenant: PublicTenant; active: AdminTab }) {
  const router = useRouter();
  const params = useSearchParams();
  const primary = tenant.colors.primary;

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  }

  function switchTab(tab: AdminTab) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    router.push(url.pathname + url.search);
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs h-8 px-3 rounded-full border border-zinc-200 hover:border-zinc-400 transition"
        >
          <Store className="h-3.5 w-3.5" />
          Lihat toko
          <ExternalLink className="h-3 w-3" />
        </Link>
        <button
          onClick={logout}
          className="inline-flex items-center gap-2 text-xs h-8 px-3 rounded-full border border-zinc-200 hover:border-zinc-400 transition"
        >
          <LogOut className="h-3.5 w-3.5" />
          Keluar
        </button>
      </div>

      <nav className="flex gap-1 p-1 rounded-full bg-zinc-100 self-start" aria-label="Admin sections">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className="px-4 h-8 rounded-full text-xs font-medium transition"
              style={
                isActive
                  ? { background: primary, color: '#fff' }
                  : { color: '#555' }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
