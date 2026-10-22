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
        duration: 10,
      }));
      return ReactModule.createElement(View, {
        ...props,
        testID: props.testID || 'mock-native-video-surface',
      });
    }),
  };
});

let triggerMockEvent: ((event: Partial<RoomEvent>) => void) | null = null;

const RoomEventDispatcher = () => {
  const room = useRoom();
  triggerMockEvent = room.triggerMockEvent;
  return null;
};

const getPlayer = (): any => mockPlayerRegistry.slice(-1)[0];

describe('Room-Aware Playback Intelligence - Component Integration', () => {
  const demoItem = {
    ...fallbackMediaItems[0], // behind-the-screams
    durationSec: 10.0,
  };

  beforeEach(() => {
    mockPlayerRegistry.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setupPlayer = async (mediaItem: any = demoItem) => {
    const screen = render(
      <RoomProvider>
        <VideoPlayerView
          item={mediaItem}
          visible={true}
          onClose={jest.fn()}
          onRoomRecap={jest.fn()}
        />
        <RoomEventDispatcher />
      </RoomProvider>,
    );
    await act(async () => {});
    act(() => {
      getPlayer().emit('loadeddata');
      getPlayer().emit('playing');
    });
    return screen;
  };

  const dispatchEvent = (evt: Partial<RoomEvent>) => {
    act(() => {
      if (triggerMockEvent) {
        triggerMockEvent(evt);
      }
    });
  };

  it('Scenario A: Solo viewer leaves, grace period elapses, playback pauses with room notice', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();
    player.pause.mockClear();

    // Start with 1 person in room
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Advance 3 seconds of playback (to ~3.0s)
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Solo viewer leaves (1 -> 0)
    dispatchEvent({
      type: 'person_left',
      payload: {personCount: 0},
    });

    // Immediately after leaving, player should not pause yet (grace period active)
    expect(player.pause).not.toHaveBeenCalled();

    // Advance 1 second (still in 2.5s grace period)
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(player.pause).not.toHaveBeenCalled();

    // Advance past the 2.5s grace period (another 2000ms)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Now empty-room policy should have triggered pause
    expect(player.pause).toHaveBeenCalled();
    expect(screen.queryByText('Room empty · Playback paused')).toBeTruthy();
    // NEVER show a recap banner for solo viewers
    expect(screen.queryByTestId('recap-offer-banner')).toBeNull();
  });

  it('Scenario A: Transient sensor occlusion does not trigger false pause', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();
    player.pause.mockClear();

    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Viewer leaves (1 -> 0)
    dispatchEvent({
      type: 'person_left',
      payload: {personCount: 0},
    });

    // Viewer returns within 1.0s (less than 2.5s grace period)
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Advance well past the original grace period
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Player should never have paused
    expect(player.pause).not.toHaveBeenCalled();
    expect(screen.queryByTestId('recap-offer-banner')).toBeNull();
  });

  it('Scenario A: Solo viewer returns and playback resumes from exact checkpoint with NO recap', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();

    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Advance 4s
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // Viewer leaves (1 -> 0)
    dispatchEvent({
      type: 'person_left',
      payload: {personCount: 0},
    });

    // Wait for empty-room pause
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(player.pause).toHaveBeenCalled();

    player.play.mockClear();

    // Viewer returns (0 -> 1)
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Resumes playing
    expect(player.play).toHaveBeenCalled();
    expect(screen.queryByText('Viewer returned · Resuming')).toBeTruthy();

    // Pure solo viewing must NEVER produce recap
    expect(screen.queryByTestId('recap-offer-banner')).toBeNull();
    expect(screen.queryByTestId('active-recap-overlay')).toBeNull();
  });

  it('Scenario B: Shared viewing departure lets remaining viewers continue watching uninterrupted', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();
    player.pause.mockClear();

    // 2 viewers initially
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 2},
    });

    // 1 viewer leaves (2 -> 1)
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Playback continues uninterrupted!
    expect(player.pause).not.toHaveBeenCalled();
    expect(screen.queryByTestId('recap-offer-banner')).toBeNull();
  });

  it('Scenario B: Shared viewing return after sufficient missed progress displays recap offer', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();

    // Start with 2 viewers
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 2},
    });

    // Advance to 2.0s (20% into 10s video, >= 10% min departure)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // One viewer leaves (2 -> 1)
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Advance playback by 2.0s (missed 2.0s out of 10s = 20% > 5% threshold)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Viewer returns (1 -> 2)
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 2},
    });

    // Non-blocking recap banner must appear!
    expect(screen.getByTestId('recap-offer-banner')).toBeTruthy();
    expect(screen.getByText("SOMEONE'S BACK")).toBeTruthy();
    expect(screen.getByText('Catch them up?')).toBeTruthy();
    expect(screen.getByTestId('btn-recap-offer-show')).toBeTruthy();
    expect(screen.getByTestId('btn-recap-offer-dismiss')).toBeTruthy();

    // Movie continues playing while banner is up
    expect(player.pause).not.toHaveBeenCalled();

    // Dismiss the offer
    act(() => {
      fireEvent.press(screen.getByTestId('btn-recap-offer-dismiss'));
    });

    // Banner dismissed, movie keeps playing
    expect(screen.queryByTestId('recap-offer-banner')).toBeNull();
  });

  it('Scenario B: Shared viewing manual approval opens honest authored recap modal and restores playback', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();

    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 2},
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Viewer leaves
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Advance 2s (20% missed)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Viewer returns
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 2},
    });

    expect(screen.getByTestId('recap-offer-banner')).toBeTruthy();

    // Click "Show Recap"
    act(() => {
      fireEvent.press(screen.getByTestId('btn-recap-offer-show'));
    });

    // Modal appears with authored story context
    expect(screen.getByTestId('active-recap-overlay')).toBeTruthy();
    expect(screen.getByText('LIVINGFRAME CONTEXT CATCH-UP')).toBeTruthy();
    expect(screen.getAllByText('Behind The Screams').length).toBeGreaterThanOrEqual(1);
    // Displays authored summary for demo title
    expect(
      screen.getByText(/Behind The Screams explores the specialized craft/i),
    ).toBeTruthy();

    player.play.mockClear();

    // Click "Continue Movie"
    act(() => {
      fireEvent.press(screen.getByTestId('btn-recap-modal-resume'));
    });

    // Modal closed and playback restored
    expect(screen.queryByTestId('active-recap-overlay')).toBeNull();
    expect(player.play).toHaveBeenCalled();
  });

  it('Scenario B: Thumbs up gesture voting works and requires consensus', async () => {
    const screen = await setupPlayer();

    // 3 viewers: required votes = ceil(3/2) = 2
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 3},
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // 1 viewer leaves (3 -> 2)
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 2},
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Viewer returns (2 -> 3)
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 3},
    });

    expect(screen.getByTestId('recap-offer-banner')).toBeTruthy();
    // 3 viewers -> consensus of 2 votes required
    expect(screen.getByText(/Consensus: 0 \/ 2 votes/i)).toBeTruthy();

    // First thumbs-up gesture
    dispatchEvent({
      type: 'gesture_detected',
      payload: {gesture: 'thumbs_up'} as any,
    });

    expect(screen.getByText(/Consensus: 1 \/ 2 votes/i)).toBeTruthy();
    // Recap modal not open yet because 1 < 2
    expect(screen.queryByTestId('active-recap-overlay')).toBeNull();

    // Rapid duplicate thumbs-up within 2000ms cooldown is ignored
    act(() => {
      jest.advanceTimersByTime(500);
    });
    dispatchEvent({
      type: 'gesture_detected',
      payload: {gesture: 'thumbs_up'} as any,
    });
    expect(screen.getByText(/Consensus: 1 \/ 2 votes/i)).toBeTruthy();

    // After 2000ms cooldown, second thumbs-up reaches majority consensus (2/2)
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    dispatchEvent({
      type: 'gesture_detected',
      payload: {gesture: 'thumbs_up'} as any,
    });

    // Reached consensus! Active recap modal opens!
    expect(screen.queryByTestId('recap-offer-banner')).toBeNull();
    expect(screen.getByTestId('active-recap-overlay')).toBeTruthy();
  });

  it('Phase 2: pauses on sustained inattention (>70% turned away for 5s), shows subtle prompt card, and allows Keep Playing', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();

    // Baseline: 1 viewer attentive
    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });
    dispatchEvent({
      type: 'attention_state',
      payload: {attentiveCount: 1, distractedCount: 0, isDistracted: false, viewerCount: 1},
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId('attention-prompt-overlay')).toBeNull();

    // Viewer turns away from the TV (>70% inattentive)
    dispatchEvent({
      type: 'attention_state',
      payload: {attentiveCount: 0, distractedCount: 1, isDistracted: true, viewerCount: 1},
    });

    // Before sustained period (e.g. 2s), playback does NOT pause
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId('attention-prompt-overlay')).toBeNull();

    // After sustained 5s, attention-aware viewing pauses playback and displays subtle prompt
    act(() => {
      jest.advanceTimersByTime(3500);
    });

    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByTestId('attention-prompt-overlay')).toBeTruthy();
    expect(screen.getByText(/ATTENTION-AWARE VIEWING/i)).toBeTruthy();
    expect(screen.getByText(/Playback paused/i)).toBeTruthy();

    // User presses Keep Playing button
    const keepPlayingBtn = screen.getByTestId('btn-attention-keep-playing');
    fireEvent.press(keepPlayingBtn);

    expect(player.play).toHaveBeenCalled();
    expect(screen.queryByTestId('attention-prompt-overlay')).toBeNull();
  });

  it('Phase 2: thumbs-up gesture overrides inattention pause and resumes playback', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();

    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });
    dispatchEvent({
      type: 'attention_state',
      payload: {attentiveCount: 0, distractedCount: 1, isDistracted: true, viewerCount: 1},
    });

    // Sustained 5s pause fires
    act(() => {
      jest.advanceTimersByTime(5500);
    });

    expect(screen.getByTestId('attention-prompt-overlay')).toBeTruthy();

    // Viewer gives thumbs-up gesture
    dispatchEvent({
      type: 'gesture_detected',
      payload: {gesture: 'thumbs_up'} as any,
    });

    expect(player.play).toHaveBeenCalled();
    expect(screen.queryByTestId('attention-prompt-overlay')).toBeNull();
  });

  it('Phase 2: offers optional rewind/replay banner when viewers face the TV again after distraction', async () => {
    const screen = await setupPlayer();
    const player = getPlayer();

    dispatchEvent({
      type: 'person_entered',
      payload: {personCount: 1},
    });

    // Baseline playback (advance 2s)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Distraction starts
    dispatchEvent({
      type: 'attention_state',
      payload: {attentiveCount: 0, distractedCount: 1, isDistracted: true, viewerCount: 1},
    });

    act(() => {
      jest.advanceTimersByTime(5500);
    });

    expect(screen.getByTestId('attention-prompt-overlay')).toBeTruthy();

    // Viewers turn back to face TV (attentive returns)
    dispatchEvent({
      type: 'attention_state',
      payload: {attentiveCount: 1, distractedCount: 0, isDistracted: false, viewerCount: 1},
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.queryByTestId('attention-prompt-overlay')).toBeNull();
    // Attention replay banner offered
    expect(screen.getByTestId('attention-replay-banner')).toBeTruthy();
    expect(screen.getByText(/WELCOME BACK/i)).toBeTruthy();

    // Press Rewind button
    const rewindBtn = screen.getByTestId('btn-attention-replay-accept');
    fireEvent.press(rewindBtn);

    expect(screen.queryByTestId('attention-replay-banner')).toBeNull();
    expect(player.play).toHaveBeenCalled();
  });
});
