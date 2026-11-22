export const AUTOTILE_NORTH = 1; // 0001
export const AUTOTILE_EAST = 2;  // 0010
export const AUTOTILE_SOUTH = 4; // 0100
export const AUTOTILE_WEST = 8;  // 1000

/**
 * Computes a 4-direction cardinal autotile bitmask (0..15):
 * bit 0 (1): North neighbor matches
 * bit 1 (2): East neighbor matches
 * bit 2 (4): South neighbor matches
 * bit 3 (8): West neighbor matches
 */
export function computeBitmaskFromNeighbors(
  hasNorth: boolean,
  hasEast: boolean,
  hasSouth: boolean,
  hasWest: boolean
): number {
  let mask = 0;
  if (hasNorth) mask |= AUTOTILE_NORTH;
  if (hasEast) mask |= AUTOTILE_EAST;
  if (hasSouth) mask |= AUTOTILE_SOUTH;
  if (hasWest) mask |= AUTOTILE_WEST;
  return mask;
}

/**
 * Evaluates the 4-direction autotile bitmask (0..15) for cell (col, row)
 * against a 2D tile grid using a matching predicate.
 */
export function computeCardinalBitmask<T>(
  grid: readonly (readonly T[])[],
  col: number,
  row: number,
  matches: (cell: T) => boolean,
  outOfBoundsMatches: boolean = true
): number {
  const rows = grid.length;
  const cols = rows > 0 ? (grid[0]?.length ?? 0) : 0;

  const check = (c: number, r: number): boolean => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) {
      return outOfBoundsMatches;
    }
    const rowArr = grid[r];
    if (!rowArr) return outOfBoundsMatches;
    const cell = rowArr[c];
    return cell !== undefined ? matches(cell) : outOfBoundsMatches;
  };

  return computeBitmaskFromNeighbors(
    check(col, row - 1),
    check(col + 1, row),
    check(col, row + 1),
    check(col - 1, row)
  );
}
