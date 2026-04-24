import { describe, it, expect } from 'vitest';
import { evaluate, evaluateNumber, ExprError, DEFAULT_FUNCTIONS } from './expr';

describe('expr — literals', () => {
  it('evaluates numbers', () => expect(evaluate('42')).toBe(42));
  it('evaluates negative numbers', () => expect(evaluate('-3')).toBe(-3));
  it('evaluates floats', () => expect(evaluate('1.5')).toBe(1.5));
  it('evaluates strings', () => expect(evaluate('"hi"')).toBe('hi'));
  it('evaluates strings (single quotes)', () => expect(evaluate("'hi'")).toBe('hi'));
  it('evaluates true/false via identifier', () => {
    expect(evaluate('true')).toBe(true);
    expect(evaluate('false')).toBe(false);
  });
});

describe('expr — arithmetic', () => {
  it('adds', () => expect(evaluate('2 + 3')).toBe(5));
  it('subtracts', () => expect(evaluate('10 - 4')).toBe(6));
  it('multiplies', () => expect(evaluate('6 * 7')).toBe(42));
  it('divides', () => expect(evaluate('20 / 4')).toBe(5));
  it('modulo', () => expect(evaluate('10 % 3')).toBe(1));
  it('respects precedence', () => expect(evaluate('2 + 3 * 4')).toBe(14));
  it('respects parens', () => expect(evaluate('(2 + 3) * 4')).toBe(20));
  it('throws on divide by zero', () => expect(() => evaluate('1 / 0')).toThrow(ExprError));
});

describe('expr — comparison + logical', () => {
  it('compares', () => {
    expect(evaluate('3 > 2')).toBe(true);
    expect(evaluate('3 < 2')).toBe(false);
    expect(evaluate('3 == 3')).toBe(true);
    expect(evaluate('3 != 4')).toBe(true);
  });
  it('logical and/or', () => {
    expect(evaluate('true && false')).toBe(false);
    expect(evaluate('true || false')).toBe(true);
  });
  it('short-circuits', () => {
    // If it evaluated right-hand side, it'd throw on unknown identifier.
    expect(evaluate('false && unknownVar', { scope: {} })).toBe(false);
  });
});

describe('expr — ternary', () => {
  it('picks consequent', () => expect(evaluate('true ? 1 : 2')).toBe(1));
  it('picks alternate', () => expect(evaluate('false ? 1 : 2')).toBe(2));
  it('nested', () => expect(evaluate('1 > 2 ? "a" : (3 > 2 ? "b" : "c")')).toBe('b'));
});

describe('expr — scope', () => {
  it('reads scope identifier', () => {
    expect(evaluate('i * 2', { scope: { i: 5 } })).toBe(10);
  });
  it('throws on unknown identifier', () => {
    expect(() => evaluate('x + 1', { scope: {} })).toThrow(ExprError);
  });
});

describe('expr — functions', () => {
  it('calls clamp', () => {
    expect(evaluate('clamp(100, 0, 50)')).toBe(50);
    expect(evaluate('clamp(-10, 0, 50)')).toBe(0);
    expect(evaluate('clamp(25, 0, 50)')).toBe(25);
  });
  it('calls lerp', () => {
    expect(evaluate('lerp(0, 100, 0.5)')).toBe(50);
  });
  it('calls min/max', () => {
    expect(evaluate('min(3, 1, 2)')).toBe(1);
    expect(evaluate('max(3, 1, 2)')).toBe(3);
  });
  it('calls mod', () => expect(evaluate('mod(10, 3)')).toBe(1));
  it('calls round/floor/ceil', () => {
    expect(evaluate('round(1.4)')).toBe(1);
    expect(evaluate('round(1.6)')).toBe(2);
    expect(evaluate('floor(1.9)')).toBe(1);
    expect(evaluate('ceil(1.1)')).toBe(2);
  });
  it('throws when function not in whitelist', () => {
    expect(() => evaluate('eval("1")')).toThrow(ExprError);
    expect(() => evaluate('fetch("/")')).toThrow(ExprError);
    expect(() => evaluate('Function("x")()')).toThrow(ExprError);
  });
  it('accepts a custom function set', () => {
    const shout = (s: string | number | boolean) => String(s).toUpperCase();
    expect(evaluate('shout("hi")', { functions: { shout } })).toBe('HI');
  });
});

describe('expr — adversarial', () => {
  it('blocks member access', () => {
    expect(() => evaluate('x.constructor', { scope: { x: 1 } })).toThrow(ExprError);
    expect(() => evaluate('({}).__proto__', {})).toThrow(ExprError);
  });

  it('blocks computed member access', () => {
    expect(() => evaluate('x["constructor"]', { scope: { x: 1 } })).toThrow(ExprError);
  });

  it('blocks prototype walk via constructor', () => {
    expect(() => evaluate('(0).constructor.constructor("x")')).toThrow(ExprError);
  });

  it('blocks new expressions', () => {
    expect(() => evaluate('new Function("x")')).toThrow(ExprError);
  });

  it('blocks regex literals', () => {
    expect(() => evaluate('/abc/')).toThrow(ExprError);
  });

  it('blocks object literal construction', () => {
    expect(() => evaluate('{a: 1}')).toThrow(ExprError);
  });

  it('blocks spread', () => {
    expect(() => evaluate('[...x]', { scope: { x: 1 } })).toThrow(ExprError);
  });

  it('rejects expressions that are too long', () => {
    expect(() => evaluate('1 + '.repeat(200) + '1')).toThrow(ExprError);
  });

  it('rejects empty expressions', () => {
    expect(() => evaluate('')).toThrow(ExprError);
    expect(() => evaluate('   ')).toThrow(ExprError);
  });

  it('rejects ** (exponentiation) — not in allowed operators', () => {
    expect(() => evaluate('2 ** 10')).toThrow(ExprError);
  });

  it('blocks assignment', () => {
    expect(() => evaluate('x = 1', { scope: { x: 0 } })).toThrow(ExprError);
  });

  it('blocks comma expression via multi-arg (allowed only inside function calls)', () => {
    expect(() => evaluate('1, 2')).toThrow(ExprError);
  });

  it('respects node count cap', () => {
    const deep = Array.from({ length: 60 }, (_, i) => String(i)).join(' + ');
    expect(() => evaluate(deep)).toThrow(/max AST node/);
  });

  it('caps string output length', () => {
    // 26 * 26 = 676 which exceeds the 500 limit.
    expect(() =>
      evaluate('s + s', { scope: { s: 'x'.repeat(260) } }),
    ).toThrow(/string result too long/);
  });
});

describe('evaluateNumber — helper', () => {
  it('returns fallback on parse error', () => {
    expect(evaluateNumber('1 + +')).toBe(0);
    expect(evaluateNumber('1 + +', {}, -1)).toBe(-1);
  });

  it('returns fallback on non-numeric result', () => {
    expect(evaluateNumber('"hello"', {}, -1)).toBe(-1);
  });

  it('passes numbers through', () => {
    expect(evaluateNumber(42)).toBe(42);
    expect(evaluateNumber(NaN)).toBe(0);
  });

  it('evaluates expressions to numbers', () => {
    expect(evaluateNumber('3 + 4')).toBe(7);
  });
});

describe('expr — DEFAULT_FUNCTIONS shape', () => {
  it('has the documented set', () => {
    const expected = [
      'clamp',
      'lerp',
      'mod',
      'min',
      'max',
      'round',
      'floor',
      'ceil',
      'now',
      'msUntil',
    ];
    for (const k of expected) {
      expect(DEFAULT_FUNCTIONS[k]).toBeTypeOf('function');
    }
  });
});
