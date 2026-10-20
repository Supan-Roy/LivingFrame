/**
 * Room Awareness & Intelligence Interfaces
 * Extension points for LivingFrame's room sensing and connectivity layer
 */

export type SensorStatus = 'disconnected' | 'connecting' | 'active' | 'standby';

export type ViewerPresence = {
  viewerId: string;
  name?: string;
  isEngaged: boolean;
  joinedAtTimestamp: number;
};

export type RoomGestureType =
  | 'wave'
  | 'hand_raised'
  | 'open_palm'
  | 'closed_fist'
  | 'thumbs_up'
  | 'point_to_screen'
  | 'victory'
  | 'swipe_left'
  | 'swipe_right'
  | 'swipe_up'
  | 'swipe_down'
  | 'none';

export interface RoomEvent {
  id: string;
  type:
    | 'viewer_entered'
    | 'viewer_left'
    | 'person_entered'
    | 'person_left'
    | 'room_state'
    | 'gesture_detected'
    | 'recap_requested'
    | 'connectivity_test'
    | 'play_video'
    | 'vision_status';
  timestamp: number;
  payload: {
    viewerCount?: number;
    gesture?: RoomGestureType;
    message?: string;
    itemId?: string;
    personCount?: number;
    previousCount?: number;
    delta?: number;
    source?: string;
  };
}

export interface RoomState {
  sensorStatus: SensorStatus;
  sensorDeviceName: string;
  viewersPresent: number;
  lastEvent?: RoomEvent;
  isRecapAvailable: boolean;
  ambientMode: 'standard' | 'focused' | 'party' | 'night';
  connectedUrl?: string | null;
  lastTestMessage?: string | null;
  lastTestTimestamp?: number | null;
  activeGesture?: RoomGestureType | null;
  gestureTimestamp?: number | null;
  visionEnabled: boolean;
  /** Viewer preference: consume hand gestures for control. */
  gesturesEnabled: boolean;
  /** Viewer preference: when on, room changes can trigger family-safe playback. */
  familyModeEnabled: boolean;
}
