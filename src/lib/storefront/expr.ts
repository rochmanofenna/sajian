// Tiny safe expression evaluator. Parses a string expression with `jsep`,
// walks the AST with a hard node-count cap, and evaluates a whitelist of
// operators + whitelisted function calls only. Throws on any unsupported
// construct.
//
// This is used for dynamic-but-safe values in primitive props (e.g. an
// overlay's `offset_y: "clamp(i * 24, 0, 120)"` bound to a list index).
// It is NOT a general JavaScript runtime — no member access, no
// prototype lookup, no `this`, no defining functions.

import jsep, { type Expression } from 'jsep';

// Configure jsep once: remove every plugin-enabled feature we don't want.
// The default config already excludes regex, object, new, spread, and
// tagged-template literals, which are the main risk vectors. Add nothing.

// Scope values supplied by the caller (e.g. { i: 3, item: { name: 'x' } }).
// We deliberately do NOT support member access on scope values — if the
// caller wants `item.name`, they flatten into `item_name` at the call site.
export type Scope = Record<string, number | string | boolean>;

export type FnImpl = (...args: (number | string | boolean)[]) => number | string | boolean;

export interface EvalEnv {
  scope?: Scope;
  functions?: Record<string, FnImpl>;
  // Defaults to the built-in set below if omitted. When supplied, REPLACES
  // the defaults so callers can narrow the surface further. Pass
  // `{ ...DEFAULT_FUNCTIONS, ... }` to extend.
}

export class ExprError extends Error {
  constructor(message: string, public readonly node?: Expression) {
    super(message);
    this.name = 'ExprError';
  }
}

const MAX_NODES = 50;
const MAX_STRING_OUTPUT = 500;

// Default-safe helpers available to every expression.
export const DEFAULT_FUNCTIONS: Record<string, FnImpl> = {
  clamp: (value, min, max) => {
    const n = Number(value);
    const lo = Number(min);
    const hi = Number(max);
    if (!Number.isFinite(n) || !Number.isFinite(lo) || !Number.isFinite(hi)) {
      throw new ExprError('clamp arguments must be numeric');
    }
    return Math.min(Math.max(n, lo), hi);
  },
  lerp: (a, b, t) => {
    const aa = Number(a);
    const bb = Number(b);
    const tt = Number(t);
    if (![aa, bb, tt].every(Number.isFinite)) {
      throw new ExprError('lerp arguments must be numeric');
    }
    return aa + (bb - aa) * tt;
  },
  mod: (a, b) => {
    const aa = Number(a);
    const bb = Number(b);
    if (!Number.isFinite(aa) || !Number.isFinite(bb) || bb === 0) {
      throw new ExprError('mod arguments must be numeric and divisor non-zero');
    }
    return aa % bb;
  },
  min: (...args) => Math.min(...args.map(Number)),
  max: (...args) => Math.max(...args.map(Number)),
  round: (n) => Math.round(Number(n)),
  floor: (n) => Math.floor(Number(n)),
  ceil: (n) => Math.ceil(Number(n)),
  now: () => Date.now(),
  msUntil: (iso) => {
    const t = new Date(String(iso)).getTime();
    if (!Number.isFinite(t)) throw new ExprError('msUntil requires a valid ISO 8601 string');
    return t - Date.now();
  },
};

interface BinaryExpression extends Expression {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}
interface LogicalExpression extends Expression {
  type: 'LogicalExpression';
  operator: string;
  left: Expression;
  right: Expression;
}
interface ConditionalExpression extends Expression {
  type: 'ConditionalExpression';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}
interface UnaryExpression extends Expression {
  type: 'UnaryExpression';
  operator: string;
  argument: Expression;
}
interface CallExpression extends Expression {
  type: 'CallExpression';
  callee: Expression;
  arguments: Expression[];
}
interface IdentifierExpression extends Expression {
  type: 'Identifier';
  name: string;
}
interface LiteralExpression extends Expression {
  type: 'Literal';
  value: number | string | boolean | null;
  raw: string;
}

type Value = number | string | boolean;

const ALLOWED_BINARY = new Set(['+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!=', '===', '!==']);
const ALLOWED_LOGICAL = new Set(['&&', '||']);
const ALLOWED_UNARY = new Set(['-', '+', '!']);

function ensureValue(v: unknown): Value {
  if (v === null || v === undefined) {
    throw new ExprError('null/undefined not supported in expressions');
  }
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  throw new ExprError(`unsupported value type ${typeof v}`);
}

function evalNode(node: Expression, env: Required<EvalEnv>, state: { nodes: number }): Value {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) {
    throw new ExprError(`expression exceeds max AST node count (${MAX_NODES})`);
  }

  switch (node.type) {
    case 'Literal': {
      const lit = node as LiteralExpression;
      if (lit.value === null) throw new ExprError('null literal not allowed', node);
      return lit.value as Value;
    }
    case 'Identifier': {
      const id = node as IdentifierExpression;
      if (id.name === 'true') return true;
      if (id.name === 'false') return false;
      if (Object.prototype.hasOwnProperty.call(env.scope, id.name)) {
        return ensureValue(env.scope[id.name]);
      }
      throw new ExprError(`unknown identifier '${id.name}'`, node);
    }
    case 'UnaryExpression': {
      const u = node as UnaryExpression;
      if (!ALLOWED_UNARY.has(u.operator)) {
        throw new ExprError(`unary operator '${u.operator}' not allowed`, node);
      }
      const arg = evalNode(u.argument, env, state);
      if (u.operator === '-') return -Number(arg);
      if (u.operator === '+') return +Number(arg);
      if (u.operator === '!') return !arg;
      throw new ExprError('unreachable', node);
    }
    case 'BinaryExpression': {
      const b = node as BinaryExpression;
      // jsep routes && / || through BinaryExpression in some versions.
      // Handle those here with short-circuit semantics so callers don't
      // have to rely on a specific jsep version emitting LogicalExpression.
      if (b.operator === '&&' || b.operator === '||') {
        const left = evalNode(b.left, env, state);
        if (b.operator === '&&') return left ? evalNode(b.right, env, state) : left;
        return left ? left : evalNode(b.right, env, state);
      }
      if (!ALLOWED_BINARY.has(b.operator)) {
        throw new ExprError(`binary operator '${b.operator}' not allowed`, node);
      }
      const left = evalNode(b.left, env, state);
      const right = evalNode(b.right, env, state);
      switch (b.operator) {
        case '+':
          if (typeof left === 'string' || typeof right === 'string') {
            const s = String(left) + String(right);
            if (s.length > MAX_STRING_OUTPUT) {
              throw new ExprError('string result too long');
            }
            return s;
          }
          return Number(left) + Number(right);
        case '-': return Number(left) - Number(right);
        case '*': return Number(left) * Number(right);
        case '/': {
          const rr = Number(right);
          if (rr === 0) throw new ExprError('division by zero');
          return Number(left) / rr;
        }
        case '%': {
          const rr = Number(right);
          if (rr === 0) throw new ExprError('modulo by zero');
          return Number(left) % rr;
        }
        case '<': return Number(left) < Number(right);
        case '<=': return Number(left) <= Number(right);
        case '>': return Number(left) > Number(right);
        case '>=': return Number(left) >= Number(right);
        case '==':
        case '===': return left === right;
        case '!=':
        case '!==': return left !== right;
        default: throw new ExprError('unreachable', node);
      }
    }
    case 'LogicalExpression': {
      const l = node as LogicalExpression;
      if (!ALLOWED_LOGICAL.has(l.operator)) {
        throw new ExprError(`logical operator '${l.operator}' not allowed`, node);
      }
      const left = evalNode(l.left, env, state);
      if (l.operator === '&&') return left ? evalNode(l.right, env, state) : left;
      return left ? left : evalNode(l.right, env, state);
    }
    case 'ConditionalExpression': {
      const c = node as ConditionalExpression;
      const test = evalNode(c.test, env, state);
      return test ? evalNode(c.consequent, env, state) : evalNode(c.alternate, env, state);
    }
    case 'CallExpression': {
      const call = node as CallExpression;
      if (call.callee.type !== 'Identifier') {
        throw new ExprError('only direct function calls by name are allowed', node);
      }
      const name = (call.callee as IdentifierExpression).name;
      const fn = env.functions[name];
      if (!fn) {
        throw new ExprError(`function '${name}' not in whitelist`, node);
      }
      const args = call.arguments.map((a) => evalNode(a, env, state));
      return ensureValue(fn(...args));
    }
    default:
      throw new ExprError(`node type '${node.type}' not supported`, node);
  }
}

export function evaluate(expr: string, env: EvalEnv = {}): Value {
  if (typeof expr !== 'string') throw new ExprError('expression must be a string');
  const trimmed = expr.trim();
  if (trimmed.length === 0) throw new ExprError('expression is empty');
  if (trimmed.length > 500) throw new ExprError('expression too long');

  let ast: Expression;
  try {
    ast = jsep(trimmed);
  } catch (err) {
    throw new ExprError(`parse error: ${(err as Error).message}`);
  }

  const merged: Required<EvalEnv> = {
    scope: env.scope ?? {},
    functions: env.functions ?? DEFAULT_FUNCTIONS,
  };
  return evalNode(ast, merged, { nodes: 0 });
}

// Convenience: evaluate and coerce to number. Returns fallback on any
// failure (callers that need strictness use `evaluate` directly).
export function evaluateNumber(
  expr: string | number,
  env: EvalEnv = {},
  fallback = 0,
): number {
  if (typeof expr === 'number') return Number.isFinite(expr) ? expr : fallback;
  try {
    const v = evaluate(expr, env);
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
