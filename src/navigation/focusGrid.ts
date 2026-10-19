import type {RoomGestureType} from '../types/room';

export type NavDirection = 'left' | 'right' | 'up' | 'down';

/** Cell id for the universal (header) gesture on/off control. */
export const HEADER_TOGGLE_ID = 'header-gesture-toggle';
export const HERO_BUTTON_IDS = [
  'hero-btn-explore',
  'hero-btn-more-info',
  'hero-btn-room-recap',
] as const;
/**
 * Grid layout: row 0 = hero actions, rows 1.. = content rows.
 *
 * NOTE: the header gesture switch is deliberately NOT a grid cell — a gesture must
 * never be able to activate the control that turns gestures (and the camera) off.
 */
export const HERO_ROW_INDEX = 0;

export interface NavCell {
  id: string;
  onActivate: () => void;
}

export type NavGrid = NavCell[][];

export interface NavPosition {
  row: number;
  col: number;
}

/**
 * Maps the directional gestures onto focus moves. `hand_raised` is deliberately
 * absent — it is the "activate" gesture, handled separately.
 */
export const GESTURE_DIRECTIONS: Partial<Record<RoomGestureType, NavDirection>> = {
  swipe_left: 'left',
  swipe_right: 'right',
  swipe_up: 'up',
  swipe_down: 'down',
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Resolves the focus position after a directional move, or null when the move is a
 * no-op (already at the edge / single-item row).
 */
export const moveFocus = (
  position: NavPosition,
  direction: NavDirection,
  grid: NavGrid,
): NavPosition | null => {
  if (grid.length === 0) {
    return null;
  }

  const row = clamp(position.row, 0, grid.length - 1);
  const currentRow = grid[row];
  const col = clamp(position.col, 0, Math.max(0, currentRow.length - 1));

  if (direction === 'left' || direction === 'right') {
    const nextCol = clamp(
      col + (direction === 'right' ? 1 : -1),
      0,
      Math.max(0, currentRow.length - 1),
    );
    return nextCol === col ? null : {row, col: nextCol};
  }

  const nextRow = clamp(row + (direction === 'down' ? 1 : -1), 0, grid.length - 1);
  if (nextRow === row) {
    return null;
  }
  const nextCol = clamp(col, 0, Math.max(0, grid[nextRow].length - 1));
  return {row: nextRow, col: nextCol};
};

export const cellAt = (grid: NavGrid, position: NavPosition): NavCell | null => {
  const row = grid[position.row];
  if (!row) {
    return null;
  }
  return row[position.col] ?? null;
};

export const activatePosition = (grid: NavGrid, position: NavPosition): void => {
  const cell = cellAt(grid, position);
  if (cell) {
    cell.onActivate();
  }
};

export const isPositionInGrid = (grid: NavGrid, position: NavPosition): boolean =>
  cellAt(grid, position) !== null;
