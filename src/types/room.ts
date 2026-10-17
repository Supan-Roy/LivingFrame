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
  | 'thumbs_up'
  | 'point_to_screen'
  | 'none';

export interface RoomEvent {
  id: string;
  type:
    | 'viewer_entered'
    | 'viewer_left'
    | 'gesture_detected'
    | 'recap_requested'
    | 'connectivity_test';
  timestamp: number;
  payload: {
    viewerCount?: number;
    gesture?: RoomGestureType;
    message?: string;
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
}
