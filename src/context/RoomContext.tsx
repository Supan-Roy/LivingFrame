import React, {createContext, useContext, useState, ReactNode} from 'react';
import {RoomState, RoomEvent} from '../types/room';

interface RoomContextValue {
  roomState: RoomState;
  triggerMockEvent: (event: Partial<RoomEvent>) => void;
  toggleSensorStatus: () => void;
}

const defaultRoomState: RoomState = {
  sensorStatus: 'active',
  sensorDeviceName: 'Pixel 9 Pro Room Sensor',
  viewersPresent: 2,
  isRecapAvailable: true,
  ambientMode: 'standard',
};

const RoomContext = createContext<RoomContextValue>({
  roomState: defaultRoomState,
  triggerMockEvent: () => {},
  toggleSensorStatus: () => {},
});

export const RoomProvider = ({children}: {children: ReactNode}) => {
  const [roomState, setRoomState] = useState<RoomState>(defaultRoomState);

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
    <RoomContext.Provider value={{roomState, triggerMockEvent, toggleSensorStatus}}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => useContext(RoomContext);
