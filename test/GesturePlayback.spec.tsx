import 'react-native';
import {render, act, fireEvent} from '@testing-library/react-native';
import * as React from 'react';
import {RoomProvider, useRoom} from '../src/context/RoomContext';
import {VideoPlayerView} from '../src/components/VideoPlayerView';
import {fallbackMediaItems} from '../src/data/catalogData';
import {RoomEvent} from '../src/types/room';

const mockPlayerRegistry: any[] = [];

jest.mock('@amazon-devices/react-native-w3cmedia', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');

  class MockVideoPlayer {
    _listeners: Record<string, Array<() => void>> = {};
    constructor() {
      mockPlayerRegistry.push(this);
    }
    initialize = jest.fn().mockResolvedValue(undefined);
    deinitialize = jest.fn().mockResolvedValue(undefined);
    deinitializeSync = jest.fn().mockReturnValue('success');
    setSurfaceHandle = jest.fn();
    clearSurfaceHandle = jest.fn();
    play = jest.fn().mockResolvedValue(undefined);
    pause = jest.fn();
    load = jest.fn();
    addEventListener = jest.fn((name: string, cb: () => void) => {
      this._listeners[name] = this._listeners[name] || [];
      this._listeners[name].push(cb);
    });
    removeEventListener = jest.fn();
    emit(name: string) {
      (this._listeners[name] || []).forEach(cb => cb());
    }
    currentTime = 0;
    duration = 30;
    src = '';
    autoplay = false;
    loop = false;
    muted = false;
    defaultMuted = false;
    volume = 1;
  }

  return {
    VideoPlayer: MockVideoPlayer,
    KeplerVideoSurfaceView: (props: any) =>
      ReactModule.createElement(View, {
        ...props,
        testID: props.testID || 'mock-kepler-video-surface-view',
      }),
    Video: ReactModule.forwardRef((props: any, ref: any) => {
      ReactModule.useImperativeHandle(ref, () => ({
        play: jest.fn(),
        pause: jest.fn(),
        currentTime: 0,
        duration: 120,
      }));
      return ReactModule.createElement(View, {
        ...props,
        testID: props.testID || 'mock-native-video-surface',
      });
    }),
  };
});

const item = {...fallbackMediaItems[0], durationSec: 30};

let triggerGesture: ((event: Partial<RoomEvent>) => void) | null = null;

const RoomControl = () => {
  triggerGesture = useRoom().triggerMockEvent;
  return null;
};

const getPlayer = (): any => mockPlayerRegistry.slice(-1)[0];

describe('Gesture playback control', () => {
  beforeEach(() => {
    mockPlayerRegistry.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setup = async (mediaItem: any = item) => {
    const screen = render(
      <RoomProvider>
        <VideoPlayerView
          item={mediaItem}
          visible={true}
          onClose={jest.fn()}
          onRoomRecap={jest.fn()}
        />
        <RoomControl />
      </RoomProvider>,
    );
    await act(async () => {});
    await act(async () => {});
    return screen;
  };

  const fireGesture = (gesture: string) => {
    act(() => {
      if (triggerGesture) {
        triggerGesture({
          type: 'gesture_detected',
          payload: {gesture} as any,
        });
      }
    });
  };

  it('toggles pause and play on repeated hand_raised gestures', async () => {
    const screen = await setup();
    act(() => {
      getPlayer().emit('loadeddata');
    });

    expect(screen.getByTestId('btn-player-toggle').props.accessibilityLabel).toBe(
      'Pause video',
    );

    fireGesture('hand_raised');
    expect(screen.getByTestId('btn-player-toggle').props.accessibilityLabel).toBe(
      'Play video',
    );
    expect(screen.getByTestId('player-center-status')).toBeTruthy();
    expect(screen.getByTestId('player-center-status-text').props.children).toBe(
      'Pause',
    );

    fireGesture('hand_raised');
    expect(screen.getByTestId('btn-player-toggle').props.accessibilityLabel).toBe(
      'Pause video',
    );
    expect(screen.getByTestId('player-center-status-text').props.children).toBe(
      'Play',
    );
  });

  it('seeks forward and back 5s on swipe gestures', async () => {
    const screen = await setup();
    act(() => {
      getPlayer().emit('loadeddata');
    });

    fireGesture('swipe_right');
    expect(screen.getByText('00:05')).toBeTruthy();

    fireGesture('swipe_left');
    expect(screen.getByText('00:00')).toBeTruthy();
  });

  it('seeks by 5s with clamping at 0 and at the clip duration', async () => {
    const shortItem = {...fallbackMediaItems[0], durationSec: 10};
    const screen = await setup(shortItem);
    act(() => {
      getPlayer().emit('loadeddata');
      getPlayer().emit('playing');
    });
    const currentTime = () =>
      screen.getByTestId('player-current-time').props.children;

    // Advance playback to ~6 seconds
    act(() => {
      jest.advanceTimersByTime(6000);
    });
    // Controls auto-hid after 5s; press the backdrop to reveal them again
    act(() => {
      fireEvent.press(screen.getByTestId('btn-screen-toggle-controls'));
    });
    expect(currentTime()).toBe('00:06');

    // 6s - 5s -> 1s (NOT 0)
    fireGesture('swipe_left');
    expect(currentTime()).toBe('00:01');

    // 1s + 5s -> 6s
    fireGesture('swipe_right');
    expect(currentTime()).toBe('00:06');

    // 6s + 5s -> clamped to the 10s clip length
    fireGesture('swipe_right');
    expect(currentTime()).toBe('00:10');

    // Already at the end: forward stays clamped
    fireGesture('swipe_right');
    expect(currentTime()).toBe('00:10');

    // 10s - 5s -> 5s
    fireGesture('swipe_left');
    expect(currentTime()).toBe('00:05');
  });
});
