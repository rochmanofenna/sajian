'use client';

// Tabbed nav for the owner dashboard. Tab state lives in ?tab= so a reload or
// shared link lands on the same panel. Logout lives here so it's always
// one click away. The 🔔 toggle flips OS-level notification state so the
// owner can enable/mute from any tab without leaving the dashboard.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Store, ExternalLink, Sparkles, Bell, BellOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { PublicTenant } from '@/lib/tenant';
import { useNotifPref } from '@/lib/notify/browser';

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
  const primary = tenant.colors.primary;
  const { active: notifOn, permission, enable, disable } = useNotifPref();

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

  async function toggleNotifs() {
    if (notifOn) {
      disable();
      return;
    }
    const result = await enable();
    if (result === 'denied') {
      alert(
        'Notifikasi dimatikan di setting browser kamu. Buka pengaturan situs ini di browser untuk mengaktifkan.',
      );
    } else if (result === 'unsupported') {
      alert('Browser ini tidak mendukung notifikasi. Coba pakai Chrome atau Safari terbaru.');
    }
  }

  const notifLabel = notifOn
    ? 'Matikan notifikasi'
    : permission === 'denied'
      ? 'Notifikasi diblokir'
      : 'Aktifkan notifikasi';

  return (
    <div className="flex flex-col gap-4 md:gap-6 mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        <a
          href="/setup"
          className="inline-flex items-center gap-2 text-xs h-8 px-3 rounded-full text-white transition hover:opacity-90"
          style={{ background: primary }}
          title="Bikin ulang menu, warna, logo, layout dari AI"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Setup ulang dengan AI
        </a>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs h-8 px-3 rounded-full border border-zinc-200 hover:border-zinc-400 transition"
        >
          <Store className="h-3.5 w-3.5" />
          Lihat toko
          <ExternalLink className="h-3 w-3" />
        </Link>
        <button
          onClick={toggleNotifs}
          title={notifLabel}
          aria-pressed={notifOn}
          className="inline-flex items-center gap-2 text-xs h-8 px-3 rounded-full border transition"
          style={
            notifOn
              ? { borderColor: primary, color: primary, background: `${primary}10` }
              : { borderColor: '#e4e4e7', color: permission === 'denied' ? '#dc2626' : '#555' }
          }
        >
          {notifOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{notifLabel}</span>
        </button>
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
