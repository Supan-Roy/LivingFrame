import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {RoomState, RoomEvent, RoomGestureType} from '../types/room';
import {
  SENSOR_SERVER_CANDIDATES,
  WS_RECONNECT_INTERVAL_MS,
} from '../config/network';

interface RoomContextValue {
  roomState: RoomState;
  triggerMockEvent: (event: Partial<RoomEvent>) => void;
  toggleSensorStatus: () => void;
  reconnectServer: () => void;
  dismissGesture: () => void;
}

const defaultRoomState: RoomState = {
  sensorStatus: 'connecting',
  sensorDeviceName: 'Laptop Sensor Hub',
  viewersPresent: 2,
  isRecapAvailable: true,
  ambientMode: 'standard',
  connectedUrl: null,
  lastTestMessage: null,
  lastTestTimestamp: null,
  activeGesture: null,
  gestureTimestamp: null,
};

const RoomContext = createContext<RoomContextValue>({
  roomState: defaultRoomState,
  triggerMockEvent: () => {},
  toggleSensorStatus: () => {},
  reconnectServer: () => {},
  dismissGesture: () => {},
});

export const RoomProvider = ({children}: {children: ReactNode}) => {
  const [roomState, setRoomState] = useState<RoomState>(defaultRoomState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candidateIndexRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const connectToCandidate = useCallback((index: number) => {
    if (!isMountedRef.current) {
      return;
    }
    if (typeof WebSocket === 'undefined') {
      console.log('[LivingFrame WS] WebSocket is not defined in this environment');
      return;
    }

    const url = SENSOR_SERVER_CANDIDATES[index % SENSOR_SERVER_CANDIDATES.length];
    console.log(`[LivingFrame WS] Attempting connection to sensor server: ${url}`);

    setRoomState((prev) => ({
      ...prev,
      sensorStatus: 'connecting',
    }));

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[LivingFrame WS] Connection established with: ${url}`);
        candidateIndexRef.current = index; // Lock to successful candidate
        setRoomState((prev) => ({
          ...prev,
          sensorStatus: 'active',
          connectedUrl: url,
          sensorDeviceName: `Laptop (${url})`,
        }));

        // Send a quick handshake acknowledgment back to the laptop
        try {
          ws.send(
            JSON.stringify({
              type: 'app_connected',
              client: 'LivingFrame Vega App',
              timestamp: Date.now(),
            }),
          );
        } catch (_sendErr) {
          // Ignore transient handshake send errors
        }
      };

      ws.onmessage = (event) => {
        console.log(`[LivingFrame WS] Message received from ${url}:`, event.data);
        try {
          const parsed = JSON.parse(event.data);
          const receivedTimestamp = parsed.timestamp || Date.now();

          if (
            parsed.type === 'gesture_detected' ||
            parsed.type === 'hand_raised' ||
            parsed.gesture === 'hand_raised' ||
            parsed.payload?.gesture === 'hand_raised'
          ) {
            const gestureType: RoomGestureType =
              parsed.gesture || parsed.payload?.gesture || 'hand_raised';
            const message = parsed.message || 'Hand Raised Detected';

            console.log(
              `[LivingFrame WS] GESTURE DETECTED: "${gestureType}" - ${message} (Sent at: ${new Date(
                receivedTimestamp,
              ).toLocaleTimeString()})`,
            );

            // Clear any active gesture timer before setting new one
            if (gestureTimerRef.current) {
              clearTimeout(gestureTimerRef.current);
            }

            setRoomState((prev) => ({
              ...prev,
              sensorStatus: 'active',
              activeGesture: gestureType,
              gestureTimestamp: receivedTimestamp,
              lastTestMessage: `✋ ${message}`,
              lastTestTimestamp: receivedTimestamp,
              lastEvent: {
                id: `evt-${Date.now()}`,
                type: 'gesture_detected',
                timestamp: receivedTimestamp,
                payload: {
                  gesture: gestureType,
                  message: message,
                  viewerCount: prev.viewersPresent,
                },
              },
            }));

            // Auto-dismiss gesture reaction notification after 5 seconds
            gestureTimerRef.current = setTimeout(() => {
              if (isMountedRef.current) {
                setRoomState((prev) => ({
                  ...prev,
                  activeGesture: null,
                }));
              }
            }, 5000);
          } else if (parsed.type === 'connectivity_test') {
            console.log(
              `[LivingFrame WS] CONNECTIVITY TEST SUCCESS: "${parsed.message}" (Sent at: ${new Date(
                receivedTimestamp,
              ).toLocaleTimeString()})`,
            );

            setRoomState((prev) => ({
              ...prev,
              sensorStatus: 'active',
              lastTestMessage: parsed.message || 'Connected to Laptop',
              lastTestTimestamp: receivedTimestamp,
              lastEvent: {
                id: `evt-${Date.now()}`,
                type: 'connectivity_test',
                timestamp: receivedTimestamp,
                payload: {
                  message: parsed.message,
                  viewerCount: prev.viewersPresent,
                },
              },
            }));
          } else if (parsed.type === 'viewer_entered' || parsed.type === 'viewer_left') {
            const count = parsed.payload?.viewerCount ?? parsed.count;
            setRoomState((prev) => ({
              ...prev,
              viewersPresent: typeof count === 'number' ? count : prev.viewersPresent,
              lastEvent: {
                id: `evt-${Date.now()}`,
                type: parsed.type,
                timestamp: parsed.timestamp || Date.now(),
                payload: parsed.payload || {},
              },
            }));
          }
        } catch (err) {
          console.warn('[LivingFrame WS] Failed to parse message JSON:', err);
        }
      };

      ws.onerror = (err: Event | {message?: string}) => {
        console.warn(`[LivingFrame WS] Connection error on ${url}:`, (err as {message?: string})?.message || 'Host unreachable');
      };

      ws.onclose = (event) => {
        console.log(`[LivingFrame WS] Connection closed for ${url}. Code: ${event.code}`);
        if (!isMountedRef.current) {
          return;
        }
        setRoomState((prev) => ({
          ...prev,
          sensorStatus: 'disconnected',
          connectedUrl: null,
        }));

        // Try the next candidate or schedule reconnect
        const nextIndex = (index + 1) % SENSOR_SERVER_CANDIDATES.length;
        reconnectTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connectToCandidate(nextIndex);
          }
        }, WS_RECONNECT_INTERVAL_MS);
      };
    } catch (err) {
      console.warn(`[LivingFrame WS] Exception initiating WebSocket to ${url}:`, err);
      if (isMountedRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connectToCandidate((index + 1) % SENSOR_SERVER_CANDIDATES.length);
          }
        }, WS_RECONNECT_INTERVAL_MS);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    connectToCandidate(0);

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (gestureTimerRef.current) {
        clearTimeout(gestureTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectToCandidate]);

  const reconnectServer = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connectToCandidate(candidateIndexRef.current);
  };

  const dismissGesture = useCallback(() => {
    if (gestureTimerRef.current) {
      clearTimeout(gestureTimerRef.current);
    }
    setRoomState((prev) => ({
      ...prev,
      activeGesture: null,
    }));
  }, []);

  const triggerMockEvent = (event: Partial<RoomEvent>) => {
    const fullEvent: RoomEvent = {
      id: `evt-${Date.now()}`,
      type: event.type || 'recap_requested',
      timestamp: Date.now(),
      payload: event.payload || {},
    };
    setRoomState((prev) => ({
      ...prev,
      lastEvent: fullEvent,
      isRecapAvailable: true,
    }));
  };

  const toggleSensorStatus = () => {
    setRoomState((prev) => ({
      ...prev,
      sensorStatus: prev.sensorStatus === 'active' ? 'standby' : 'active',
    }));
  };

  return (
    <RoomContext.Provider
      value={{roomState, triggerMockEvent, toggleSensorStatus, reconnectServer, dismissGesture}}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => useContext(RoomContext);
