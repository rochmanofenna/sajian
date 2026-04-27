// Location — embedded map + address + "open in maps" link.
// Uses Google Maps' keyless `embed` endpoint so we don't need an API key
// for the iframe. Directions link falls back to a plain search URL.
//
// Vertical rhythm follows the scale in docs/codegen-audit-2026-04-27.md
// (Layer 1.3): py-16 default.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface LocationProps {
  heading?: string;
  address?: string;
  query?: string; // optional search string used for the embed (else address)
  hours_line?: string;
}

export function Location({ ctx, props }: SectionComponentProps<LocationProps>) {
  const address = props.address ?? ctx.address ?? '';
  const query = props.query ?? address ?? ctx.name;
  const encoded = encodeURIComponent(query);
  const embedSrc = `https://www.google.com/maps?q=${encoded}&output=embed`;
  const openSrc = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  return (
    <section className="px-6 py-16" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-xl font-semibold tracking-tight mb-4"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? 'Lokasi'}
        </h2>
        <div className="grid gap-4 md:grid-cols-5 items-stretch">
          <div
            className="md:col-span-3 rounded-2xl overflow-hidden border"
            style={{ borderColor: `${ctx.colors.primary}22`, minHeight: 220 }}
          >
            {address ? (
              <iframe
                title="Peta lokasi"
                src={embedSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full block"
                style={{ border: 0, minHeight: 220 }}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm opacity-60 p-6 text-center">
                Isi alamat toko di dashboard biar peta muncul di sini.
              </div>
            )}
          </div>
          <div className="md:col-span-2 space-y-2">
            {address && <p className="text-sm opacity-85 leading-relaxed">{address}</p>}
            {props.hours_line && <p className="text-xs opacity-60">{props.hours_line}</p>}
            {address && (
              <a
                href={openSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 px-4 h-10 leading-[40px] rounded-full text-sm font-medium text-white"
                style={{ background: ctx.colors.primary }}
              >
                Buka di Maps
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
