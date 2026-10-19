import 'react-native';
import {render, act} from '@testing-library/react-native';
import * as React from 'react';
import {useRef} from 'react';
import {RoomProvider, useRoom} from '../src/context/RoomContext';
import {useGestureNavigation} from '../src/navigation/useGestureNavigation';
import type {NavGrid, NavPosition} from '../src/navigation/focusGrid';

type FakeNode = {requestTVFocus: jest.Mock};

let triggerGesture: ((event: any) => void) | null = null;

const RoomControl = () => {
  triggerGesture = useRoom().triggerMockEvent;
  return null;
};

interface HarnessProps {
  grid: NavGrid;
  nodes: Map<string, FakeNode>;
  cursor: {current: NavPosition};
  enabled: boolean;
}

const Harness = ({grid, nodes, cursor, enabled}: HarnessProps) => {
  const refs = useRef(nodes) as any;
  useGestureNavigation({grid, cursor: cursor as any, refs, enabled});
  return null;
};

const makeGrid = (): NavGrid => [
  [{id: 'toggle', onActivate: jest.fn()}],
  [
    {id: 'hero0', onActivate: jest.fn()},
    {id: 'hero1', onActivate: jest.fn()},
  ],
  [
    {id: 'c00', onActivate: jest.fn()},
    {id: 'c01', onActivate: jest.fn()},
  ],
];

const setup = (enabled = true) => {
  const grid = makeGrid();
  const nodes = new Map<string, FakeNode>();
  grid.forEach(row =>
    row.forEach(cell => nodes.set(cell.id, {requestTVFocus: jest.fn()})),
  );
  const cursor = {current: {row: 2, col: 0}};
  render(
    <RoomProvider>
      <Harness grid={grid} nodes={nodes} cursor={cursor} enabled={enabled} />
      <RoomControl />
    </RoomProvider>,
  );
  return {grid, nodes, cursor};
};

const fire = (gesture: string) => {
  act(() => {
    triggerGesture!({type: 'gesture_detected', payload: {gesture}});
  });
};

describe('useGestureNavigation', () => {
  it('requests focus on the next cell for a directional swipe', () => {
    const {nodes, cursor} = setup();

    fire('swipe_right');

    expect(nodes.get('c01')!.requestTVFocus).toHaveBeenCalledTimes(1);
    expect(nodes.get('c00')!.requestTVFocus).not.toHaveBeenCalled();
    expect(cursor.current).toEqual({row: 2, col: 1});
  });

  it('moves between rows on a vertical swipe', () => {
    const {nodes, cursor} = setup();

    fire('swipe_up');

    expect(nodes.get('hero0')!.requestTVFocus).toHaveBeenCalledTimes(1);
    expect(cursor.current).toEqual({row: 1, col: 0});
  });

  it('does nothing at a grid edge', () => {
    const {nodes, cursor} = setup();
    cursor.current = {row: 0, col: 0};

    fire('swipe_up');

    nodes.forEach(node => expect(node.requestTVFocus).not.toHaveBeenCalled());
    expect(cursor.current).toEqual({row: 0, col: 0});
  });

  it('activates the focused cell on a hand raise', () => {
    const {grid} = setup();
    // cursor is {row: 2, col: 0} -> the c00 cell
    fire('hand_raised');

    expect(grid[2][0].onActivate).toHaveBeenCalledTimes(1);
    expect(grid[1][0].onActivate).not.toHaveBeenCalled();
  });

  it('ignores gestures while disabled', () => {
    const {nodes, grid, cursor} = setup(false);

    fire('swipe_right');
    fire('hand_raised');

    nodes.forEach(node => expect(node.requestTVFocus).not.toHaveBeenCalled());
    grid.forEach(row => row.forEach(cell => expect(cell.onActivate).not.toHaveBeenCalled()));
    expect(cursor.current).toEqual({row: 2, col: 0});
  });
});
