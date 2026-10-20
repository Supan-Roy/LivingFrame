/* eslint-disable no-undef */
import 'react-native';
import {render, act, fireEvent} from '@testing-library/react-native';
import * as React from 'react';
import {RoomProvider, useRoom} from '../src/context/RoomContext';
import {VideoPlayerView} from '../src/components/VideoPlayerView';
import {Header} from '../src/components/Header';
import {fallbackMediaItems} from '../src/data/catalogData';

jest.mock('@amazon-devices/react-native-w3cmedia', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');

  class MockVideoPlayer {
    initialize = jest.fn().mockResolvedValue(undefined);
    deinitialize = jest.fn().mockResolvedValue(undefined);
    deinitializeSync = jest.fn().mockReturnValue('success');
    setSurfaceHandle = jest.fn();
    clearSurfaceHandle = jest.fn();
    play = jest.fn().mockResolvedValue(undefined);
    pause = jest.fn();
    load = jest.fn();
    addEventListener = jest.fn();
    removeEventListener = jest.fn();
    currentTime = 0;
    duration = 10;
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

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: {data: string}) => void) | null = null;
  onclose: ((event: {code: number}) => void) | null = null;
  onerror: ((event: {message?: string}) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({code: 1000});
    }
  }
}

let room: ReturnType<typeof useRoom> | null = null;

const RoomControl = () => {
  room = useRoom();
  return null;
};

// Behind The Screams is tagged adult_content for its whole 10s clip.
const item = fallbackMediaItems.find(candidate => candidate.id === 'behind-the-screams')!;

describe('Family Mode policy', () => {
  const realWebSocket = (globalThis as any).WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    room = null;
    (globalThis as any).WebSocket = MockWebSocket;
    jest.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as any).WebSocket = realWebSocket;
    jest.useRealTimers();
  });

  const setup = async () => {
    const screen = render(
      <RoomProvider>
        <VideoPlayerView
          item={item}
          visible={true}
          onClose={jest.fn()}
          onRoomRecap={jest.fn()}
        />
        <RoomControl />
      </RoomProvider>,
    );
    await act(async () => {});
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.readyState = MockWebSocket.OPEN;
      if (ws.onopen) {
        ws.onopen();
      }
    });
    return {screen, ws};
  };

  const serverEvent = (ws: MockWebSocket, payload: any) =>
    act(() => {
      ws.onmessage?.({data: JSON.stringify(payload)});
    });

  it('blocks when Family Mode is enabled while a child is already present', async () => {
    const {screen, ws} = await setup();

    // A child is already in the room before Family Mode is switched on
    serverEvent(ws, {
      type: 'person_entered',
      source: 'webcam',
      payload: {
        personCount: 2,
        previousCount: 1,
        delta: 1,
        childCount: 1,
        childPresent: true,
      },
      timestamp: Date.now(),
    });

    expect(screen.queryByTestId('family-protection-overlay')).toBeNull();

    act(() => room!.setFamilyMode(true));

    expect(screen.getByTestId('family-protection-overlay')).toBeTruthy();
  });

  it('does not block playback when Family Mode is off', async () => {
    const {screen, ws} = await setup();

    serverEvent(ws, {
      type: 'person_entered',
      source: 'webcam',
      payload: {
        personCount: 2,
        previousCount: 1,
        delta: 1,
        childCount: 1,
        childPresent: true,
      },
      timestamp: Date.now(),
    });

    expect(screen.queryByTestId('family-protection-overlay')).toBeNull();
  });

  it('does not block for an adult-only entry', async () => {
    const {screen, ws} = await setup();

    act(() => room!.setFamilyMode(true));
    serverEvent(ws, {
      type: 'person_entered',
      source: 'webcam',
      payload: {
        personCount: 2,
        previousCount: 1,
        delta: 1,
        childCount: 0,
        childPresent: false,
      },
      timestamp: Date.now(),
    });

    expect(screen.queryByTestId('family-protection-overlay')).toBeNull();
  });

  it('blocks when a child enters while Family Mode is on, and unblocks when they leave', async () => {
    const {screen, ws} = await setup();

    act(() => room!.setFamilyMode(true));
    serverEvent(ws, {
      type: 'person_entered',
      source: 'webcam',
      payload: {
        personCount: 2,
        previousCount: 1,
        delta: 1,
        childCount: 1,
        childPresent: true,
      },
      timestamp: Date.now(),
    });
    expect(screen.getByTestId('family-protection-overlay')).toBeTruthy();

    serverEvent(ws, {
      type: 'person_left',
      source: 'webcam',
      payload: {
        personCount: 1,
        previousCount: 2,
        delta: -1,
        childCount: 0,
        childPresent: false,
      },
      timestamp: Date.now(),
    });
    expect(screen.queryByTestId('family-protection-overlay')).toBeNull();
  });

  it('a room_state carrying child presence blocks the tagged content', async () => {
    const {screen, ws} = await setup();

    act(() => room!.setFamilyMode(true));
    serverEvent(ws, {
      type: 'room_state',
      source: 'webcam',
      payload: {personCount: 2, childCount: 1, childPresent: true},
      timestamp: Date.now(),
    });

    expect(screen.getByTestId('family-protection-overlay')).toBeTruthy();
  });

  it('shows the room stats panel when Family Mode is on', async () => {
    const {screen} = await setup();

    act(() => room!.setFamilyMode(true));

    expect(screen.getByTestId('room-stats-panel')).toBeTruthy();
    // The stale engine label is gone
    expect(screen.queryByText('Vega Media Engine')).toBeNull();
  });

  it('dismisses the stats panel and restores it on the next Family Mode enable', async () => {
    const {screen} = await setup();

    act(() => room!.setFamilyMode(true));
    fireEvent.press(screen.getByTestId('btn-room-stats-dismiss'));
    expect(screen.queryByTestId('room-stats-panel')).toBeNull();

    act(() => room!.setFamilyMode(false));
    act(() => room!.setFamilyMode(true));
    expect(screen.getByTestId('room-stats-panel')).toBeTruthy();
  });

  it('shows the live head-count and whether another person is present', async () => {
    const {screen, ws} = await setup();

    act(() => room!.setFamilyMode(true));
    serverEvent(ws, {
      type: 'person_entered',
      source: 'webcam',
      payload: {
        personCount: 2,
        previousCount: 1,
        delta: 1,
        childCount: 1,
        childPresent: true,
      },
      timestamp: Date.now(),
    });

    expect(screen.getByText('People in view')).toBeTruthy();
    expect(screen.getByTestId('room-stats-people').props.children).toBe(2);
    expect(screen.getByTestId('room-stats-another').props.children).toBe('Yes');
    expect(screen.getByTestId('room-stats-child').props.children).toBe('Yes');
  });
});

describe('home-screen Family Mode switch', () => {
  it('is present and controls the shared preference', async () => {
    const screen = render(
      <RoomProvider>
        <Header />
        <RoomControl />
      </RoomProvider>,
    );
    await act(async () => {});

    const toggle = screen.getByTestId('header-family-toggle');
    expect(toggle.props.accessibilityLabel).toBe('Turn on Family Mode');

    fireEvent.press(toggle);

    expect(
      screen.getByTestId('header-family-toggle').props.accessibilityLabel,
    ).toBe('Turn off Family Mode');
    expect(room!.roomState.familyModeEnabled).toBe(true);
  });
});
