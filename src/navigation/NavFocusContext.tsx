import React, {createContext, useCallback, useContext, useMemo, useRef} from 'react';
import type {MutableRefObject} from 'react';
import type {View} from 'react-native';
import {NavPosition} from './focusGrid';

export type RegisterRef = (id: string) => (node: View | null) => void;

/** Kepler attaches `requestTVFocus()` to every View instance at runtime. */
export const requestFocus = (node: View | undefined | null): void => {
  (node as {requestTVFocus?: () => void} | undefined | null)?.requestTVFocus?.();
};

export interface NavFocusContextValue {
  registerRef: RegisterRef;
  reportFocus: (position: NavPosition) => void;
}

const NavFocusContext = createContext<NavFocusContextValue | null>(null);

export const useNavFocus = (): NavFocusContextValue | null =>
  useContext(NavFocusContext);

export interface NavRegistry {
  registerRef: RegisterRef;
  reportFocus: (position: NavPosition) => void;
  refs: MutableRefObject<Map<string, View>>;
  cursor: MutableRefObject<NavPosition>;
}

/**
 * Owns the focus registry and the current cursor. The cursor is updated by whichever
 * focusable the native focus engine lands on (D-pad or gesture), so both stay in sync.
 */
export const useNavRegistry = (): NavRegistry => {
  const refs = useRef<Map<string, View>>(new Map());
  const cursor = useRef<NavPosition>({row: 0, col: 0});
  const refCallbacks = useRef<Map<string, (node: View | null) => void>>(new Map());

  const registerRef = useCallback<RegisterRef>((id) => {
    let callback = refCallbacks.current.get(id);
    if (!callback) {
      callback = (node: View | null) => {
        if (node) {
          refs.current.set(id, node);
        } else {
          refs.current.delete(id);
        }
      };
      refCallbacks.current.set(id, callback);
    }
    return callback;
  }, []);

  const reportFocus = useCallback((position: NavPosition) => {
    cursor.current = position;
  }, []);

  return {registerRef, reportFocus, refs, cursor};
};

export interface NavFocusProviderProps {
  registerRef: RegisterRef;
  reportFocus: (position: NavPosition) => void;
  children: React.ReactNode;
}

export const NavFocusProvider = ({
  registerRef,
  reportFocus,
  children,
}: NavFocusProviderProps) => {
  const value = useMemo(
    () => ({registerRef, reportFocus}),
    [registerRef, reportFocus],
  );
  return (
    <NavFocusContext.Provider value={value}>{children}</NavFocusContext.Provider>
  );
};
