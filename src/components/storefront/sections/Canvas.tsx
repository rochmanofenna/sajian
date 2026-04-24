// Canvas — freeform section with absolutely-positioned elements. The
// escape hatch the AI uses when the owner asks for a layout that no other
// section can express ("floating button bottom-right", "name centered with
// order button in the corner", etc.).
//
// Everything is structured config — no JSX strings, no raw CSS, no HTML.
// Every style value passes a whitelist validator so a bad LLM output
// can't inject script, overlay the whole viewport in black, or escape
// the container.

import type { SectionComponentProps } from '@/lib/storefront/section-types';
import {
  sanitizeCanvas,
  type SanitizedCanvasElement,
  type SanitizedCanvasProps,
} from '@/lib/storefront/canvas-schema';

export function Canvas({ ctx, props }: SectionComponentProps<Record<string, unknown>>) {
  const safe = sanitizeCanvas(props, ctx);

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{
        height: `${safe.height_vh}vh`,
        minHeight: '240px',
        ...backgroundStyle(safe, ctx),
        color: ctx.colors.dark,
      }}
    >
      {safe.elements.map((el) => (
        <CanvasElement key={el.id} el={el} />
      ))}
    </section>
  );
}

function backgroundStyle(
  safe: SanitizedCanvasProps,
  ctx: SectionComponentProps['ctx'],
): React.CSSProperties {
  if (safe.background.kind === 'image') {
    return {
      backgroundImage: `url(${safe.background.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (safe.background.kind === 'gradient') {
    return { background: safe.background.value };
  }
  return { background: safe.background.value || ctx.colors.background };
}

function positionStyle(el: SanitizedCanvasElement): React.CSSProperties {
  const style: React.CSSProperties = { position: 'absolute' };
  switch (el.position.anchor) {
    case 'top-left':
      style.top = el.position.offset_y;
      style.left = el.position.offset_x;
      break;
    case 'top-right':
      style.top = el.position.offset_y;
      style.right = el.position.offset_x;
      break;
    case 'bottom-left':
      style.bottom = el.position.offset_y;
      style.left = el.position.offset_x;
      break;
    case 'bottom-right':
      style.bottom = el.position.offset_y;
      style.right = el.position.offset_x;
      break;
    case 'top-center':
      style.top = el.position.offset_y;
      style.left = '50%';
      style.transform = `translate(-50%, 0) translate(${el.position.offset_x}px, 0)`;
      break;
    case 'bottom-center':
      style.bottom = el.position.offset_y;
      style.left = '50%';
      style.transform = `translate(-50%, 0) translate(${el.position.offset_x}px, 0)`;
      break;
    case 'center-left':
      style.top = '50%';
      style.left = el.position.offset_x;
      style.transform = `translate(0, -50%) translate(0, ${el.position.offset_y}px)`;
      break;
    case 'center-right':
      style.top = '50%';
      style.right = el.position.offset_x;
      style.transform = `translate(0, -50%) translate(0, ${el.position.offset_y}px)`;
      break;
    case 'center':
    default:
      style.top = '50%';
      style.left = '50%';
      style.transform = `translate(-50%, -50%) translate(${el.position.offset_x}px, ${el.position.offset_y}px)`;
      break;
  }
  return style;
}

function CanvasElement({ el }: { el: SanitizedCanvasElement }) {
  const pos = positionStyle(el);

  const sizeStyle: React.CSSProperties = {};
  if (el.size.width !== 'auto') sizeStyle.width = el.size.width;
  if (el.size.height !== 'auto') sizeStyle.height = el.size.height;

  const baseStyle: React.CSSProperties = {
    ...pos,
    ...sizeStyle,
    color: el.style.color,
    background: el.style.background,
    fontSize: el.style.font_size,
    fontWeight: el.style.font_weight,
    borderRadius: el.style.border_radius,
    padding: el.style.padding,
    opacity: el.style.opacity,
  };

  if (el.kind === 'text') {
    return (
      <div style={baseStyle} className="leading-tight">
        {el.content}
      </div>
    );
  }
  if (el.kind === 'button') {
    return (
      <a
        href={el.href}
        style={{ ...baseStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        className="font-medium no-underline"
      >
        {el.content}
      </a>
    );
  }
  if (el.kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={el.src} alt="" style={{ ...baseStyle, objectFit: 'cover' }} />
    );
  }
  // shape
  const shapeStyle: React.CSSProperties = {
    ...baseStyle,
    borderRadius: el.shape === 'circle' ? '50%' : baseStyle.borderRadius,
  };
  return <div style={shapeStyle} aria-hidden="true" />;
}
