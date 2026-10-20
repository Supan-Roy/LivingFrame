import 'react-native';
import {render, fireEvent} from '@testing-library/react-native';
import * as React from 'react';
import {
  useTVEventHandler,
  useKeplerBackHandler,
} from '@amazon-devices/react-native-kepler';

jest.mock('@amazon-devices/react-native-w3cmedia', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    VideoPlayer: class MockVideoPlayer {
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
    },
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

import {App} from '../src/App';

describe('LivingFrame App', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the header brand', () => {
    const screen = render(<App />);
    expect(screen.getByTestId('header-brand-title')).toBeTruthy();
  });

  it('renders prominent hero action buttons', () => {
    const screen = render(<App />);
    expect(screen.getByTestId('hero-btn-explore')).toBeTruthy();
    expect(screen.getByTestId('hero-btn-more-info')).toBeTruthy();
    expect(screen.getByTestId('hero-btn-room-recap')).toBeTruthy();
  });

  it('renders content rows and cards', () => {
    const screen = render(<App />);
    expect(
      screen.getByTestId('card-trending-featured-behind-the-screams'),
    ).toBeTruthy();
  });

  it('registers TV event handler for remote home button and exits app', () => {
    render(<App />);

    expect(useTVEventHandler).toHaveBeenCalled();
    const eventHandler = (useTVEventHandler as unknown as jest.Mock).mock.calls[0][0];
    const mockBackHandler = (useKeplerBackHandler as unknown as jest.Mock).mock.results[0].value;

    // Trigger remote home button event
    eventHandler({eventType: 'home'});
    expect(mockBackHandler.exitApp).toHaveBeenCalled();
  });

  it('exits app when back button is pressed at root screen', () => {
    render(<App />);

    const mockBackHandler = (useKeplerBackHandler as unknown as jest.Mock).mock.results[0].value;
    expect(mockBackHandler.addEventListener).toHaveBeenCalledWith(
      'hardwareBackPress',
      expect.any(Function),
    );

    const backCallback = mockBackHandler.addEventListener.mock.calls[0][1];
    backCallback();
    expect(mockBackHandler.exitApp).toHaveBeenCalled();
  });

  it('plays video when Watch Now is pressed on HeroBanner', () => {
    const screen = render(<App />);

    const watchNowBtn = screen.getByTestId('hero-btn-explore');
    expect(watchNowBtn).toBeTruthy();

    fireEvent.press(watchNowBtn);

    expect(screen.getByTestId('livingframe-videoplayer-view')).toBeTruthy();
    expect(screen.getByTestId('btn-player-back')).toBeTruthy();
    expect(screen.getByTestId('btn-player-toggle')).toBeTruthy();

    // Press Back to browse
    fireEvent.press(screen.getByTestId('btn-player-back'));
    expect(screen.queryByTestId('livingframe-videoplayer-view')).toBeNull();
  });

  it('automatically rotates hero banner titles every 5 seconds through the first row', () => {
    const screen = render(<App />);

    // Initially shows first item in first row: Behind The Screams
    expect(screen.getByTestId('hero-title').props.children).toBe('Behind The Screams');

    // Advance 5 seconds: advances to Cereal Streamz
    React.act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('hero-title').props.children).toBe('Cereal Streamz');

    // Advance another 5 seconds: advances to Feline Assistant
    React.act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('hero-title').props.children).toBe('Feline Assistant');

    // Advance 3 more intervals (15s) to cycle through remaining items and wrap around
    React.act(() => {
      jest.advanceTimersByTime(15000);
    });
    // The Beige Knight -> Startup Strays -> wraps to Behind The Screams
    expect(screen.getByTestId('hero-title').props.children).toBe('Behind The Screams');
  });
});

