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
  sendVisionCommand: (enabled: boolean) => void;
  setGesturesEnabled: (enabled: boolean) => void;
  setFamilyMode: (enabled: boolean) => void;
}

const defaultRoomState: RoomState = {
  sensorStatus: 'connecting',
  sensorDeviceName: 'Laptop Sensor Hub',
  viewersPresent: 0,
  isRecapAvailable: true,
  ambientMode: 'standard',
  connectedUrl: null,
  lastTestMessage: null,
  lastTestTimestamp: null,
  activeGesture: null,
  gestureTimestamp: null,
  visionEnabled: false,
  gesturesEnabled: false,
  familyModeEnabled: false,
  childPresent: false,
  attentiveCount: 0,
  distractedCount: 0,
  isDistracted: false,
};

const RoomContext = createContext<RoomContextValue>({
  roomState: defaultRoomState,
  triggerMockEvent: () => {},
  toggleSensorStatus: () => {},
  reconnectServer: () => {},
  dismissGesture: () => {},
  sendVisionCommand: () => {},
  setGesturesEnabled: () => {},
  setFamilyMode: () => {},
});

export const RoomProvider = ({children}: {children: ReactNode}) => {
  const [roomState, setRoomState] = useState<RoomState>(defaultRoomState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candidateIndexRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const eventSeqRef = useRef<number>(0);
  // Gesture events are ignored unless the viewer has gesture control on; a ref keeps
  // the long-lived WebSocket handler reading the current value.
  const gesturesEnabledRef = useRef<boolean>(false);
  // Only drive the sensor after the viewer uses a switch (see the effect below).
  const userVisionPrefRef = useRef<boolean>(false);
  const desiredVisionRef = useRef<{desired: boolean; url: string | null} | null>(
    null,
  );

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
            // Gesture control is an explicit opt-in. Presence detection (person events)
            // keeps working even when gesture control is off.
            if (!gesturesEnabledRef.current) {
              return;
            }

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
              lastTestMessage: message,
              lastTestTimestamp: receivedTimestamp,
              lastEvent: {
                id: `evt-${Date.now()}-${++eventSeqRef.current}`,
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
                id: `evt-${Date.now()}-${++eventSeqRef.current}`,
                type: 'connectivity_test',
                timestamp: receivedTimestamp,
                payload: {
                  message: parsed.message,
                  viewerCount: prev.viewersPresent,
                },
              },
            }));
          } else if (
            parsed.type === 'play_video' ||
            parsed.action === 'play' ||
            parsed.type === 'play'
          ) {
            const targetItemId =
              parsed.itemId || parsed.id || 'behind-the-screams';
            console.log(
              `[LivingFrame WS] PLAY VIDEO COMMAND: target "${targetItemId}"`,
            );
            setRoomState((prev) => ({
              ...prev,
              lastEvent: {
                id: `evt-${Date.now()}-${++eventSeqRef.current}`,
                type: 'play_video',
                timestamp: receivedTimestamp,
                payload: {
                  itemId: targetItemId,
                },
              },
            }));
          } else if (parsed.type === 'viewer_entered' || parsed.type === 'viewer_left') {
            const count = parsed.payload?.viewerCount ?? parsed.count;
            setRoomState((prev) => ({
              ...prev,
              viewersPresent: typeof count === 'number' ? count : prev.viewersPresent,
              lastEvent: {
                id: `evt-${Date.now()}-${++eventSeqRef.current}`,
                type: parsed.type,
                timestamp: parsed.timestamp || Date.now(),
                payload: parsed.payload || {},
              },
            }));
          } else if (parsed.type === 'person_entered' || parsed.type === 'person_left') {
            const count =
              parsed.payload?.personCount ?? parsed.payload?.count ?? parsed.count;
            setRoomState((prev) => {
              const childDetected =
                typeof parsed.payload?.childPresent === 'boolean'
                  ? parsed.payload.childPresent
                  : typeof parsed.childPresent === 'boolean'
                  ? parsed.childPresent
                  : typeof parsed.payload?.childCount === 'number'
                  ? parsed.payload.childCount > 0
                  : typeof parsed.payload?.child === 'number'
                  ? parsed.payload.child > 0
                  : prev.childPresent;
              console.log(
                `[LivingFrame WS] ROOM EVENT: ${parsed.type} (${count} in view, source=${
                  parsed.source || 'webcam'
                }${childDetected ? ', child detected' : ''})`,
              );
              return {
                ...prev,
                viewersPresent: typeof count === 'number' ? count : prev.viewersPresent,
                childPresent: childDetected,
                lastEvent: {
                  id: `evt-${Date.now()}-${++eventSeqRef.current}`,
                  type: parsed.type,
                  timestamp: parsed.timestamp || Date.now(),
                  payload: {
                    ...(parsed.payload || {}),
                    personCount: typeof count === 'number' ? count : undefined,
                    source: parsed.source || 'webcam',
                    childPresent: childDetected,
                  },
                },
              };
            });
          } else if (parsed.type === 'attention_state') {
            const attentive = parsed.payload?.attentiveCount ?? parsed.attentiveCount ?? 0;
            const distracted = parsed.payload?.distractedCount ?? parsed.distractedCount ?? 0;
            const total = attentive + distracted;
            const isDistracted =
              typeof parsed.payload?.isDistracted === 'boolean'
                ? parsed.payload.isDistracted
                : typeof parsed.isDistracted === 'boolean'
                ? parsed.isDistracted
                : (total > 0 && (distracted / total) > 0.70);
            const inattentiveRatio = total > 0 ? (distracted / total) : 0;
            console.log(
              `[LivingFrame WS] ATTENTION STATE: ${attentive} attentive, ${distracted} distracted (isDistracted=${isDistracted})`,
            );
            setRoomState((prev) => ({
              ...prev,
              attentiveCount: attentive,
              distractedCount: distracted,
              isDistracted,
              viewersPresent: total > 0 ? total : prev.viewersPresent,
              lastEvent: {
                id: `evt-${Date.now()}-${++eventSeqRef.current}`,
                type: 'attention_state',
                timestamp: receivedTimestamp,
                payload: {
                  attentiveCount: attentive,
                  distractedCount: distracted,
                  isDistracted,
                  inattentiveRatio,
                  viewerCount: total > 0 ? total : prev.viewersPresent,
                },
              },
            }));
          } else if (parsed.type === 'room_state') {
            // Current head-count only — deliberately does not set lastEvent, so it can
            // never be mistaken for an entry/leave and trigger the Family Mode policy.
            const count = parsed.payload?.personCount ?? parsed.payload?.count;
            setRoomState((prev) => {
              const childDetected =
                typeof parsed.payload?.childPresent === 'boolean'
                  ? parsed.payload.childPresent
                  : typeof parsed.childPresent === 'boolean'
                  ? parsed.childPresent
                  : typeof parsed.payload?.childCount === 'number'
                  ? parsed.payload.childCount > 0
                  : typeof parsed.payload?.child === 'number'
                  ? parsed.payload.child > 0
                  : prev.childPresent;
              const attentive = parsed.payload?.attentiveCount ?? parsed.attentiveCount;
              const distracted = parsed.payload?.distractedCount ?? parsed.distractedCount;
              const isDistracted = parsed.payload?.isDistracted ?? parsed.isDistracted;
              return {
                ...prev,
                viewersPresent: typeof count === 'number' ? count : prev.viewersPresent,
                childPresent: childDetected,
                attentiveCount: typeof attentive === 'number' ? attentive : prev.attentiveCount,
                distractedCount: typeof distracted === 'number' ? distracted : prev.distractedCount,
                isDistracted: typeof isDistracted === 'boolean' ? isDistracted : prev.isDistracted,
              };
            });
          } else if (parsed.type === 'vision_status') {
            console.log(`[LivingFrame WS] VISION STATUS: enabled=${!!parsed.enabled}`);
            setRoomState((prev) => ({
              ...prev,
              visionEnabled: !!parsed.enabled,
            }));
          } else if (parsed.type === 'set_family_mode' || parsed.type === 'family_mode') {
            const enabled =
              typeof parsed.enabled === 'boolean'
                ? parsed.enabled
                : typeof parsed.payload?.enabled === 'boolean'
                ? parsed.payload.enabled
                : true;
            console.log(`[LivingFrame WS] FAMILY MODE COMMAND: enabled=${enabled}`);
            userVisionPrefRef.current = true;
            setRoomState((prev) => ({
              ...prev,
              familyModeEnabled: enabled,
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

  const sendVisionCommand = useCallback((enabled: boolean) => {
    const ws = wsRef.current;
    const openState = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1;
    if (ws && ws.readyState === openState) {
      try {
        ws.send(JSON.stringify({type: 'vision_control', enabled}));
        console.log(`[LivingFrame WS] Sent vision_control enabled=${enabled}`);
      } catch (err) {
        console.warn('[LivingFrame WS] Failed to send vision_control:', err);
      }
    } else {
      console.warn('[LivingFrame WS] Cannot send vision_control: socket not open');
    }
  }, []);

  const setGesturesEnabled = useCallback((enabled: boolean) => {
    console.log(`[LivingFrame] Gesture control ${enabled ? 'enabled' : 'disabled'}`);
    userVisionPrefRef.current = true;
    setRoomState((prev) => ({
      ...prev,
      gesturesEnabled: enabled,
    }));
  }, []);

  const setFamilyMode = useCallback((enabled: boolean) => {
    console.log(`[LivingFrame] Family Mode ${enabled ? 'enabled' : 'disabled'}`);
    userVisionPrefRef.current = true;
    setRoomState((prev) => ({
      ...prev,
      familyModeEnabled: enabled,
    }));
  }, []);

  // Keep the WebSocket handler's view of the gesture preference current.
  useEffect(() => {
    gesturesEnabledRef.current = roomState.gesturesEnabled;
  }, [roomState.gesturesEnabled]);

  // One camera, two independent capabilities:
  //   the sensor runs iff gesture control OR Family Mode needs it.
  // Each switch only gates its own behaviour; neither owns the camera alone.
  // We only drive the sensor once the viewer has actually used a switch, so the app
  // never clobbers a sensor started elsewhere (e.g. from the CLI).
  useEffect(() => {
    if (!userVisionPrefRef.current) {
      return;
    }
    const desired = roomState.gesturesEnabled || roomState.familyModeEnabled;
    const url = roomState.connectedUrl ?? null;
    const last = desiredVisionRef.current;
    if (last && last.desired === desired && last.url === url) {
      return;
    }
    desiredVisionRef.current = {desired, url};
    sendVisionCommand(desired);
  }, [
    roomState.gesturesEnabled,
    roomState.familyModeEnabled,
    roomState.connectedUrl,
    sendVisionCommand,
  ]);

  const triggerMockEvent = (event: Partial<RoomEvent>) => {
    const count =
      event.payload?.personCount ??
      event.payload?.viewerCount ??
      (event.payload as any)?.person_count ??
      (event.payload as any)?.viewer_count ??
      (typeof (event.payload as any)?.count === 'number'
        ? (event.payload as any).count
        : undefined);
    const fullEvent: RoomEvent = {
      id: `evt-${Date.now()}-${++eventSeqRef.current}`,
      type: event.type || 'recap_requested',
      timestamp: Date.now(),
      payload: event.payload || {},
    };
    setRoomState((prev) => ({
      ...prev,
      lastEvent: fullEvent,
      isRecapAvailable: true,
      viewersPresent: typeof count === 'number' ? count : prev.viewersPresent,
      childPresent:
        typeof event.payload?.childPresent === 'boolean'
          ? event.payload.childPresent
          : prev.childPresent,
      attentiveCount:
        typeof event.payload?.attentiveCount === 'number'
          ? event.payload.attentiveCount
          : prev.attentiveCount,
      distractedCount:
        typeof event.payload?.distractedCount === 'number'
          ? event.payload.distractedCount
          : prev.distractedCount,
      isDistracted:
        typeof event.payload?.isDistracted === 'boolean'
          ? event.payload.isDistracted
          : prev.isDistracted,
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
      value={{
        roomState,
        triggerMockEvent,
        toggleSensorStatus,
        reconnectServer,
        dismissGesture,
        sendVisionCommand,
        setGesturesEnabled,
        setFamilyMode,
      }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => useContext(RoomContext);
