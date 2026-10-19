import {
  activatePosition,
  cellAt,
  GESTURE_DIRECTIONS,
  moveFocus,
} from '../src/navigation/focusGrid';
import type {NavCell, NavGrid} from '../src/navigation/focusGrid';

const cell = (id: string): NavCell => ({id, onActivate: jest.fn()});

// row 0 = header switch, row 1 = hero (3), row 2 = content (2), row 3 = content (3)
const grid: NavGrid = [
  [cell('toggle')],
  [cell('hero0'), cell('hero1'), cell('hero2')],
  [cell('c00'), cell('c01')],
  [cell('c10'), cell('c11'), cell('c12')],
];

describe('moveFocus', () => {
  it('moves horizontally within a row', () => {
    expect(moveFocus({row: 1, col: 0}, 'right', grid)).toEqual({row: 1, col: 1});
    expect(moveFocus({row: 1, col: 2}, 'left', grid)).toEqual({row: 1, col: 1});
  });

  it('does not wrap at horizontal edges', () => {
    expect(moveFocus({row: 1, col: 0}, 'left', grid)).toBeNull();
    expect(moveFocus({row: 1, col: 2}, 'right', grid)).toBeNull();
  });

  it('does not wrap at vertical edges', () => {
    expect(moveFocus({row: 0, col: 0}, 'up', grid)).toBeNull();
    expect(moveFocus({row: 3, col: 0}, 'down', grid)).toBeNull();
  });

  it('moves vertically and clamps the column on a shorter row', () => {
    // row 3 col 2 -> up to row 2 which only has 2 items -> clamps to col 1
    expect(moveFocus({row: 3, col: 2}, 'up', grid)).toEqual({row: 2, col: 1});
    expect(moveFocus({row: 2, col: 1}, 'down', grid)).toEqual({row: 3, col: 1});
  });

  it('clamps an out-of-range position before moving', () => {
    expect(moveFocus({row: 99, col: 99}, 'left', grid)).toEqual({row: 3, col: 1});
    expect(moveFocus({row: 0, col: 0}, 'down', grid)).toEqual({row: 1, col: 0});
  });

  it('returns null for an empty grid', () => {
    expect(moveFocus({row: 0, col: 0}, 'right', [])).toBeNull();
  });
});

describe('cellAt / activatePosition', () => {
  it('finds the cell at a position', () => {
    expect(cellAt(grid, {row: 0, col: 0})?.id).toBe('toggle');
    expect(cellAt(grid, {row: 9, col: 9})).toBeNull();
  });

  it('invokes only the activated cell', () => {
    const local: NavGrid = [[cell('a')], [cell('b'), cell('c')]];
    activatePosition(local, {row: 1, col: 1});
    expect(local[1][1].onActivate).toHaveBeenCalledTimes(1);
    expect(local[1][0].onActivate).not.toHaveBeenCalled();
    expect(local[0][0].onActivate).not.toHaveBeenCalled();
  });

  it('is a no-op for an out-of-range position', () => {
    expect(() => activatePosition([], {row: 0, col: 0})).not.toThrow();
  });
});

describe('GESTURE_DIRECTIONS', () => {
  it('maps exactly the four swipe gestures', () => {
    expect(GESTURE_DIRECTIONS).toEqual({
      swipe_left: 'left',
      swipe_right: 'right',
      swipe_up: 'up',
      swipe_down: 'down',
    });
  });
});
