'use client';

// Toko settings — all auto-save. Each field PATCHes /api/admin/tenant on
// blur / change (debounced for color pickers). A small "Tersimpan ✓" chip
// appears next to the field that just saved, fading after ~1.5s.
//
// Images (logo + hero) upload via /api/admin/tenant/image?kind=... which
// writes to Storage and updates the DB column.
//
// Danger zone is a separate /api/admin/tenant/deactivate route that flips
// is_active=false; re-enabling is support-only on purpose.

import { useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Camera,
  Check,
  ImageIcon,
  ImageOff,
  Loader2,
  Store,
} from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { THEME_TEMPLATES, type ThemeTemplate } from '@/lib/tenant-types';

const TEMPLATE_DESCRIPTIONS: Record<ThemeTemplate, string> = {
  kedai: 'Warm, editorial. Coffee shops, bakeries, specialty cafés.',
  warung: 'Bold street-food energy. Warteg, nasi, sate, kaki lima.',
  modern: 'Clean, minimal, lots of whitespace. Contemporary restaurants.',
  'food-hall': 'Dense scan-and-order. Stalls, kios, takeaway windows.',
  classic: 'Traditional printed menu. Fine-dining, steakhouses.',
};

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'monday', label: 'Senin' },
  { key: 'tuesday', label: 'Selasa' },
  { key: 'wednesday', label: 'Rabu' },
  { key: 'thursday', label: 'Kamis' },
  { key: 'friday', label: 'Jumat' },
  { key: 'saturday', label: 'Sabtu' },
  { key: 'sunday', label: 'Minggu' },
];

interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

type HoursMap = Partial<Record<DayKey, DayHours>>;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function normalizeHours(raw: PublicTenant['operating_hours']): HoursMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: HoursMap = {};
  for (const k of Object.keys(raw) as DayKey[]) {
    const val = (raw as Record<string, DayHours>)[k];
    if (val && typeof val === 'object') out[k] = val;
  }
  return out;
}

export function TokoSettings({ tenant }: { tenant: PublicTenant }) {
  const [name, setName] = useState(tenant.name);
  const [tagline, setTagline] = useState(tenant.tagline ?? '');
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url);
  const [heroUrl, setHeroUrl] = useState(tenant.hero_image_url ?? null);
  const [template, setTemplate] = useState<ThemeTemplate>(tenant.theme_template);
  const [colors, setColors] = useState(tenant.colors);
  const [hours, setHours] = useState<HoursMap>(() => normalizeHours(tenant.operating_hours));
  const [field, setField] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const colorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function patch(payload: Record<string, unknown>, label: string) {
    setField(label);
    setState('saving');
    try {
      const res = await fetch('/api/admin/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal simpan');
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    } catch (e) {
      setState('error');
      alert((e as Error).message);
      setTimeout(() => setState('idle'), 2000);
      throw e;
    }
  }

  async function saveName() {
    const next = name.trim();
    if (!next || next === tenant.name) return;
    if (!confirm(`Ganti nama toko jadi "${next}"? Nama akan terlihat oleh pelanggan.`)) {
      setName(tenant.name);
      return;
    }
    await patch({ name: next }, 'name');
  }

  async function saveTagline() {
    const next = tagline.trim();
    if (next === (tenant.tagline ?? '')) return;
    await patch({ tagline: next || null }, 'tagline');
  }

  async function saveTemplate(next: ThemeTemplate) {
    setTemplate(next);
    if (next === tenant.theme_template) return;
    await patch({ theme_template: next }, 'template');
  }

  function editColor(k: keyof typeof colors, value: string) {
    const next = { ...colors, [k]: value };
    setColors(next);
    if (colorDebounce.current) clearTimeout(colorDebounce.current);
    colorDebounce.current = setTimeout(() => {
      patch({ colors: { [k]: value } }, `color-${k}`).catch(() => {
        /* handled */
      });
    }, 450);
  }

  function editDay(day: DayKey, patchObj: Partial<DayHours>) {
    const nextDay: DayHours = { ...(hours[day] ?? {}), ...patchObj };
    const nextHours: HoursMap = { ...hours, [day]: nextDay };
    setHours(nextHours);
    patch({ operating_hours: nextHours }, `hours-${day}`).catch(() => {});
  }

  async function uploadImage(kind: 'logo' | 'hero', file: File) {
    const fd = new FormData();
    fd.append('photo', file);
    setField(kind === 'logo' ? 'logo' : 'hero');
    setState('saving');
    try {
      const res = await fetch(`/api/admin/tenant/image?kind=${kind}`, { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal upload');
      if (kind === 'logo') setLogoUrl(body.url);
      else setHeroUrl(body.url);
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    } catch (e) {
      setState('error');
      alert((e as Error).message);
      setTimeout(() => setState('idle'), 2000);
    }
  }

  async function clearImage(kind: 'logo' | 'hero') {
    if (!confirm(`Hapus ${kind === 'logo' ? 'logo' : 'foto cover'}?`)) return;
    setField(kind === 'logo' ? 'logo' : 'hero');
    setState('saving');
    try {
      const res = await fetch(`/api/admin/tenant/image?kind=${kind}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Gagal hapus');
      }
      if (kind === 'logo') setLogoUrl(null);
      else setHeroUrl(null);
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    } catch (e) {
      setState('error');
      alert((e as Error).message);
      setTimeout(() => setState('idle'), 2000);
    }
  }

  async function deactivate() {
    const expected = tenant.slug;
    const answer = prompt(
      `Hapus toko akan membuat ${expected}.sajian.app offline. Ketik slug "${expected}" untuk konfirmasi:`,
    );
    if (answer !== expected) return;
    const res = await fetch('/api/admin/tenant/deactivate', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Gagal deactivate');
      return;
    }
    alert('Toko offline. Hubungi support untuk mengaktifkan kembali.');
    window.location.href = 'https://sajian.app';
  }

  return (
    <div className="max-w-2xl space-y-10">
      {/* Name + tagline */}
      <section className="space-y-4">
        <Field label="Nama toko" hint="Terlihat di header, QR poster, dan notifikasi." indicator={<SaveChip show={field === 'name' && state !== 'idle'} state={state} />}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            className="w-full h-11 px-4 rounded-lg border border-zinc-300 bg-white font-medium"
          />
        </Field>

        <Field label="Tagline" hint="Satu kalimat di bawah nama toko. Opsional." indicator={<SaveChip show={field === 'tagline' && state !== 'idle'} state={state} />}>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            onBlur={saveTagline}
            placeholder="Nasi bakar enak & murah"
            className="w-full h-11 px-4 rounded-lg border border-zinc-300 bg-white"
            maxLength={240}
          />
        </Field>
      </section>

      {/* Media */}
      <section className="space-y-4">
        <header>
          <h3 className="font-semibold">Foto &amp; logo</h3>
          <p className="text-xs text-zinc-500">Logo di header, cover di homepage.</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <ImageSlot
            label="Logo"
            url={logoUrl}
            busy={field === 'logo' && state === 'saving'}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onPick={(f) => uploadImage('logo', f)}
            onClear={() => clearImage('logo')}
            shape="square"
            indicator={<SaveChip show={field === 'logo' && (state === 'saved' || state === 'error')} state={state} />}
          />
          <ImageSlot
            label="Foto cover"
            url={heroUrl}
            busy={field === 'hero' && state === 'saving'}
            accept="image/png,image/jpeg,image/webp"
            onPick={(f) => uploadImage('hero', f)}
            onClear={() => clearImage('hero')}
            shape="wide"
            indicator={<SaveChip show={field === 'hero' && (state === 'saved' || state === 'error')} state={state} />}
          />
        </div>
      </section>

      {/* Template */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Layout toko</h3>
            <p className="text-xs text-zinc-500">Bisa diganti kapan saja.</p>
          </div>
          <SaveChip show={field === 'template' && state !== 'idle'} state={state} />
        </header>
        <div className="grid gap-2 sm:grid-cols-2">
          {THEME_TEMPLATES.map((t) => {
            const active = t === template;
            return (
              <button
                key={t}
                type="button"
                onClick={() => saveTemplate(t)}
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

      {/* Colors */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Warna brand</h3>
            <p className="text-xs text-zinc-500">Otomatis tersimpan saat kamu geser.</p>
          </div>
          <SaveChip show={!!field?.startsWith('color-') && state !== 'idle'} state={state} />
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['primary', 'accent', 'background', 'dark'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1.5 text-xs">
              <span className="text-zinc-500 capitalize">{k}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors[k]}
                  onChange={(e) => editColor(k, e.target.value)}
                  className="h-9 w-9 rounded-md border border-zinc-300 cursor-pointer flex-shrink-0"
                />
                <input
                  type="text"
                  value={colors[k]}
                  onChange={(e) => editColor(k, e.target.value)}
                  className="flex-1 min-w-0 h-9 px-2 rounded-md border border-zinc-300 font-mono text-xs"
                />
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Operating hours */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Jam buka</h3>
            <p className="text-xs text-zinc-500">Matikan hari yang libur.</p>
          </div>
          <SaveChip show={!!field?.startsWith('hours-') && state !== 'idle'} state={state} />
        </header>
        <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 bg-white">
          {DAYS.map(({ key, label }) => {
            const day = hours[key] ?? {};
            const open = day.open ?? '10:00';
            const close = day.close ?? '22:00';
            const closed = day.closed === true;
            return (
              <div key={key} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-20 text-sm font-medium">{label}</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-xs">
                  <input
                    type="checkbox"
                    checked={!closed}
                    onChange={(e) => editDay(key, { closed: !e.target.checked })}
                    className="sr-only peer"
                  />
                  <span
                    className="h-4 w-7 rounded-full bg-zinc-300 peer-checked:bg-emerald-500 relative transition"
                    aria-hidden="true"
                  >
                    <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition peer-checked:translate-x-3" />
                  </span>
                  <span className="text-zinc-600 peer-checked:text-zinc-900 w-10">
                    {closed ? 'Tutup' : 'Buka'}
                  </span>
                </label>
                {!closed && (
                  <>
                    <input
                      type="time"
                      value={open}
                      onChange={(e) => editDay(key, { open: e.target.value })}
                      className="h-8 px-2 rounded-md border border-zinc-300 text-xs font-mono"
                    />
                    <span className="text-zinc-400 text-xs">–</span>
                    <input
                      type="time"
                      value={close}
                      onChange={(e) => editDay(key, { close: e.target.value })}
                      className="h-8 px-2 rounded-md border border-zinc-300 text-xs font-mono"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Subdomain read-only */}
      <section className="space-y-2">
        <h3 className="font-semibold">URL toko</h3>
        <div className="flex items-center gap-2 text-sm font-mono bg-zinc-50 border border-zinc-200 rounded-lg px-4 h-11">
          <Store className="h-4 w-4 text-zinc-400" />
          <span>{tenant.slug}.sajian.app</span>
        </div>
        <p className="text-xs text-zinc-500">
          Slug toko tidak bisa diubah sendiri — QR code dan link yang sudah dibagikan akan rusak. Hubungi support kalau perlu ganti.
        </p>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-3">
        <header className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-4 w-4" />
          <h3 className="font-semibold">Danger zone</h3>
        </header>
        <p className="text-xs text-red-700">
          Menonaktifkan toko akan membuat {tenant.slug}.sajian.app offline. Data tidak dihapus — hubungi kami untuk mengaktifkan kembali.
        </p>
        <button
          onClick={deactivate}
          className="h-10 px-4 rounded-full bg-red-600 text-white text-sm font-medium hover:bg-red-700"
        >
          Hapus toko (offline)
        </button>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  indicator,
  children,
}: {
  label: string;
  hint?: string;
  indicator?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-700">{label}</label>
        {indicator}
      </div>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function SaveChip({ show, state }: { show: boolean; state: SaveState }) {
  if (!show) return null;
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Menyimpan…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
        <Check className="h-3 w-3" />
        Tersimpan
      </span>
    );
  }
  if (state === 'error') {
    return <span className="text-[11px] text-red-600">Gagal</span>;
  }
  return null;
}

function ImageSlot({
  label,
  url,
  busy,
  accept,
  shape,
  onPick,
  onClear,
  indicator,
}: {
  label: string;
  url: string | null;
  busy: boolean;
  accept: string;
  shape: 'square' | 'wide';
  onPick: (f: File) => void;
  onClear: () => void;
  indicator?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const aspect = shape === 'square' ? 'aspect-square' : 'aspect-[16/9]';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-zinc-700">{label}</label>
        {indicator}
      </div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`relative w-full ${aspect} rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden hover:border-zinc-400 transition group flex items-center justify-center`}
      >
        {url ? (
          <Image
            src={url}
            alt={label}
            fill
            unoptimized
            sizes="(min-width: 640px) 320px, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-zinc-400">
            {shape === 'square' ? <Camera className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
            <span className="text-xs">Pilih foto</span>
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </span>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
      {url && !busy && (
        <button
          onClick={onClear}
          className="mt-1.5 text-xs text-zinc-500 hover:text-red-600 inline-flex items-center gap-1"
        >
          <ImageOff className="h-3 w-3" />
          Hapus {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

