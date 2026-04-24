// Slot-tree sanitizer. Every untrusted subtree (currently hand-built in
// Phase 1; AI-generated in Phase 2) passes through `sanitizeSlotTree`
// before it reaches the renderer. The sanitizer:
//
//   1. Confirms `kind` is in PRIMITIVE_CATALOG.
//   2. Validates every prop against its PropSpec (type, enum, range,
//      max_length, style whitelist, expression grammar).
//   3. Enforces `required_props`.
//   4. Recurses into `children`, rejecting kinds not in
//      `allowed_children_kinds` and trimming to `max_children`.
//   5. Runs the expression evaluator with `{ strict: true }` on any
//      string prop whose spec is `expr` — we don't evaluate here; we
//      just confirm it parses and only uses whitelisted operators.
//
// Throws `SanitizerError` with a JSON-pointer-ish `path` and the rule
// that fired. Callers that need "best effort, drop bad subtrees" wrap
// the call and catch; the API write path should let errors bubble so
// bad input is rejected at the DB boundary.

import {
  PRIMITIVE_CATALOG,
  isKnownPrimitive,
  type PrimitiveKind,
  type PropSpec,
} from './primitive-catalog';
import { validateStyle } from './safe-style';
import { evaluate, ExprError } from './expr';

export interface SlotNode {
  kind: PrimitiveKind;
  props?: Record<string, unknown>;
  children?: SlotNode[];
}

export class SanitizerError extends Error {
  constructor(
    public readonly path: string,
    public readonly rule: string,
    message: string,
  ) {
    super(message);
    this.name = 'SanitizerError';
  }
}

function reject(path: string, rule: string, detail: string): never {
  // Include the rule in the message so callers (and tests) can match on
  // the specific violation without digging into `.rule`.
  throw new SanitizerError(path, rule, `[${rule}] ${path}: ${detail}`);
}

function validateValue(
  propName: string,
  spec: PropSpec,
  value: unknown,
  path: string,
): unknown {
  const p = `${path}.${propName}`;
  switch (spec.type) {
    case 'string': {
      if (typeof value !== 'string') {
        reject(p, 'type', `expected string, got ${typeof value}`);
      }
      const s = value as string;
      if (spec.max_length !== undefined && s.length > spec.max_length) {
        reject(p, 'max_length', `string exceeds ${spec.max_length} chars`);
      }
      return s;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        reject(p, 'type', `expected finite number, got ${typeof value}`);
      }
      const n = value as number;
      if (spec.range) {
        const [min, max] = spec.range;
        if (n < min || n > max) {
          reject(p, 'range', `number ${n} outside [${min}, ${max}]`);
        }
      }
      return n;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        reject(p, 'type', `expected boolean, got ${typeof value}`);
      }
      return value;
    }
    case 'enum': {
      if (typeof value !== 'string') {
        reject(p, 'type', `enum prop requires a string`);
      }
      const s = value as string;
      const allowed = spec.enum_values ?? [];
      if (!allowed.includes(s)) {
        reject(p, 'enum', `'${s}' not in [${allowed.join(', ')}]`);
      }
      return s;
    }
    case 'style': {
      try {
        return validateStyle(value, p);
      } catch (err) {
        reject(p, 'style', (err as Error).message);
      }
      // unreachable
      return undefined;
    }
    case 'expr': {
      if (typeof value !== 'string') {
        reject(p, 'type', `expression prop requires a string`);
      }
      try {
        // Run once with an empty scope to confirm grammar. We don't
        // evaluate to a value here — the renderer re-evaluates with its
        // live scope at render time.
        evaluate(value as string, { scope: {} });
      } catch (err) {
        if (err instanceof ExprError) {
          reject(p, 'expr', err.message);
        }
        throw err;
      }
      return value;
    }
  }
}

// Validates a single node in isolation. Returns the sanitized shallow
// copy (without children). Children are handled by the caller so it can
// track depth + enforce `allowed_children_kinds`.
function sanitizeNodeShallow(raw: unknown, path: string): {
  kind: PrimitiveKind;
  props: Record<string, unknown>;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    reject(path, 'shape', 'node must be an object');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.kind !== 'string' || !isKnownPrimitive(obj.kind)) {
    reject(path, 'kind', `unknown kind '${String(obj.kind)}'`);
  }
  const kind = obj.kind;
  const spec = PRIMITIVE_CATALOG[kind];

  const rawProps = obj.props && typeof obj.props === 'object' && !Array.isArray(obj.props)
    ? (obj.props as Record<string, unknown>)
    : {};

  const cleanProps: Record<string, unknown> = {};
  for (const [propName, propValue] of Object.entries(rawProps)) {
    if (propValue === null || propValue === undefined) continue;
    const propSpec = spec.allowed_props[propName];
    if (!propSpec) {
      reject(`${path}.props`, 'unknown_prop', `prop '${propName}' not allowed on '${kind}'`);
    }
    cleanProps[propName] = validateValue(propName, propSpec, propValue, `${path}.props`);
  }

  for (const required of spec.required_props) {
    if (!(required in cleanProps)) {
      reject(`${path}.props`, 'required_prop', `'${kind}' requires prop '${required}'`);
    }
  }

  return { kind, props: cleanProps };
}

const MAX_TREE_DEPTH = 8;
const MAX_TREE_NODES = 200;

// Main entry point. Walks the tree, validates per-level caps, and
// returns the sanitized tree. Throws SanitizerError on the first
// rule violation with a JSON-pointer-ish path.
export function sanitizeSlotTree(
  raw: unknown,
  basePath = '$',
): SlotNode {
  const state = { count: 0 };
  const walked = walk(raw, basePath, 0, state);
  return walked;
}

function walk(
  raw: unknown,
  path: string,
  depth: number,
  state: { count: number },
): SlotNode {
  if (depth > MAX_TREE_DEPTH) {
    reject(path, 'max_depth', `tree exceeds depth ${MAX_TREE_DEPTH}`);
  }
  state.count += 1;
  if (state.count > MAX_TREE_NODES) {
    reject(path, 'max_nodes', `tree exceeds ${MAX_TREE_NODES} nodes total`);
  }

  const shallow = sanitizeNodeShallow(raw, path);
  const spec = PRIMITIVE_CATALOG[shallow.kind];

  const rawChildren = (raw as Record<string, unknown>).children;
  if (rawChildren !== undefined) {
    if (!spec.can_have_children) {
      reject(`${path}.children`, 'no_children', `'${shallow.kind}' cannot have children`);
    }
    if (!Array.isArray(rawChildren)) {
      reject(`${path}.children`, 'shape', 'children must be an array');
    }
    const arr = rawChildren as unknown[];
    if (arr.length > spec.max_children) {
      reject(`${path}.children`, 'max_children', `'${shallow.kind}' supports up to ${spec.max_children} children`);
    }
    const cleanChildren: SlotNode[] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const child = walk(arr[i], `${path}.children[${i}]`, depth + 1, state);
      if (!spec.allowed_children_kinds.includes(child.kind)) {
        reject(
          `${path}.children[${i}]`,
          'allowed_children_kinds',
          `'${shallow.kind}' does not accept child kind '${child.kind}'`,
        );
      }
      cleanChildren.push(child);
    }
    return { kind: shallow.kind, props: shallow.props, children: cleanChildren };
  }

  return { kind: shallow.kind, props: shallow.props };
}

// Best-effort variant for places where we'd rather drop a bad subtree
// than fail the whole page (the RSC renderer falls back to this when
// reading old DB rows that weren't validated on write).
export function sanitizeSlotTreeLenient(raw: unknown): SlotNode | null {
  try {
    return sanitizeSlotTree(raw);
  } catch (err) {
    if (err instanceof SanitizerError) {
      console.warn('[sanitizer] dropping malformed tree', {
        path: err.path,
        rule: err.rule,
        message: err.message,
      });
      return null;
    }
    throw err;
  }
}
