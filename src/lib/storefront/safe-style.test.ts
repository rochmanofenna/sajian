import { describe, it, expect } from 'vitest';
import { sanitizeStyle, validateStyle, SafeStyleError } from './safe-style';

describe('sanitizeStyle — happy path', () => {
  it('passes through numeric values with px units', () => {
    expect(sanitizeStyle({ width: 24 })).toEqual({ width: '24px' });
    expect(sanitizeStyle({ 'border-radius': 8 })).toEqual({ borderRadius: '8px' });
  });

  it('preserves unitless numeric where appropriate', () => {
    expect(sanitizeStyle({ opacity: 0.5 })).toEqual({ opacity: '0.5' });
    expect(sanitizeStyle({ 'font-weight': 600 })).toEqual({ fontWeight: '600' });
    expect(sanitizeStyle({ 'z-index': 10 })).toEqual({ zIndex: '10' });
  });

  it('camelizes kebab-case keys', () => {
    expect(sanitizeStyle({ 'background-color': '#fff', 'text-align': 'center' })).toEqual({
      backgroundColor: '#fff',
      textAlign: 'center',
    });
  });

  it('accepts valid colors', () => {
    for (const c of ['#fff', '#FFFFFF', '#ff00aa', '#ff00aacc', 'rgba(0,0,0,0.5)', 'rgb(1,2,3)', 'transparent']) {
      expect(sanitizeStyle({ color: c })).toHaveProperty('color');
    }
  });

  it('accepts supabase + cdn images via url()', () => {
    const bg = `url("https://abc.supabase.co/storage/v1/object/public/assets/x.png")`;
    expect(sanitizeStyle({ 'background-image': bg })).toHaveProperty('backgroundImage');
  });

  it('accepts linear-gradient', () => {
    expect(sanitizeStyle({ background: 'linear-gradient(90deg, #fff, #000)' })).toHaveProperty('background');
  });

  it('accepts safe transform functions', () => {
    expect(sanitizeStyle({ transform: 'translate(10px, 20px)' })).toEqual({
      transform: 'translate(10px, 20px)',
    });
    expect(sanitizeStyle({ transform: 'rotate(45deg) scale(1.2)' })).toEqual({
      transform: 'rotate(45deg) scale(1.2)',
    });
  });

  it('accepts aspect ratio', () => {
    expect(sanitizeStyle({ 'aspect-ratio': '16 / 9' })).toEqual({ aspectRatio: '16 / 9' });
    expect(sanitizeStyle({ 'aspect-ratio': '1' })).toEqual({ aspectRatio: '1' });
  });
});

describe('sanitizeStyle — attack rejection', () => {
  it('drops unknown properties', () => {
    expect(sanitizeStyle({ behavior: 'url(x)' })).toEqual({});
    expect(sanitizeStyle({ '-moz-binding': 'url(x)' })).toEqual({});
    expect(sanitizeStyle({ '@import': 'url(x)' })).toEqual({});
  });

  it('rejects javascript: URLs in background-image', () => {
    expect(sanitizeStyle({ 'background-image': 'url(javascript:alert(1))' })).toEqual({});
  });

  it('rejects data: URLs in background-image', () => {
    expect(sanitizeStyle({ 'background-image': 'url(data:text/html,<script>x</script>)' })).toEqual({});
  });

  it('rejects url() to unknown hosts', () => {
    expect(sanitizeStyle({ 'background-image': 'url(https://evil.com/x.png)' })).toEqual({});
  });

  it('rejects expression()', () => {
    expect(sanitizeStyle({ width: 'expression(alert(1))' })).toEqual({});
  });

  it('rejects matrix() in transform', () => {
    expect(sanitizeStyle({ transform: 'matrix(1,0,0,1,0,0)' })).toEqual({});
  });

  it('rejects url() injection inside gradient', () => {
    expect(
      sanitizeStyle({ background: 'linear-gradient(#fff, url(javascript:alert(1)))' }),
    ).toEqual({});
  });

  it('rejects semicolons / braces / quotes in gradient strings', () => {
    expect(sanitizeStyle({ background: 'linear-gradient("x"; alert(1))' })).toEqual({});
  });

  it('rejects malformed colors', () => {
    expect(sanitizeStyle({ color: '#GGG' })).toEqual({});
    expect(sanitizeStyle({ color: 'red; behavior:url(x)' })).toEqual({});
  });

  it('rejects out-of-range opacity', () => {
    expect(sanitizeStyle({ opacity: 1.5 })).toEqual({});
    expect(sanitizeStyle({ opacity: -0.2 })).toEqual({});
  });

  it('rejects out-of-range z-index', () => {
    expect(sanitizeStyle({ 'z-index': 9999 })).toEqual({});
    expect(sanitizeStyle({ 'z-index': -100 })).toEqual({});
  });

  it('rejects out-of-range font-weight', () => {
    expect(sanitizeStyle({ 'font-weight': 50 })).toEqual({});
    expect(sanitizeStyle({ 'font-weight': 2000 })).toEqual({});
  });

  it('rejects non-numeric where numeric required', () => {
    expect(sanitizeStyle({ width: 'calc(100% - 20px)' })).toEqual({});
  });

  it('rejects unknown enum values', () => {
    expect(sanitizeStyle({ display: 'run-in' })).toEqual({});
    expect(sanitizeStyle({ position: 'fixedBAD' })).toEqual({});
  });

  it('rejects non-string non-number values', () => {
    expect(sanitizeStyle({ color: { toString: () => '#fff' } })).toEqual({});
    expect(sanitizeStyle({ width: [] })).toEqual({});
  });

  it('rejects arbitrary transitions', () => {
    expect(sanitizeStyle({ transition: 'all 0.3s cubic-bezier(0,0,0,0)' })).toEqual({});
    expect(sanitizeStyle({ transition: 'all 999s step-end' })).toEqual({});
  });
});

describe('validateStyle — strict mode', () => {
  it('throws on unknown property', () => {
    expect(() => validateStyle({ behavior: 'x' })).toThrow(SafeStyleError);
  });

  it('throws on bad value', () => {
    expect(() => validateStyle({ color: '#GGG' })).toThrow(SafeStyleError);
  });

  it('throws on non-object input that is not null', () => {
    expect(() => validateStyle('x')).toThrow(SafeStyleError);
  });

  it('returns empty for null/undefined', () => {
    expect(validateStyle(null)).toEqual({});
    expect(validateStyle(undefined)).toEqual({});
  });

  it('accepts a mix of valid props', () => {
    const out = validateStyle({
      color: '#000',
      'font-size': 14,
      opacity: 0.8,
      transform: 'translate(10px, 20px)',
    });
    expect(out).toEqual({
      color: '#000',
      'font-size': '14px',
      opacity: '0.8',
      transform: 'translate(10px, 20px)',
    });
  });
});

describe('sanitizeStyle — non-object input', () => {
  it('returns {} for null', () => expect(sanitizeStyle(null)).toEqual({}));
  it('returns {} for undefined', () => expect(sanitizeStyle(undefined)).toEqual({}));
  it('returns {} for string', () => expect(sanitizeStyle('color: red')).toEqual({}));
  it('returns {} for number', () => expect(sanitizeStyle(42)).toEqual({}));
  it('returns {} for array', () => expect(sanitizeStyle([1, 2])).toEqual({}));
});

describe('sanitizeStyle — key normalization', () => {
  it('handles uppercase keys', () => {
    expect(sanitizeStyle({ COLOR: '#fff' })).toEqual({ color: '#fff' });
  });

  it('handles mixed-case keys', () => {
    expect(sanitizeStyle({ 'Background-Color': '#fff' })).toEqual({ backgroundColor: '#fff' });
  });
});
