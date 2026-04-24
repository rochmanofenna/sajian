// Contact — address, WhatsApp, optional hours snippet.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface ContactProps {
  heading?: string;
  address?: string;
  whatsapp?: string;
  hours_line?: string;
}

export function Contact({ ctx, props }: SectionComponentProps<ContactProps>) {
  const address = props.address ?? ctx.address ?? '';
  const whatsapp = props.whatsapp ?? ctx.whatsapp ?? '';
  const tel = whatsapp.replace(/[^\d+]/g, '');

  return (
    <section
      className="px-6 py-12"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-md mx-auto text-center space-y-3">
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? 'Kontak kami'}
        </h2>
        {address && <p className="text-sm opacity-80">{address}</p>}
        {props.hours_line && <p className="text-xs opacity-60">{props.hours_line}</p>}
        {tel && (
          <a
            href={`https://wa.me/${tel.replace(/^\+/, '')}`}
            className="inline-block mt-2 px-5 h-11 leading-[44px] rounded-full text-sm font-medium text-white"
            style={{ background: ctx.colors.primary }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chat WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
