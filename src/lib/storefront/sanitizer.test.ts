import { describe, it, expect } from 'vitest';
import { sanitizeSlotTree, sanitizeSlotTreeLenient, SanitizerError } from './sanitizer';

function happy(input: unknown) {
  return () => sanitizeSlotTree(input);
}

describe('sanitizer — happy path', () => {
  it('accepts a bare text node', () => {
    const out = sanitizeSlotTree({ kind: 'text', props: { content: 'hi' } });
    expect(out.kind).toBe('text');
    expect(out.props?.content).toBe('hi');
  });

  it('accepts a box with a text child', () => {
    const tree = {
      kind: 'box',
      props: { padding: 16 },
      children: [{ kind: 'text', props: { content: 'inside' } }],
    };
    const out = sanitizeSlotTree(tree);
    expect(out.kind).toBe('box');
    expect(out.children).toHaveLength(1);
    expect(out.children?.[0].kind).toBe('text');
  });

  it('accepts a motion with hover + enter presets', () => {
    const out = sanitizeSlotTree({
      kind: 'motion',
      props: { enter: 'slide-up', hover: 'lift', enter_duration_ms: 400 },
      children: [{ kind: 'text', props: { content: 'x' } }],
    });
    expect(out.props?.enter).toBe('slide-up');
    expect(out.props?.hover).toBe('lift');
  });

  it('accepts overlay with anchor + offsets', () => {
    const out = sanitizeSlotTree({
      kind: 'overlay',
      props: { anchor: 'bottom-right', offset_x: 24, offset_y: 24 },
      children: [{ kind: 'button', props: { content: 'Go', href: '/menu' } }],
    });
    expect(out.props?.anchor).toBe('bottom-right');
  });

  it('accepts an image with safe URL', () => {
    const out = sanitizeSlotTree({
      kind: 'image',
      props: { src: 'https://abc.supabase.co/storage/x.png', alt: 'food' },
    });
    expect(out.props?.src).toMatch(/supabase\.co/);
  });

  it('accepts countdown with iso target', () => {
    const out = sanitizeSlotTree({
      kind: 'countdown',
      props: { target_iso: '2030-01-01T00:00:00Z', format: 'dhms' },
    });
    expect(out.props?.format).toBe('dhms');
  });

  it('accepts a valid style bag', () => {
    const out = sanitizeSlotTree({
      kind: 'box',
      props: {
        style: {
          padding: 16,
          background: '#fff',
          color: '#000',
          'border-radius': 8,
          transform: 'translate(10px, 20px)',
        },
      },
    });
    expect(out.props?.style).toBeTypeOf('object');
  });

  it('accepts deeply nested allowed tree', () => {
    const tree = {
      kind: 'stack',
      props: { direction: 'col', gap: 8 },
      children: [
        { kind: 'text', props: { content: 'A' } },
        {
          kind: 'motion',
          props: { enter: 'fade' },
          children: [
            {
              kind: 'overlay',
              props: { anchor: 'top-right' },
              children: [{ kind: 'icon', props: { name: 'star' } }],
            },
          ],
        },
      ],
    };
    const out = sanitizeSlotTree(tree);
    expect(out.children).toHaveLength(2);
  });
});

describe('sanitizer — rejection', () => {
  it('rejects unknown kind', () => {
    expect(happy({ kind: 'iframe', props: {} })).toThrow(SanitizerError);
    expect(happy({ kind: 'script', props: {} })).toThrow(SanitizerError);
  });

  it('rejects non-object root', () => {
    expect(happy(null)).toThrow(SanitizerError);
    expect(happy('string')).toThrow(SanitizerError);
    expect(happy([])).toThrow(SanitizerError);
  });

  it('rejects unknown prop', () => {
    expect(
      happy({ kind: 'text', props: { content: 'x', dangerouslySetInnerHTML: 'oops' } }),
    ).toThrow(SanitizerError);
  });

  it('rejects wrong type on prop', () => {
    expect(happy({ kind: 'text', props: { content: 123 } })).toThrow(SanitizerError);
    expect(happy({ kind: 'box', props: { padding: 'a lot' } })).toThrow(SanitizerError);
  });

  it('rejects out-of-range numbers', () => {
    expect(happy({ kind: 'overlay', props: { offset_x: 99999 } })).toThrow(SanitizerError);
    expect(happy({ kind: 'icon', props: { name: 'star', size: 999 } })).toThrow(SanitizerError);
  });

  it('rejects enum values not in list', () => {
    expect(happy({ kind: 'motion', props: { enter: 'explode' } })).toThrow(SanitizerError);
    expect(happy({ kind: 'icon', props: { name: 'unknown' } })).toThrow(SanitizerError);
  });

  it('rejects string exceeding max_length', () => {
    const huge = 'x'.repeat(700);
    expect(happy({ kind: 'text', props: { content: huge } })).toThrow(SanitizerError);
  });

  it('requires required_props', () => {
    expect(happy({ kind: 'text', props: {} })).toThrow(SanitizerError);
    expect(happy({ kind: 'image', props: { alt: 'x' } })).toThrow(SanitizerError);
    expect(happy({ kind: 'icon', props: {} })).toThrow(SanitizerError);
    expect(happy({ kind: 'countdown', props: {} })).toThrow(SanitizerError);
    expect(happy({ kind: 'time-of-day', props: { from_hour: 8 } })).toThrow(SanitizerError);
  });

  it('rejects children on leaf primitives', () => {
    expect(happy({ kind: 'text', props: { content: 'x' }, children: [] })).toThrow(
      SanitizerError,
    );
    expect(
      happy({
        kind: 'image',
        props: { src: 'https://abc.supabase.co/x.png' },
        children: [{ kind: 'text', props: { content: 'y' } }],
      }),
    ).toThrow(SanitizerError);
  });

  it('rejects disallowed child kind', () => {
    // overlays accept any kind, but pretend we try to put something weird.
    expect(
      happy({
        kind: 'text',
        props: { content: 'x' },
        children: [{ kind: 'box', props: {} }],
      }),
    ).toThrow(SanitizerError);
  });

  it('enforces max_children cap', () => {
    const many = Array.from({ length: 30 }, () => ({
      kind: 'text',
      props: { content: 'a' },
    }));
    expect(
      happy({ kind: 'overlay', props: { anchor: 'center' }, children: many }),
    ).toThrow(/max_children/);
  });

  it('enforces max tree depth', () => {
    let node: unknown = { kind: 'text', props: { content: 'leaf' } };
    for (let i = 0; i < 12; i += 1) {
      node = { kind: 'box', props: {}, children: [node] };
    }
    expect(happy(node)).toThrow(/max_depth/);
  });

  it('enforces max total node count', () => {
    const many = Array.from({ length: 15 }, () => ({
      kind: 'box',
      props: {},
      children: Array.from({ length: 15 }, () => ({ kind: 'text', props: { content: 'x' } })),
    }));
    expect(happy({ kind: 'stack', props: {}, children: many })).toThrow(/max_(nodes|children)/);
  });
});

describe('sanitizer — style sub-validator', () => {
  it('rejects malicious style', () => {
    expect(
      happy({
        kind: 'box',
        props: { style: { 'background-image': 'url(javascript:alert(1))' } },
      }),
    ).toThrow(SanitizerError);
  });

  it('rejects unknown style key', () => {
    expect(
      happy({ kind: 'box', props: { style: { behavior: 'url(x)' } } }),
    ).toThrow(SanitizerError);
  });

  it('accepts safe style including transform', () => {
    const out = sanitizeSlotTree({
      kind: 'box',
      props: { style: { transform: 'rotate(5deg) scale(1.1)' } },
    });
    expect(out.props?.style).toBeDefined();
  });
});

describe('sanitizer — lenient wrapper', () => {
  it('returns null on bad input instead of throwing', () => {
    expect(sanitizeSlotTreeLenient({ kind: 'nope' })).toBeNull();
  });

  it('returns the tree on good input', () => {
    const out = sanitizeSlotTreeLenient({ kind: 'text', props: { content: 'x' } });
    expect(out?.kind).toBe('text');
  });
});

describe('sanitizer — path reporting', () => {
  it('reports nested path on violation', () => {
    let caught: SanitizerError | null = null;
    try {
      sanitizeSlotTree({
        kind: 'box',
        props: {},
        children: [{ kind: 'text', props: { content: 42 } }],
      });
    } catch (err) {
      if (err instanceof SanitizerError) caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught?.path).toContain('children[0]');
  });

  it('reports style path on bad style', () => {
    let caught: SanitizerError | null = null;
    try {
      sanitizeSlotTree({
        kind: 'box',
        props: { style: { width: 'calc(100% - 20px)' } },
      });
    } catch (err) {
      if (err instanceof SanitizerError) caught = err;
    }
    expect(caught?.path).toContain('style');
  });
});
