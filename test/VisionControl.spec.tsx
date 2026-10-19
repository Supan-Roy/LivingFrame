/* eslint-disable no-undef */
import 'react-native';
import {render, act, fireEvent} from '@testing-library/react-native';
import * as React from 'react';
import {RoomProvider} from '../src/context/RoomContext';
import {VideoPlayerView} from '../src/components/VideoPlayerView';
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

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
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

const item = {...fallbackMediaItems[0], durationSec: 30};

describe('Gesture control toggle', () => {
  const realWebSocket = (globalThis as any).WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
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

  it('sends a real vision_control enable command and reflects server status', async () => {
    const {screen, ws} = await setup();

    const toggle = screen.getByTestId('btn-player-gesture-toggle');
    expect(toggle.props.accessibilityLabel).toBe('Turn on gesture control');

    fireEvent.press(toggle);

    const command = ws.sent
      .map(payload => JSON.parse(payload))
      .find(message => message.type === 'vision_control');
    expect(command).toEqual({type: 'vision_control', enabled: true});

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({data: JSON.stringify({type: 'vision_status', enabled: true})});
      }
    });
    expect(
      screen.getByTestId('btn-player-gesture-toggle').props.accessibilityLabel,
    ).toBe('Turn off gesture control');
  });
});
