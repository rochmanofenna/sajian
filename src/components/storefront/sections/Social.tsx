// Social — row of IG / TikTok / WhatsApp / Facebook links. The `feed`
// variant renders a 3×3 grid of photos (pulled from gallery props or menu
// item images when empty) so it feels like a live feed teaser without
// needing a real Instagram embed.
//
// Vertical rhythm follows the scale in docs/codegen-audit-2026-04-27.md
// (Layer 1.3): py-16 default.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface SocialProps {
  heading?: string;
  instagram?: string; // handle, no @
  tiktok?: string;
  facebook?: string;
  whatsapp?: string; // e.164 or 0812… — we'll format
  photos?: string[];
}

function igUrl(h?: string) {
  if (!h) return null;
  return `https://instagram.com/${h.replace(/^@/, '')}`;
}
function tiktokUrl(h?: string) {
  if (!h) return null;
  return `https://tiktok.com/@${h.replace(/^@/, '')}`;
}
function fbUrl(h?: string) {
  if (!h) return null;
  return `https://facebook.com/${h}`;
}
function waUrl(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '').replace(/^0/, '62');
  return `https://wa.me/${digits}`;
}

export function Social({ section, ctx, props }: SectionComponentProps<SocialProps>) {
  if (section.variant === 'feed') return <Feed ctx={ctx} props={props} />;
  return <Icons ctx={ctx} props={props} />;
}

function Icons({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: SocialProps }) {
  const links: Array<{ label: string; href: string }> = [];
  const ig = igUrl(props.instagram);
  const tt = tiktokUrl(props.tiktok);
  const fb = fbUrl(props.facebook);
  const wa = waUrl(props.whatsapp ?? ctx.whatsapp);
  if (ig) links.push({ label: 'Instagram', href: ig });
  if (tt) links.push({ label: 'TikTok', href: tt });
  if (fb) links.push({ label: 'Facebook', href: fb });
  if (wa) links.push({ label: 'WhatsApp', href: wa });

  return (
    <section className="px-6 py-16" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-md mx-auto text-center space-y-3">
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? 'Ikuti kami'}
        </h2>
        {links.length === 0 ? (
          <p className="text-sm opacity-60">Isi akun sosial di dashboard biar muncul di sini.</p>
        ) : (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-medium"
                style={{ background: `${ctx.colors.primary}12`, color: ctx.colors.primary }}
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Feed({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: SocialProps }) {
  const photos =
    props.photos?.length
      ? props.photos
      : ctx.menuCategories
          .flatMap((c) => c.items)
          .map((i) => i.image_url)
          .filter((u): u is string => Boolean(u))
          .slice(0, 9);

  return (
    <section className="px-6 py-16" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
          >
            {props.heading ?? 'Di Instagram'}
          </h2>
          {igUrl(props.instagram) && (
            <a
              href={igUrl(props.instagram)!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium underline"
              style={{ color: ctx.colors.primary }}
            >
              @{props.instagram}
            </a>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {photos.length === 0
            ? Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg"
                  style={{ background: `${ctx.colors.primary}0f` }}
                />
              ))
            : photos.slice(0, 9).map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className="aspect-square rounded-lg overflow-hidden"
                  style={{ background: `${ctx.colors.primary}10` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
