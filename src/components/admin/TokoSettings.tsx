'use client';

// Storefront settings form. Edits tagline, brand colors, and the storefront
// template preset. PATCHes /api/admin/tenant which writes back to the
// tenants row. Logo/hero uploads deferred to a later iteration — for now
// paste URLs in directly if you need to change them.

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { THEME_TEMPLATES, type ThemeTemplate } from '@/lib/tenant-types';

const TEMPLATE_DESCRIPTIONS: Record<ThemeTemplate, string> = {
  kedai: 'Warm, editorial. Coffee shops, bakeries, specialty cafés.',
  warung: 'Bold street-food energy. Warteg, nasi, sate, kaki lima.',
  modern: 'Clean, minimal, lots of whitespace. Contemporary restaurants.',
  'food-hall': 'Dense scan-and-order. Stalls, kios, takeaway windows.',
  classic: 'Traditional printed menu. Fine-dining, steakhouses.',
};

export function TokoSettings({ tenant }: { tenant: PublicTenant }) {
  const [tagline, setTagline] = useState(tenant.tagline ?? '');
  const [template, setTemplate] = useState<ThemeTemplate>(tenant.theme_template);
  const [colors, setColors] = useState(tenant.colors);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    tagline !== (tenant.tagline ?? '') ||
    template !== tenant.theme_template ||
    colors.primary !== tenant.colors.primary ||
    colors.accent !== tenant.colors.accent ||
    colors.background !== tenant.colors.background ||
    colors.dark !== tenant.colors.dark;

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/admin/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagline: tagline.trim() || null,
          theme_template: template,
          colors,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal simpan');
      setSaved(true);
      // Reload so the storefront preview + header re-render with new tenant.
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-3">
        <header>
          <h3 className="font-semibold">Tagline</h3>
          <p className="text-xs text-zinc-500">Tampil di bawah nama toko, satu kalimat.</p>
        </header>
        <input
          type="text"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Nasi bakar enak & murah"
          className="w-full h-11 px-4 rounded-lg border border-zinc-300 bg-white"
          maxLength={240}
        />
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="font-semibold">Layout toko</h3>
          <p className="text-xs text-zinc-500">
            Pilih gaya tampilan yang paling cocok. Bisa diganti kapan saja.
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-2">
          {THEME_TEMPLATES.map((t) => {
            const active = t === template;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTemplate(t)}
                className="rounded-xl border text-left p-3 transition"
                style={{
                  borderColor: active ? tenant.colors.primary : 'rgba(0,0,0,0.1)',
                  background: active ? `${tenant.colors.primary}08` : 'white',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium capitalize">{t}</span>
                  {active && <Check className="h-4 w-4" style={{ color: tenant.colors.primary }} />}
                </div>
                <p className="text-xs text-zinc-500 leading-snug">{TEMPLATE_DESCRIPTIONS[t]}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="font-semibold">Warna brand</h3>
          <p className="text-xs text-zinc-500">Hex warna. Klik swatch untuk ubah.</p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['primary', 'accent', 'background', 'dark'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1.5 text-xs">
              <span className="text-zinc-500 capitalize">{k}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors[k]}
                  onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))}
                  className="h-9 w-9 rounded-md border border-zinc-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={colors[k]}
                  onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))}
                  className="flex-1 min-w-0 h-9 px-2 rounded-md border border-zinc-300 font-mono text-xs"
                />
              </div>
            </label>
          ))}
        </div>
      </section>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="h-10 px-5 rounded-full font-medium text-white flex items-center gap-2 disabled:opacity-40"
          style={{ background: tenant.colors.primary }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Simpan perubahan
        </button>
        {saved && !saving && <span className="text-xs text-emerald-600">Tersimpan — memuat ulang…</span>}
      </div>
    </div>
  );
}
