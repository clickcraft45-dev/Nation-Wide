import { findOverlappingSlabs } from './weight-slab-overlap';

describe('findOverlappingSlabs', () => {
  it('returns null when slabs are contiguous with no gap and no overlap', () => {
    const slabs = [
      { weightFromKg: 0.5, weightToKg: 1 },
      { weightFromKg: 1.01, weightToKg: 2 },
    ];
    expect(findOverlappingSlabs(slabs)).toBeNull();
  });

  it('treats a gap between slabs as legal (returns null)', () => {
    const slabs = [
      { weightFromKg: 0.5, weightToKg: 1 },
      { weightFromKg: 2, weightToKg: 3 },
    ];
    expect(findOverlappingSlabs(slabs)).toBeNull();
  });

  it('detects an overlap where one slab is fully contained within another', () => {
    const slabs = [
      { weightFromKg: 20, weightToKg: 100 },
      { weightFromKg: 40, weightToKg: 70 },
    ];
    const result = findOverlappingSlabs(slabs);
    expect(result).not.toBeNull();
  });

  it('detects a boundary-touching overlap (next.from <= current.to)', () => {
    const slabs = [
      { weightFromKg: 20, weightToKg: 40 },
      { weightFromKg: 40, weightToKg: 70 },
    ];
    const result = findOverlappingSlabs(slabs);
    expect(result).not.toBeNull();
  });

  it('is order-independent (sorts internally before checking)', () => {
    const slabs = [
      { weightFromKg: 40, weightToKg: 70 },
      { weightFromKg: 20, weightToKg: 41 },
    ];
    expect(findOverlappingSlabs(slabs)).not.toBeNull();
  });

  it('returns null for an empty or single-slab list', () => {
    expect(findOverlappingSlabs([])).toBeNull();
    expect(findOverlappingSlabs([{ weightFromKg: 1, weightToKg: 2 }])).toBeNull();
  });
});
