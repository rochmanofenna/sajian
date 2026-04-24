'use client';

// Announcement — thin bar at the top of the page OR a first-visit modal.
// Modal dismissal is remembered per-tenant in localStorage so returning
// customers aren't bothered.

import { useEffect, useState } from 'react';
import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface AnnouncementProps {
  message?: string;
  cta_label?: string;
  cta_href?: string;
  // Bump to re-show a previously-dismissed modal.
  version?: string;
}

export function Announcement({ section, ctx, props }: SectionComponentProps<AnnouncementProps>) {
  if (section.variant === 'modal') return <Modal ctx={ctx} props={props} sectionId={section.id} />;
  return <Bar ctx={ctx} props={props} />;
}

function Bar({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: AnnouncementProps }) {
  const msg = props.message ?? `Selamat datang di ${ctx.name}!`;
  return (
    <div
      className="sticky top-0 z-20 px-4 py-2 text-center text-xs font-medium"
      style={{ background: ctx.colors.primary, color: ctx.colors.background }}
    >
      <span>{msg}</span>
      {props.cta_label && props.cta_href && (
        <a
          href={props.cta_href}
          className="ml-2 underline"
          style={{ color: ctx.colors.background }}
        >
          {props.cta_label}
        </a>
      )}
    </div>
  );
}

function Modal({
  ctx,
  props,
  sectionId,
}: {
  ctx: SectionComponentProps['ctx'];
  props: AnnouncementProps;
  sectionId: string;
}) {
  const version = props.version ?? '1';
  const storageKey = `sajian:announce:${sectionId}:${version}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const dismissed = window.localStorage.getItem(storageKey);
      if (!dismissed) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // private mode — best effort.
    }
  }

  if (!open) return null;
  const msg = props.message ?? `Selamat datang di ${ctx.name}! Order sekarang.`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
      style={{ background: 'rgba(0, 0, 0, 0.4)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-w-sm w-full rounded-3xl p-6 shadow-2xl"
        style={{ background: ctx.colors.background, color: ctx.colors.dark }}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Tutup pengumuman"
          className="absolute top-3 right-4 text-xl opacity-60 hover:opacity-100"
          style={{ color: ctx.colors.dark }}
        >
          ×
        </button>
        <h3
          className="text-lg font-semibold tracking-tight"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {ctx.name}
        </h3>
        <p className="mt-2 text-sm opacity-85 leading-relaxed">{msg}</p>
        <div className="mt-4 flex items-center gap-2">
          {props.cta_label && props.cta_href && (
            <a
              href={props.cta_href}
              className="inline-block px-4 h-10 leading-[40px] rounded-full text-sm font-medium text-white"
              style={{ background: ctx.colors.primary }}
              onClick={dismiss}
            >
              {props.cta_label}
            </a>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="text-sm opacity-70 hover:opacity-100"
          >
            Nanti saja
          </button>
        </div>
      </div>
    </div>
  );
}
