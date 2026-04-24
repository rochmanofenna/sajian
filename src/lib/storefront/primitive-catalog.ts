// Single source of truth for every slot-tree primitive the AI may emit.
// The sanitizer in ./sanitizer.ts reads this catalog and rejects any
// node whose kind isn't listed here, any prop not in `allowed_props`
// for its kind, any child not in `allowed_children_kinds`.
//
// Schema per entry:
//   allowed_props:   { propName: 'string' | 'number' | 'boolean' | 'enum' | 'style' | 'expr' }
//   enum_values:     when a prop's type is 'enum', the valid values
//   required_props:  prop names that must be present (the rest are optional)
//   can_have_children: does `children: SlotNode[]` render?
//   allowed_children_kinds: which primitive kinds may appear as children
//   max_children:    cap to stop the AI building 1000-node trees

export type PrimitiveKind =
  | 'motion'
  | 'overlay'
  | 'stack'
  | 'box'
  | 'text'
  | 'image'
  | 'button'
  | 'icon'
  | 'countdown'
  | 'scheduled'
  | 'time-of-day';

export type PropType = 'string' | 'number' | 'boolean' | 'enum' | 'style' | 'expr';

export interface PropSpec {
  type: PropType;
  // When type==='enum', the valid values.
  enum_values?: readonly string[];
  // For string props, a max length (characters).
  max_length?: number;
  // For number props, a [min, max] range (inclusive).
  range?: [number, number];
}

export interface PrimitiveSpec {
  allowed_props: Record<string, PropSpec>;
  required_props: readonly string[];
  can_have_children: boolean;
  allowed_children_kinds: readonly PrimitiveKind[];
  max_children: number;
}

const LEAF_KINDS: readonly PrimitiveKind[] = [
  'text',
  'image',
  'button',
  'icon',
  'countdown',
];

const ANY_KIND: readonly PrimitiveKind[] = [
  'motion',
  'overlay',
  'stack',
  'box',
  'text',
  'image',
  'button',
  'icon',
  'countdown',
  'scheduled',
  'time-of-day',
];

export const PRIMITIVE_CATALOG: Record<PrimitiveKind, PrimitiveSpec> = {
  motion: {
    allowed_props: {
      as: { type: 'enum', enum_values: ['div', 'section', 'span', 'img'] },
      src: { type: 'string', max_length: 2048 },
      alt: { type: 'string', max_length: 300 },
      enter: {
        type: 'enum',
        enum_values: ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale', 'blur', 'none'],
      },
      enter_delay_ms: { type: 'number', range: [0, 2000] },
      enter_duration_ms: { type: 'number', range: [100, 2000] },
      enter_trigger: { type: 'enum', enum_values: ['mount', 'in-view', 'in-view-once'] },
      hover: { type: 'enum', enum_values: ['lift', 'scale', 'glow', 'tilt', 'none'] },
      loop: { type: 'enum', enum_values: ['float', 'pulse', 'spin-slow', 'none'] },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: [],
    can_have_children: true,
    allowed_children_kinds: ANY_KIND,
    max_children: 24,
  },

  overlay: {
    allowed_props: {
      anchor: {
        type: 'enum',
        enum_values: [
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
          'top-center',
          'bottom-center',
          'center-left',
          'center-right',
          'center',
        ],
      },
      offset_x: { type: 'number', range: [-500, 500] },
      offset_y: { type: 'number', range: [-500, 500] },
      z: { type: 'number', range: [0, 50] },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: [],
    can_have_children: true,
    allowed_children_kinds: ANY_KIND,
    max_children: 12,
  },

  stack: {
    allowed_props: {
      direction: { type: 'enum', enum_values: ['row', 'col'] },
      align: { type: 'enum', enum_values: ['start', 'center', 'end', 'stretch'] },
      justify: { type: 'enum', enum_values: ['start', 'center', 'end', 'between', 'around'] },
      gap: { type: 'number', range: [0, 32] },
      wrap: { type: 'boolean' },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: [],
    can_have_children: true,
    allowed_children_kinds: ANY_KIND,
    max_children: 24,
  },

  box: {
    allowed_props: {
      padding: { type: 'number', range: [0, 256] },
      margin: { type: 'number', range: [-256, 256] },
      width: { type: 'number', range: [0, 4000] },
      height: { type: 'number', range: [0, 4000] },
      background: { type: 'string', max_length: 512 },
      border_radius: { type: 'number', range: [0, 9999] },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: [],
    can_have_children: true,
    allowed_children_kinds: ANY_KIND,
    max_children: 24,
  },

  text: {
    allowed_props: {
      tag: { type: 'enum', enum_values: ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'div'] },
      content: { type: 'string', max_length: 600 },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: ['content'],
    can_have_children: false,
    allowed_children_kinds: [],
    max_children: 0,
  },

  image: {
    allowed_props: {
      src: { type: 'string', max_length: 2048 },
      alt: { type: 'string', max_length: 300 },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: ['src'],
    can_have_children: false,
    allowed_children_kinds: [],
    max_children: 0,
  },

  button: {
    allowed_props: {
      content: { type: 'string', max_length: 80 },
      href: { type: 'string', max_length: 2048 },
      size: { type: 'enum', enum_values: ['sm', 'md', 'lg'] },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: [],
    can_have_children: false,
    allowed_children_kinds: [],
    max_children: 0,
  },

  icon: {
    allowed_props: {
      name: {
        type: 'enum',
        enum_values: [
          'sparkles',
          'heart',
          'star',
          'arrow-right',
          'phone',
          'mail',
          'map-pin',
          'clock',
          'shopping-bag',
          'utensils',
          'coffee',
          'flame',
          'check-circle',
          'alert-circle',
        ],
      },
      size: { type: 'number', range: [8, 128] },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: ['name'],
    can_have_children: false,
    allowed_children_kinds: [],
    max_children: 0,
  },

  countdown: {
    allowed_props: {
      target_iso: { type: 'string', max_length: 40 },
      format: { type: 'enum', enum_values: ['dhms', 'hms', 'ms', 'days-only'] },
      expired_text: { type: 'string', max_length: 80 },
      on_expire: { type: 'enum', enum_values: ['hide', 'show-expired-text', 'keep'] },
      className: { type: 'string', max_length: 200 },
      style: { type: 'style' },
    },
    required_props: ['target_iso'],
    can_have_children: false,
    allowed_children_kinds: [],
    max_children: 0,
  },

  scheduled: {
    allowed_props: {
      start_iso: { type: 'string', max_length: 40 },
      end_iso: { type: 'string', max_length: 40 },
    },
    required_props: [],
    can_have_children: true,
    allowed_children_kinds: ANY_KIND,
    max_children: 12,
  },

  'time-of-day': {
    allowed_props: {
      from_hour: { type: 'number', range: [0, 23] },
      to_hour: { type: 'number', range: [0, 23] },
    },
    required_props: ['from_hour', 'to_hour'],
    can_have_children: true,
    allowed_children_kinds: ANY_KIND,
    max_children: 12,
  },
};

export function isKnownPrimitive(kind: string): kind is PrimitiveKind {
  return Object.prototype.hasOwnProperty.call(PRIMITIVE_CATALOG, kind);
}

// Exported for tests.
export const _LEAF_KINDS = LEAF_KINDS;
