import {useEffect, useRef} from 'react';
import type {MutableRefObject} from 'react';
import type {View} from 'react-native';
import {useRoom} from '../context/RoomContext';
import {
  activatePosition,
  cellAt,
  GESTURE_DIRECTIONS,
  moveFocus,
} from './focusGrid';
import type {NavGrid, NavPosition} from './focusGrid';
import {requestFocus} from './NavFocusContext';

export interface UseGestureNavigationArgs {
  grid: NavGrid;
  cursor: MutableRefObject<NavPosition>;
  refs: MutableRefObject<Map<string, View>>;
  enabled: boolean;
}

/**
 * Translates room-sensor gestures into TV focus movement on the browse screen:
 * directional swipes move the focus cursor, a hand raise activates the focused cell.
 *
 * Each gesture event is handled exactly once (deduped by event id) and native focus
 * does the rest — `requestTVFocus()` triggers the normal `onFocus` handlers, so row
 * auto-scroll and the featured-title update keep working unchanged.
 */
export const useGestureNavigation = ({
  grid,
  cursor,
  refs,
  enabled,
}: UseGestureNavigationArgs): void => {
  const {roomState} = useRoom();
  const lastEventIdRef = useRef<string | null>(roomState.lastEvent?.id ?? null);

  useEffect(() => {
    const event = roomState.lastEvent;
    if (!event || event.type !== 'gesture_detected') {
      return;
    }
    if (event.id === lastEventIdRef.current) {
      return;
    }
    // Consume the event whether or not we act, so a gesture that arrives while the
    // browse screen is inactive never fires later.
    lastEventIdRef.current = event.id;

    if (!enabled) {
      return;
    }

    const gesture = event.payload?.gesture;
    const direction = gesture ? GESTURE_DIRECTIONS[gesture] : undefined;

    if (direction) {
      const target = moveFocus(cursor.current, direction, grid);
      if (!target) {
        return;
      }
      const cell = cellAt(grid, target);
      if (!cell) {
        return;
      }
      requestFocus(refs.current.get(cell.id));
      cursor.current = target;
      return;
    }

    if (gesture === 'hand_raised') {
      activatePosition(grid, cursor.current);
    }
  }, [roomState.lastEvent, enabled, grid, cursor, refs]);
};
