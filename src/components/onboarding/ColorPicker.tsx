'use client';

// Four color swatches with inline hex input. Lives alongside extract-colors
// output so the owner can override any single color.

import { useOnboarding } from '@/lib/onboarding/store';
import type { TenantColors } from '@/lib/onboarding/types';

const DEFAULT: TenantColors = {
  primary: '#1B5E3B',
  accent: '#C9A84C',
  background: '#FDF6EC',
  dark: '#1A1A18',
};

const LABELS: Record<keyof TenantColors, string> = {
  primary: 'Primary',
  accent: 'Aksen',
  background: 'Latar',
  dark: 'Teks Gelap',
};

export function ColorPicker() {
  const colors = useOnboarding((s) => s.draft.colors ?? DEFAULT);
  const patchDraft = useOnboarding((s) => s.patchDraft);

  function update(key: keyof TenantColors, value: string) {
    patchDraft({ colors: { ...colors, [key]: value } });
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {(Object.keys(LABELS) as Array<keyof TenantColors>).map((k) => (
        <label key={k} className="flex items-center gap-2 bg-white border border-[#1B5E3B]/15 rounded-lg px-2 py-1.5">
          <input
            type="color"
            value={colors[k]}
            onChange={(e) => update(k, e.target.value.toUpperCase())}
            className="h-8 w-8 cursor-pointer border-none bg-transparent"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-zinc-500">{LABELS[k]}</div>
            <input
              value={colors[k]}
              onChange={(e) => update(k, e.target.value.toUpperCase())}
              className="w-full bg-transparent text-xs font-mono focus:outline-none"
              spellCheck={false}
            />
          </div>
        </label>
      ))}
    </div>
  );
}
