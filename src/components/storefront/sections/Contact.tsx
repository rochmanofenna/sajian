// Contact — address, WhatsApp, optional hours snippet. `with_map` puts
// contact info next to a map embed for visitors who want directions.
// Exposes layout, text_align, map_position, cta_* so the AI can route
// layout requests through update_section_props.
//
// Vertical rhythm follows the scale in docs/codegen-audit-2026-04-27.md
// (Layer 1.3): py-16 default.

import type { SectionComponentProps } from '@/lib/storefront/section-types';
import {
  ctaSizeClass,
  rowAlignClass,
  textAlignClass,
  type Align,
  type CtaSize,
} from './cta';

interface ContactProps {
  heading?: string;
  address?: string;
  whatsapp?: string;
  hours_line?: string;
  query?: string; // override the map search string
  layout?: 'stacked' | 'inline';
  text_align?: Align;
  show_whatsapp_cta?: boolean;
  whatsapp_cta_label?: string;
  cta_size?: CtaSize;
  cta_align?: Align;
  map_position?: 'above' | 'below';
}

function waLink(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
  return `https://wa.me/${digits}`;
}

function whatsappCtaVisible(props: ContactProps): boolean {
  return props.show_whatsapp_cta !== false;
}

function WhatsappCta({
  ctx,
  props,
  phone,
}: {
  ctx: SectionComponentProps['ctx'];
  props: ContactProps;
  phone: string;
}) {
  if (!phone || !whatsappCtaVisible(props)) return null;
  return (
    <div
      className={`flex ${rowAlignClass(props.cta_align ?? props.text_align ?? 'left')}`}
    >
      <a
        href={waLink(phone)}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-block rounded-full font-medium text-white ${ctaSizeClass(props.cta_size)}`}
        style={{ background: ctx.colors.primary }}
      >
        {props.whatsapp_cta_label ?? 'Chat WhatsApp'}
      </a>
    </div>
  );
}

export function Contact({ section, ctx, props }: SectionComponentProps<ContactProps>) {
  if (section.variant === 'with_map') return <WithMap ctx={ctx} props={props} />;
  return <Simple ctx={ctx} props={props} />;
}

function Simple({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: ContactProps }) {
  const address = props.address ?? ctx.address ?? '';
  const whatsapp = props.whatsapp ?? ctx.whatsapp ?? '';
  const align = props.text_align ?? 'left';
  const layout = props.layout ?? 'stacked';

  if (layout === 'inline') {
    return (
      <section
        className="px-6 py-16"
        style={{ background: ctx.colors.background, color: ctx.colors.dark }}
      >
        <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-4 justify-between">
          <div className={`space-y-1 ${textAlignClass(align)}`}>
            <h2
              className="text-lg font-semibold tracking-tight"
              style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
            >
              {props.heading ?? 'Kontak kami'}
            </h2>
            {address && <p className="text-sm opacity-80">{address}</p>}
            {props.hours_line && <p className="text-xs opacity-60">{props.hours_line}</p>}
          </div>
          <WhatsappCta ctx={ctx} props={props} phone={whatsapp} />
        </div>
      </section>
    );
  }

  return (
    <section
      className="px-6 py-16"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className={`max-w-md mx-auto space-y-3 ${textAlignClass(align)}`}>
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? 'Kontak kami'}
        </h2>
        {address && <p className="text-sm opacity-80">{address}</p>}
        {props.hours_line && <p className="text-xs opacity-60">{props.hours_line}</p>}
        <WhatsappCta ctx={ctx} props={props} phone={whatsapp} />
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
  const align = props.text_align ?? 'left';
  const mapAbove = props.map_position === 'above';

  const mapBlock = (
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
  );

  const infoBlock = (
    <div className={`md:col-span-2 space-y-3 ${textAlignClass(align)}`}>
      <h2
        className="text-xl font-semibold tracking-tight"
        style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
      >
        {props.heading ?? 'Kontak & lokasi'}
      </h2>
      {address && <p className="text-sm opacity-85 leading-relaxed">{address}</p>}
      {props.hours_line && <p className="text-xs opacity-60">{props.hours_line}</p>}
      <div
        className={`flex flex-wrap gap-2 ${rowAlignClass(props.cta_align ?? align)}`}
      >
        {whatsapp && whatsappCtaVisible(props) && (
          <a
            href={waLink(whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-block rounded-full font-medium text-white ${ctaSizeClass(props.cta_size)}`}
            style={{ background: ctx.colors.primary }}
          >
            {props.whatsapp_cta_label ?? 'Chat WhatsApp'}
          </a>
        )}
        {address && (
          <a
            href={openSrc}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-block rounded-full font-medium ${ctaSizeClass(props.cta_size)}`}
            style={{ background: `${ctx.colors.primary}14`, color: ctx.colors.primary }}
          >
            Buka di Maps
          </a>
        )}
      </div>
    </div>
  );

  return (
    <section
      className="px-6 py-16"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto grid gap-4 md:grid-cols-5 items-stretch">
        {mapAbove ? (
          <>
            {mapBlock}
            {infoBlock}
          </>
        ) : (
          <>
            {infoBlock}
            {mapBlock}
          </>
        )}
      </div>
    </section>
  );
}
