// Contact — address, WhatsApp, optional hours snippet. `with_map` puts
// contact info next to a map embed for visitors who want directions.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface ContactProps {
  heading?: string;
  address?: string;
  whatsapp?: string;
  hours_line?: string;
  query?: string; // override the map search string
}

export function Contact({ section, ctx, props }: SectionComponentProps<ContactProps>) {
  if (section.variant === 'with_map') return <WithMap ctx={ctx} props={props} />;
  return <Simple ctx={ctx} props={props} />;
}

function waLink(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
  return `https://wa.me/${digits}`;
}

function Simple({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: ContactProps }) {
  const address = props.address ?? ctx.address ?? '';
  const whatsapp = props.whatsapp ?? ctx.whatsapp ?? '';

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
        {whatsapp && (
          <a
            href={waLink(whatsapp)}
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

function WithMap({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: ContactProps }) {
  const address = props.address ?? ctx.address ?? '';
  const whatsapp = props.whatsapp ?? ctx.whatsapp ?? '';
  const query = props.query ?? address ?? ctx.name;
  const encoded = encodeURIComponent(query);
  const embedSrc = `https://www.google.com/maps?q=${encoded}&output=embed`;
  const openSrc = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  return (
    <section
      className="px-6 py-12"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto grid gap-4 md:grid-cols-5 items-stretch">
        <div
          className="md:col-span-3 rounded-3xl overflow-hidden border"
          style={{ borderColor: `${ctx.colors.primary}22`, minHeight: 240 }}
        >
          {address ? (
            <iframe
              title="Peta lokasi"
              src={embedSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full block"
              style={{ border: 0, minHeight: 240 }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-sm opacity-60 p-6 text-center">
              Isi alamat toko di dashboard biar peta muncul di sini.
            </div>
          )}
        </div>
        <div className="md:col-span-2 space-y-3">
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
          >
            {props.heading ?? 'Kontak & lokasi'}
          </h2>
          {address && <p className="text-sm opacity-85 leading-relaxed">{address}</p>}
          {props.hours_line && <p className="text-xs opacity-60">{props.hours_line}</p>}
          <div className="flex flex-wrap gap-2">
            {whatsapp && (
              <a
                href={waLink(whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 h-10 leading-[40px] rounded-full text-sm font-medium text-white"
                style={{ background: ctx.colors.primary }}
              >
                Chat WhatsApp
              </a>
            )}
            {address && (
              <a
                href={openSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 h-10 leading-[40px] rounded-full text-sm font-medium"
                style={{ background: `${ctx.colors.primary}14`, color: ctx.colors.primary }}
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
