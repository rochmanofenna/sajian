// JSX sanitizer — the trust boundary for raw AI-emitted source. Walks
// the Babel AST, rejects every construct that could reach the DOM,
// network, or prototype chain, and either:
//   (a) reduces the tree to the Phase-1 SlotNode format if the JSX is
//       pure primitive composition (no hooks, no logic, no literals
//       outside prop values), OR
//   (b) returns a cleaned source string ready for `@mdx-js/mdx`'s
//       compile step, when hooks/state/expression logic are needed.
//
// Throws `SanitizerError` (shared with the slot-tree sanitizer) on any
// violation. The compile API catches that and writes it back to
// compile_status='sanitizer_failed' with the path + rule.

import { parse, type ParserOptions } from '@babel/parser';
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  File,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXIdentifier,
  JSXMemberExpression,
  JSXText,
  Node,
  ObjectExpression,
  Statement,
  StringLiteral,
  VariableDeclaration,
  VariableDeclarator,
} from '@babel/types';
import { SanitizerError, type SlotNode } from './sanitizer';
import { PRIMITIVE_CATALOG, isKnownPrimitive, type PrimitiveKind } from './primitive-catalog';

export interface SanitizeJsxOptions {
  max_length?: number;
  max_nodes?: number;
  max_depth?: number;
}

export type SanitizeJsxResult =
  | { kind: 'slot_tree'; tree: SlotNode }
  | { kind: 'compile'; cleaned_source: string };

const DEFAULT_OPTIONS: Required<SanitizeJsxOptions> = {
  max_length: 8000,
  max_nodes: 400,
  max_depth: 20,
};

const PARSER_OPTIONS: ParserOptions = {
  sourceType: 'module',
  plugins: ['jsx'],
  errorRecovery: false,
};

// Every JSX element type the AI may reference. Capitalized identifiers
// have to appear in PRIMITIVE_MAP (via their kind); lowercase tags map
// to the HTML allow-list below.
const PRIMITIVE_MAP: Record<string, PrimitiveKind> = {
  Motion: 'motion',
  Overlay: 'overlay',
  Stack: 'stack',
  Box: 'box',
  Countdown: 'countdown',
  Scheduled: 'scheduled',
  TimeOfDay: 'time-of-day',
  Text: 'text',
  Image: 'image',
  Button: 'button',
  Icon: 'icon',
};

const ALLOWED_LOWER_TAGS = new Set([
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'section',
  'article',
  'nav',
  'header',
  'footer',
  'main',
  'img',
  'a',
  'button',
]);

const BANNED_GLOBALS = new Set([
  'window',
  'document',
  'globalThis',
  'self',
  'top',
  'parent',
  'process',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'Function',
  'eval',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'navigator',
  'location',
  'history',
  'crypto',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'Reflect',
  'Proxy',
  'Atomics',
]);

const BANNED_MEMBER_NAMES = new Set(['constructor', '__proto__', 'prototype']);

const ALLOWED_HOOKS = new Set(['useState', 'useMemo']);

const BANNED_ATTRIBUTES = new Set(['dangerouslySetInnerHTML', 'ref']);

const BANNED_URL_PREFIXES = ['javascript:', 'data:text/html', 'vbscript:', 'file:'];

function reject(path: string, rule: string, detail: string): never {
  throw new SanitizerError(path, rule, `[${rule}] ${path}: ${detail}`);
}

// Normalizes a JSX element name to either a known primitive kind or an
// allowed lowercase tag; throws on anything else.
function normalizeElementName(
  nameNode: JSXIdentifier | JSXMemberExpression,
  path: string,
): { kind: 'primitive'; primitive: PrimitiveKind } | { kind: 'tag'; tag: string } {
  if (nameNode.type === 'JSXMemberExpression') {
    reject(path, 'jsx_member_element', 'member-expression element types not allowed');
  }
  const id = nameNode as JSXIdentifier;
  const name = id.name;
  if (/^[A-Z]/.test(name)) {
    const primitive = PRIMITIVE_MAP[name];
    if (!primitive) {
      reject(path, 'unknown_component', `unknown component '${name}'`);
    }
    return { kind: 'primitive', primitive };
  }
  if (!ALLOWED_LOWER_TAGS.has(name)) {
    reject(path, 'unknown_tag', `lowercase tag '${name}' not in allow-list`);
  }
  return { kind: 'tag', tag: name };
}

interface WalkState {
  nodes: number;
  max_nodes: number;
  max_depth: number;
  requires_compile: boolean;
}

// Walks an arbitrary expression / statement subtree enforcing the
// reject rules. Sets state.requires_compile=true when it sees anything
// that can't reduce to a slot tree (hooks, expressions, conditionals).
function walkGeneric(node: Node | null | undefined, path: string, depth: number, state: WalkState): void {
  if (!node) return;
  state.nodes += 1;
  if (state.nodes > state.max_nodes) {
    reject(path, 'max_nodes', `tree exceeds ${state.max_nodes} nodes`);
  }
  if (depth > state.max_depth) {
    reject(path, 'max_depth', `tree exceeds depth ${state.max_depth}`);
  }

  switch (node.type) {
    case 'ImportDeclaration':
    case 'ExportDefaultDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
      reject(path, 'banned_declaration', `${node.type} not allowed — imports are injected by the compiler`);
    case 'ThrowStatement':
      reject(path, 'throw', 'throw statements not allowed');
    case 'TryStatement':
    case 'CatchClause':
      reject(path, 'try_catch', 'try/catch not allowed');
    case 'RegExpLiteral':
      reject(path, 'regex', 'regular expressions not allowed');
    case 'TaggedTemplateExpression':
      reject(path, 'tagged_template', 'tagged template literals not allowed');
    case 'NewExpression':
      reject(path, 'new_expression', 'new expressions not allowed');
    case 'UpdateExpression':
      reject(path, 'update_expression', '++/-- not allowed');
    case 'AssignmentExpression':
      reject(path, 'assignment', 'assignment outside hook setters not allowed');
    case 'MetaProperty':
      reject(path, 'meta_property', 'new.target / import.meta not allowed');
    case 'AwaitExpression':
    case 'YieldExpression':
      reject(path, 'async', 'await / yield not allowed');
    case 'Identifier': {
      const id = node as Identifier;
      if (BANNED_GLOBALS.has(id.name)) {
        reject(path, 'banned_global', `'${id.name}' is not accessible`);
      }
      // Strip zero-width / fullwidth obfuscation attempts — if the NAME
      // normalizes to a banned identifier after removing non-ASCII, we
      // still reject.
      const ascii = id.name.normalize('NFKC').replace(/[^\x20-\x7e]/g, '');
      if (ascii !== id.name && BANNED_GLOBALS.has(ascii)) {
        reject(path, 'banned_global_obfuscated', `obfuscated banned identifier '${id.name}'`);
      }
      return;
    }
    case 'MemberExpression':
    case 'OptionalMemberExpression': {
      // Block both member.object being a banned global (window.fetch)
      // and member.property being a banned name (x.constructor).
      const me = node as { object: Node; property: Node; computed: boolean };
      if (me.object.type === 'Identifier' && BANNED_GLOBALS.has((me.object as Identifier).name)) {
        reject(path, 'banned_global_access', `access to '${(me.object as Identifier).name}' blocked`);
      }
      if (!me.computed && me.property.type === 'Identifier' && BANNED_MEMBER_NAMES.has((me.property as Identifier).name)) {
        reject(path, 'prototype_walk', `member '${(me.property as Identifier).name}' blocked`);
      }
      // Computed member access with a string literal still counts.
      if (me.computed && me.property.type === 'StringLiteral' && BANNED_MEMBER_NAMES.has((me.property as StringLiteral).value)) {
        reject(path, 'prototype_walk_computed', `computed member '${(me.property as StringLiteral).value}' blocked`);
      }
      state.requires_compile = true;
      walkGeneric(me.object, `${path}.object`, depth + 1, state);
      walkGeneric(me.property, `${path}.property`, depth + 1, state);
      return;
    }
    case 'CallExpression': {
      const call = node as CallExpression;
      if (call.callee.type === 'Identifier' && BANNED_GLOBALS.has((call.callee as Identifier).name)) {
        reject(path, 'banned_call', `call to '${(call.callee as Identifier).name}' blocked`);
      }
      // useState / useMemo are OK; any other Identifier call is OK as
      // long as it doesn't reference a banned global (handled above).
      state.requires_compile = true;
      walkGeneric(call.callee, `${path}.callee`, depth + 1, state);
      for (let i = 0; i < call.arguments.length; i += 1) {
        walkGeneric(call.arguments[i] as Node, `${path}.arguments[${i}]`, depth + 1, state);
      }
      return;
    }
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      state.requires_compile = true;
      const fn = node as FunctionExpression | ArrowFunctionExpression;
      walkGeneric(fn.body, `${path}.body`, depth + 1, state);
      return;
    }
    case 'ConditionalExpression':
    case 'LogicalExpression':
    case 'BinaryExpression':
      state.requires_compile = true;
      walkChildren(node, path, depth, state);
      return;
    case 'VariableDeclaration': {
      const vd = node as VariableDeclaration;
      for (const d of vd.declarations) {
        walkGeneric(d, `${path}.declarations`, depth + 1, state);
      }
      return;
    }
    case 'VariableDeclarator': {
      const d = node as VariableDeclarator;
      walkGeneric(d.init as Node | null, `${path}.init`, depth + 1, state);
      return;
    }
    case 'JSXElement':
      walkJsxElement(node as JSXElement, path, depth, state);
      return;
    case 'JSXFragment':
      // Fragments are fine; walk children.
      for (let i = 0; i < (node as { children: Node[] }).children.length; i += 1) {
        walkGeneric((node as { children: Node[] }).children[i], `${path}.children[${i}]`, depth + 1, state);
      }
      return;
    case 'JSXExpressionContainer': {
      const ec = node as JSXExpressionContainer;
      state.requires_compile = true;
      walkGeneric(ec.expression, `${path}.expression`, depth + 1, state);
      return;
    }
    case 'TemplateLiteral': {
      const tl = node as { quasis: { value: { cooked?: string | null; raw: string } }[]; expressions: Node[] };
      for (const q of tl.quasis) {
        const cooked = (q.value.cooked ?? q.value.raw).toLowerCase();
        for (const banned of BANNED_URL_PREFIXES) {
          if (cooked.includes(banned)) {
            reject(path, 'banned_url_prefix', `template literal contains '${banned}'`);
          }
        }
      }
      for (let i = 0; i < tl.expressions.length; i += 1) {
        walkGeneric(tl.expressions[i], `${path}.expressions[${i}]`, depth + 1, state);
      }
      return;
    }
    case 'SpreadElement':
    case 'RestElement':
      reject(path, 'spread', 'spread / rest not allowed');
    case 'SequenceExpression':
      reject(path, 'sequence', 'comma expressions not allowed');
    default:
      walkChildren(node, path, depth, state);
  }
}

function walkChildren(node: Node, path: string, depth: number, state: WalkState): void {
  const record = node as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        walkGeneric(value[i] as Node, `${path}.${key}[${i}]`, depth + 1, state);
      }
    } else if (value && typeof value === 'object' && 'type' in (value as Node)) {
      walkGeneric(value as Node, `${path}.${key}`, depth + 1, state);
    }
  }
}

function checkUrlString(raw: string, path: string): void {
  const lower = raw.trim().toLowerCase();
  for (const banned of BANNED_URL_PREFIXES) {
    if (lower.startsWith(banned)) {
      reject(path, 'banned_url_prefix', `string starts with '${banned}'`);
    }
  }
}

function walkAttribute(attr: JSXAttribute, path: string, state: WalkState): void {
  if (attr.name.type !== 'JSXIdentifier') {
    reject(path, 'namespaced_attr', 'namespaced JSX attributes not allowed');
  }
  const name = (attr.name as JSXIdentifier).name;

  if (BANNED_ATTRIBUTES.has(name)) {
    reject(path, 'banned_attribute', `attribute '${name}' blocked`);
  }
  if (name.startsWith('on')) {
    reject(path, 'event_handler', `event-handler attribute '${name}' blocked`);
  }

  const val = attr.value;
  if (!val) return;
  if (val.type === 'StringLiteral') {
    const v = (val as StringLiteral).value;
    if (name === 'href' || name === 'src') {
      checkUrlString(v, `${path}.${name}`);
    }
    return;
  }
  if (val.type === 'JSXExpressionContainer') {
    const expr = (val as JSXExpressionContainer).expression;
    // Pure literal expressions (number, boolean, string, simple object
    // literal) don't force the compile path — reduceToSlotTree can still
    // handle them. Anything else (identifier, call, conditional) needs
    // the compiler.
    const isLiteralExpr =
      expr.type === 'NumericLiteral' ||
      expr.type === 'BooleanLiteral' ||
      expr.type === 'StringLiteral' ||
      expr.type === 'NullLiteral' ||
      expr.type === 'ObjectExpression';
    if (!isLiteralExpr) state.requires_compile = true;
    walkGeneric(expr, `${path}.${name}`, 0, state);
    if (expr.type === 'StringLiteral' && (name === 'href' || name === 'src')) {
      checkUrlString((expr as StringLiteral).value, `${path}.${name}`);
    }
    return;
  }
}

function walkJsxElement(el: JSXElement, path: string, depth: number, state: WalkState): void {
  state.nodes += 1;
  if (state.nodes > state.max_nodes) {
    reject(path, 'max_nodes', `tree exceeds ${state.max_nodes} nodes`);
  }
  const nameNode = el.openingElement.name;
  if (nameNode.type === 'JSXNamespacedName') {
    reject(`${path}.type`, 'namespaced_element', 'namespaced JSX element types not allowed');
  }
  normalizeElementName(nameNode, `${path}.type`);

  for (let i = 0; i < el.openingElement.attributes.length; i += 1) {
    const attr = el.openingElement.attributes[i];
    if (attr.type === 'JSXSpreadAttribute') {
      reject(`${path}.attributes[${i}]`, 'spread_attr', 'spread JSX attributes not allowed');
    }
    walkAttribute(attr as JSXAttribute, `${path}.attributes[${i}]`, state);
  }

  for (let i = 0; i < el.children.length; i += 1) {
    const child = el.children[i] as Node;
    walkGeneric(child, `${path}.children[${i}]`, depth + 1, state);
  }
}

// Tries to reduce a JSX element tree to a SlotNode tree. Returns null
// when the JSX uses anything that can't be expressed as a slot tree
// (hooks, expressions, conditionals, lowercase tags, etc.).
function reduceToSlotTree(el: JSXElement, path: string): SlotNode | null {
  const name = el.openingElement.name;
  if (name.type === 'JSXNamespacedName') return null;
  const named = normalizeElementName(name, `${path}.type`);
  if (named.kind !== 'primitive') return null;
  const primitive = named.primitive;
  const spec = PRIMITIVE_CATALOG[primitive];

  const props: Record<string, unknown> = {};
  for (const attr of el.openingElement.attributes) {
    if (attr.type !== 'JSXAttribute') return null;
    const attrName = attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
    if (!attrName) return null;
    const spec_prop = spec.allowed_props[attrName];
    if (!spec_prop) return null;
    const val = attr.value;
    if (!val) {
      props[attrName] = true;
      continue;
    }
    if (val.type === 'StringLiteral') {
      props[attrName] = (val as StringLiteral).value;
      continue;
    }
    if (val.type === 'JSXExpressionContainer') {
      const expr = (val as JSXExpressionContainer).expression as Expression;
      if (expr.type === 'StringLiteral') {
        props[attrName] = (expr as StringLiteral).value;
      } else if (expr.type === 'NumericLiteral') {
        props[attrName] = (expr as { value: number }).value;
      } else if (expr.type === 'BooleanLiteral') {
        props[attrName] = (expr as { value: boolean }).value;
      } else if (expr.type === 'ObjectExpression' && attrName === 'style') {
        // Best-effort: translate an inline object literal into a plain
        // object. Non-literal values bail to compile path.
        const style: Record<string, unknown> = {};
        for (const p of (expr as ObjectExpression).properties) {
          if (p.type !== 'ObjectProperty') return null;
          if (p.computed) return null;
          const key =
            p.key.type === 'Identifier'
              ? (p.key as Identifier).name
              : p.key.type === 'StringLiteral'
                ? (p.key as StringLiteral).value
                : null;
          if (!key) return null;
          if (p.value.type === 'StringLiteral') style[key] = (p.value as StringLiteral).value;
          else if (p.value.type === 'NumericLiteral') style[key] = (p.value as { value: number }).value;
          else return null;
        }
        props[attrName] = style;
      } else {
        return null;
      }
      continue;
    }
    return null;
  }

  const children: SlotNode[] = [];
  for (const child of el.children) {
    if (child.type === 'JSXText') {
      const text = (child as JSXText).value.trim();
      if (!text) continue;
      children.push({ kind: 'text', props: { content: text } });
      continue;
    }
    if (child.type === 'JSXElement') {
      const reduced = reduceToSlotTree(child as JSXElement, `${path}.children`);
      if (!reduced) return null;
      children.push(reduced);
      continue;
    }
    // Anything else (expression containers, fragments, comments) bail.
    if (child.type === 'JSXExpressionContainer') return null;
    if (child.type === 'JSXFragment') return null;
  }

  const node: SlotNode = { kind: primitive, props };
  if (children.length > 0) {
    if (!spec.can_have_children) return null;
    node.children = children;
  }
  return node;
}

// Extracts the first "return <JSX/>" from the top-level function body
// or, for trivial inputs, the root JSX expression. Returns null when
// the shape isn't a simple return — callers fall through to the
// compile path.
function extractRootJsx(file: File): JSXElement | null {
  for (const stmt of file.program.body) {
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'JSXElement') {
      return stmt.expression as JSXElement;
    }
    if (stmt.type === 'FunctionDeclaration' || stmt.type === 'VariableDeclaration') {
      const fn = stmt.type === 'FunctionDeclaration'
        ? (stmt as FunctionDeclaration)
        : ((stmt as VariableDeclaration).declarations[0]?.init as FunctionExpression | ArrowFunctionExpression | null);
      if (!fn) continue;
      const body = fn.body;
      if (body.type !== 'BlockStatement') {
        if (body.type === 'JSXElement') return body as unknown as JSXElement;
        continue;
      }
      for (const bodyStmt of body.body as Statement[]) {
        if (bodyStmt.type === 'ReturnStatement' && bodyStmt.argument?.type === 'JSXElement') {
          return bodyStmt.argument as JSXElement;
        }
      }
    }
  }
  return null;
}

export function sanitizeJsx(
  rawSource: string,
  opts: SanitizeJsxOptions = {},
): SanitizeJsxResult {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  if (typeof rawSource !== 'string') {
    reject('$', 'type', 'source must be a string');
  }
  const source = rawSource.trim();
  if (!source) reject('$', 'empty', 'source is empty');
  if (source.length > options.max_length) {
    reject('$', 'max_length', `source exceeds ${options.max_length} chars`);
  }

  let ast: File;
  try {
    ast = parse(source, PARSER_OPTIONS);
  } catch (err) {
    reject('$', 'parse_error', (err as Error).message);
  }

  const state: WalkState = {
    nodes: 0,
    max_nodes: options.max_nodes,
    max_depth: options.max_depth,
    requires_compile: false,
  };

  // Walk every statement so we catch top-level bans (imports, throws).
  for (let i = 0; i < ast.program.body.length; i += 1) {
    walkGeneric(ast.program.body[i], `program.body[${i}]`, 0, state);
  }

  // Try reduction to a slot tree first. If the JSX is pure primitive
  // composition with literal-only props, we keep it in the fast path
  // (no compiler, no MDX runtime required).
  if (!state.requires_compile) {
    const rootJsx = extractRootJsx(ast);
    if (rootJsx) {
      const reduced = reduceToSlotTree(rootJsx, '$');
      if (reduced) return { kind: 'slot_tree', tree: reduced };
    }
  }

  return { kind: 'compile', cleaned_source: source };
}

export const JSX_SANITIZER_VERSION = '1';
