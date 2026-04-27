// Pin the count→grid map. The pre-fix Grid variant always rendered
// grid-cols-3 regardless of photo count, producing 3+1 / 3+2 / orphan
// rows. Sandwicherie hit the 3+1 case at 4 photos. These tests lock
// the trim semantics so future regressions are caught.

import { describe, it, expect } from 'vitest';
import { galleryGridLayout } from './Gallery';

describe('galleryGridLayout', () => {
  it('handles 0 photos', () => {
    const r = galleryGridLayout(0);
    expect(r.cleanCount).toBe(0);
  });

  it('1 photo → 1 col both viewports', () => {
    const r = galleryGridLayout(1);
    expect(r.cleanCount).toBe(1);
    expect(r.desktopCols).toBe('md:grid-cols-1');
  });

  it('2 photos → 2 cols', () => {
    const r = galleryGridLayout(2);
    expect(r.cleanCount).toBe(2);
    expect(r.desktopCols).toBe('md:grid-cols-2');
  });

  it('3 photos → 3 cols on desktop, 1 col on mobile', () => {
    const r = galleryGridLayout(3);
    expect(r.cleanCount).toBe(3);
    expect(r.mobileCols).toBe('grid-cols-1');
    expect(r.desktopCols).toBe('md:grid-cols-3');
  });

  it('4 photos → 2x2 (Sandwicherie regression case — was 3+1)', () => {
    const r = galleryGridLayout(4);
    expect(r.cleanCount).toBe(4);
    expect(r.desktopCols).toBe('md:grid-cols-2');
  });

  it('5 photos → trim to 4, 2 cols (avoids 3+2 orphan)', () => {
    const r = galleryGridLayout(5);
    expect(r.cleanCount).toBe(4);
    expect(r.desktopCols).toBe('md:grid-cols-2');
  });

  it('6 photos → 2x3', () => {
    const r = galleryGridLayout(6);
    expect(r.cleanCount).toBe(6);
    expect(r.desktopCols).toBe('md:grid-cols-3');
  });

  it('7 photos → trim to 6 (avoids 3+3+1 orphan)', () => {
    const r = galleryGridLayout(7);
    expect(r.cleanCount).toBe(6);
    expect(r.desktopCols).toBe('md:grid-cols-3');
  });

  it('8 photos → 2x4', () => {
    const r = galleryGridLayout(8);
    expect(r.cleanCount).toBe(8);
    expect(r.desktopCols).toBe('md:grid-cols-4');
  });

  it('9 photos → 3x3', () => {
    const r = galleryGridLayout(9);
    expect(r.cleanCount).toBe(9);
    expect(r.desktopCols).toBe('md:grid-cols-3');
  });

  it('10–11 photos → trim to 9', () => {
    expect(galleryGridLayout(10).cleanCount).toBe(9);
    expect(galleryGridLayout(11).cleanCount).toBe(9);
  });

  it('12+ photos → cap at 12, 4 cols', () => {
    expect(galleryGridLayout(12).cleanCount).toBe(12);
    expect(galleryGridLayout(20).cleanCount).toBe(12);
    expect(galleryGridLayout(100).cleanCount).toBe(12);
  });
});
