export interface WeightSlabRange {
  weightFromKg: number;
  weightToKg: number;
}

// Closed-closed intervals [from, to]. Sorted by weightFromKg, an adjacent pair overlaps iff
// next.from <= current.to. Gaps between slabs are legal — only overlap is forbidden; a weight
// falling in a gap simply produces no option for that provider (Section: Weight pricing).
export function findOverlappingSlabs<T extends WeightSlabRange>(
  slabs: T[],
): [T, T] | null {
  const sorted = [...slabs].sort((a, b) => a.weightFromKg - b.weightFromKg);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1].weightFromKg <= sorted[i].weightToKg) {
      return [sorted[i], sorted[i + 1]];
    }
  }
  return null;
}
