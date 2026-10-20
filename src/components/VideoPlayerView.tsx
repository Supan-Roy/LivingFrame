import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Dimensions,
  PanResponder,
} from 'react-native';
import {
  TVFocusGuideView,
  useTVEventHandler,
  HWEvent,
} from '@amazon-devices/react-native-kepler';
import {
  VideoPlayer,
  KeplerVideoSurfaceView,
} from '@amazon-devices/react-native-w3cmedia';
import {MediaItem, TitleRecapMetadata} from '../types/catalog';
import {colors} from '../theme/theme';
import {useRoom} from '../context/RoomContext';
import {findBlockingSegment} from '../room/scenePolicy';
import {
  RoomPlaybackEngine,
  PlaybackPolicyAction,
  RecapOfferState,
  DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG,
} from '../room/playbackIntelligence';
import {Icon} from './Icon';

export interface VideoPlayerViewProps {
  item: MediaItem | null;
  visible?: boolean;
  onClose: () => void;
  onRoomRecap: (item: MediaItem) => void;
}

// Seconds skipped per horizontal swipe gesture
const GESTURE_SEEK_STEP_SEC = 5;

export const VideoPlayerView = ({
  item,
  visible = true,
  onClose,
  onRoomRecap,
}: VideoPlayerViewProps) => {
  const {width: deviceWidth, height: deviceHeight} = Dimensions.get('window');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(
    item?.durationSec && item.durationSec > 0 && item.durationSec <= 300
      ? item.durationSec
      : 10.0,
  );
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(true);
  const [focusedControl, setFocusedControl] = useState<
    'back' | 'play' | 'restart' | 'recap' | 'gesture' | 'family'
  >('play');
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [gestureFeedback, setGestureFeedback] = useState<string | null>(null);
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
  const [statsVisible, setStatsVisible] = useState<boolean>(false);
  const [arrivalText, setArrivalText] = useState<string | null>(null);

  // --- Room-Aware Playback Intelligence state ---
  const [recapOffer, setRecapOffer] = useState<RecapOfferState | null>(null);
  const [isShowingRecap, setIsShowingRecap] = useState<boolean>(false);
  const [activeRecapMeta, setActiveRecapMeta] = useState<TitleRecapMetadata | null>(null);
  const [activeRecapResumePos, setActiveRecapResumePos] = useState<number | null>(null);
  const [activeRecapDeparturePos, setActiveRecapDeparturePos] = useState<number>(0);
  const [focusedOfferControl, setFocusedOfferControl] = useState<'show' | 'dismiss'>('show');
  const [focusedModalBtn, setFocusedModalBtn] = useState<'resume' | 'skip'>('resume');

  const engineRef = useRef<RoomPlaybackEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new RoomPlaybackEngine(
      item?.id || 'video',
      durationSec,
      DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG,
      item?.recap,
    );
  }

  const [panelOffset, setPanelOffset] = useState<{x: number; y: number}>({
    x: 0,
    y: 0,
  });
  const panelOffsetRef = useRef<{x: number; y: number}>({x: 0, y: 0});
  const dragStartRef = useRef<{x: number; y: number}>({x: 0, y: 0});

  // Drag the stats panel with the cursor/touch. Bounded so it cannot be lost off-screen.
  const panelPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartRef.current = {...panelOffsetRef.current};
        },
        onPanResponderMove: (_event, gesture) => {
          const next = {
            x: Math.max(
              -deviceWidth * 0.6,
              Math.min(deviceWidth * 0.4, dragStartRef.current.x + gesture.dx),
            ),
            y: Math.max(
              -deviceHeight * 0.5,
              Math.min(deviceHeight * 0.5, dragStartRef.current.y + gesture.dy),
            ),
          };
          panelOffsetRef.current = next;
          setPanelOffset(next);
        },
      }),
    [deviceWidth, deviceHeight],
  );

  const playerRef = useRef<VideoPlayer | null>(null);
  const surfaceHandleRef = useRef<string | null>(null);
  const isPlayingRef = useRef<boolean>(true);
  const isMountedRef = useRef<boolean>(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackStartWallRef = useRef<number | null>(null);
  const pausedOffsetRef = useRef<number>(0);
  const lastEndedTimeRef = useRef<number>(0);
  const seekGuardUntilRef = useRef<number>(0);
  const isInitializedRef = useRef<boolean>(false);
  const isLoadedRef = useRef<boolean>(false);
  const gestureFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrivalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {roomState, setGesturesEnabled, setFamilyMode} = useRoom();
  const lastGestureEventIdRef = useRef<string | null>(roomState.lastEvent?.id ?? null);

  // --- Family Mode / room-aware protection state ---
  const [protectionOverride, setProtectionOverride] = useState<boolean>(false);
  const pausedByProtectionRef = useRef<boolean>(false);
  const lastRoomEventIdRef = useRef<string | null>(roomState.lastEvent?.id ?? null);

  const targetSrc = item?.videoUrl || (item?.id ? `http://10.0.2.2:8080/videos/${item.id}.mp4` : '');

  // Attach surface handle and load video exactly once when both player and surface are ready
  const tryAttachAndLoad = useCallback(() => {
    const player = playerRef.current;
    const handle = surfaceHandleRef.current;
    if (player && handle && isInitializedRef.current && !isLoadedRef.current) {
      isLoadedRef.current = true;
      console.info(`[LivingFrame Video] Fast attaching surface handle ${handle} & loading: ${targetSrc}`);
      try {
        player.setSurfaceHandle(handle);
        player.src = targetSrc;
        player.load();
      } catch (e) {
        console.warn('[LivingFrame Video] Error attaching surface or loading stream:', e);
      }
    }
  }, [targetSrc]);

  // Auto-hide controls after 5 seconds of inactivity
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setControlsVisible(false);
      }
    }, 5000);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => {
      const next = !prev;
      if (next) {
        resetHideTimer();
      } else {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      }
      return next;
    });
  }, [resetHideTimer]);

  // Start 5-second auto-hide timer on mount or when video starts
  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetHideTimer]);

  // Calibrated monotonic wall-clock progress timer for rock-solid seek bar synchronization
  useEffect(() => {
    if (!isPlaying || isVideoLoading) {
      return;
    }
    const interval = setInterval(() => {
      if (!isMountedRef.current) return;
      if (playbackStartWallRef.current !== null) {
        const elapsed = (Date.now() - playbackStartWallRef.current) / 1000 + pausedOffsetRef.current;
        const cur = durationSec > 0 ? elapsed % durationSec : elapsed;
        setCurrentTimeSec(Math.min(durationSec, Math.max(0, cur)));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, isVideoLoading, durationSec]);

  // Manage VideoPlayer lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    isInitializedRef.current = false;
    isLoadedRef.current = false;
    setIsVideoLoading(true);
    setCurrentTimeSec(0);
    playbackStartWallRef.current = null;
    pausedOffsetRef.current = 0;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setControlsVisible(true);
    setGestureFeedback(null);

    console.info(`[LivingFrame Video] Initializing player for item: ${item?.id} src=${targetSrc}`);
    const player = new VideoPlayer();
    playerRef.current = player;

    const onLoadedMetadata = () => {
      const dur = player.duration;
      console.info(`[LivingFrame Video] Event: loadedmetadata duration=${dur}`);
      if (dur && !isNaN(dur) && dur > 0 && dur <= 300) {
        setDurationSec(dur);
      }
    };

    const onLoadedData = () => {
      console.info('[LivingFrame Video] Event: loadeddata (first frame ready)');
      if (isMountedRef.current) {
        setIsVideoLoading(false);
      }
    };

    const onCanPlay = () => {
      console.info('[LivingFrame Video] Event: canplay -> calling player.play()');
      if (isMountedRef.current) {
        setIsVideoLoading(false);
        player.play().catch(e => {
          console.warn('[LivingFrame Video] play notice:', e);
        });
      }
    };

    const onPlaying = () => {
      console.info('[LivingFrame Video] Event: playing');
      if (isMountedRef.current) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        setIsVideoLoading(false);
        if (playbackStartWallRef.current === null) {
          playbackStartWallRef.current = Date.now();
        }
        resetHideTimer();
      }
    };

    const onTimeUpdate = () => {
      if (!isMountedRef.current) return;
      setIsVideoLoading(false);
      const dur = player.duration;
      if (dur && !isNaN(dur) && dur > 0 && dur <= 300) {
        setDurationSec(dur);
      }
    };

    const onPause = () => {
      // Ignore the transient pause the native player emits while seeking
      if (Date.now() < seekGuardUntilRef.current) {
        console.info('[LivingFrame Video] Event: pause (ignored during seek)');
        return;
      }
      console.info('[LivingFrame Video] Event: pause');
      if (isMountedRef.current) {
        if (playbackStartWallRef.current !== null) {
          const elapsed = (Date.now() - playbackStartWallRef.current) / 1000 + pausedOffsetRef.current;
          pausedOffsetRef.current = durationSec > 0 ? elapsed % durationSec : elapsed;
        }
        playbackStartWallRef.current = null;
        setIsPlaying(false);
        isPlayingRef.current = false;
        showControls();
      }
    };

    const onError = () => {
      const err = player.error;
      console.error(`[LivingFrame Video] Event: error code=${err?.code} msg=${err?.message}`);
      if (isMountedRef.current) {
        setIsVideoLoading(false);
        showControls();
      }
    };

    const onEnded = () => {
      console.info('[LivingFrame Video] Event: ended -> looping');
      const now = Date.now();
      if (now - lastEndedTimeRef.current < 1000) {
        return; // Debounce rapid duplicate ended events
      }
      lastEndedTimeRef.current = now;
      playbackStartWallRef.current = Date.now();
      pausedOffsetRef.current = 0;
      setCurrentTimeSec(0);
      try {
        player.currentTime = 0;
        player.play().catch(() => {});
      } catch (_e) {
        // ignore restart error
      }
    };

    player
      .initialize()
      .then(() => {
        console.info('[LivingFrame Video] VideoPlayer initialized successfully');
        player.addEventListener('loadedmetadata', onLoadedMetadata);
        player.addEventListener('loadeddata', onLoadedData);
        player.addEventListener('canplay', onCanPlay);
        player.addEventListener('playing', onPlaying);
        player.addEventListener('timeupdate', onTimeUpdate);
        player.addEventListener('pause', onPause);
        player.addEventListener('error', onError);
        player.addEventListener('ended', onEnded);

        player.autoplay = true;
        player.muted = true;

        isInitializedRef.current = true;
        tryAttachAndLoad();
      })
      .catch(err => {
        console.error(`[LivingFrame Video] VideoPlayer initialize error: ${err}`);
      });

    return () => {
      isMountedRef.current = false;
      isInitializedRef.current = false;
      isLoadedRef.current = false;
      console.info(`[LivingFrame Video] Tearing down VideoPlayer for item: ${item?.id}`);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      if (gestureFeedbackTimerRef.current) {
        clearTimeout(gestureFeedbackTimerRef.current);
      }
      if (roomNoticeTimerRef.current) {
        clearTimeout(roomNoticeTimerRef.current);
      }
      if (arrivalTimerRef.current) {
        clearTimeout(arrivalTimerRef.current);
      }
      try {
        player.pause();
        if (surfaceHandleRef.current) {
          player.clearSurfaceHandle(surfaceHandleRef.current);
        }
        player.removeEventListener('loadedmetadata', onLoadedMetadata);
        player.removeEventListener('loadeddata', onLoadedData);
        player.removeEventListener('canplay', onCanPlay);
        player.removeEventListener('playing', onPlaying);
        player.removeEventListener('timeupdate', onTimeUpdate);
        player.removeEventListener('pause', onPause);
        player.removeEventListener('error', onError);
        player.removeEventListener('ended', onEnded);
        player.deinitialize().catch(() => {});
      } catch (e) {
        console.warn(`[LivingFrame Video] Error during player deinit: ${e}`);
      }
      playerRef.current = null;
    };
  }, [item?.id, targetSrc, durationSec, tryAttachAndLoad, resetHideTimer, showControls]);

  const handleSurfaceCreated = useCallback(
    (handle: string) => {
      console.info(`[LivingFrame Video] Event: onSurfaceViewCreated handle=${handle}`);
      surfaceHandleRef.current = handle;
      tryAttachAndLoad();
    },
    [tryAttachAndLoad],
  );

  const handleSurfaceDestroyed = useCallback((handle: string) => {
    console.info(`[LivingFrame Video] Event: onSurfaceViewDestroyed handle=${handle}`);
    if (playerRef.current) {
      try {
        playerRef.current.clearSurfaceHandle(handle);
      } catch (e) {
        console.warn(`[LivingFrame Video] Error in clearSurfaceHandle: ${e}`);
      }
    }
    surfaceHandleRef.current = null;
    isLoadedRef.current = false;
  }, []);

  // Playback control functions
  const handlePlay = useCallback(() => {
    resetHideTimer();
    if (playerRef.current) {
      try {
        playerRef.current.play().catch(e => console.warn('[LivingFrame Video] play notice:', e));
      } catch (e) {
        console.warn('[LivingFrame Video] play notice:', e);
      }
    }
    playbackStartWallRef.current = Date.now();
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, [resetHideTimer]);

  const handlePause = useCallback(() => {
    resetHideTimer();
    if (isVideoLoading) {
      console.info('[LivingFrame Video] Ignoring pause while video is loading');
      return;
    }
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch (e) {
        console.warn('[LivingFrame Video] pause notice:', e);
      }
    }
    if (playbackStartWallRef.current !== null) {
      const elapsed = (Date.now() - playbackStartWallRef.current) / 1000 + pausedOffsetRef.current;
      pausedOffsetRef.current = durationSec > 0 ? elapsed % durationSec : elapsed;
    }
    playbackStartWallRef.current = null;
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [isVideoLoading, resetHideTimer, durationSec]);

  const handleTogglePlay = useCallback(() => {
    resetHideTimer();
    if (isVideoLoading) {
      console.info('[LivingFrame Video] Ignoring toggle while video is loading');
      return;
    }
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying, isVideoLoading, handlePause, handlePlay, resetHideTimer]);

  const handleRestart = useCallback(() => {
    resetHideTimer();
    if (playerRef.current) {
      try {
        playerRef.current.currentTime = 0;
        playerRef.current.play().catch(e => console.warn('[LivingFrame Video] restart notice:', e));
      } catch (e) {
        console.warn('[LivingFrame Video] restart notice:', e);
      }
    }
    playbackStartWallRef.current = Date.now();
    pausedOffsetRef.current = 0;
    setCurrentTimeSec(0);
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, [resetHideTimer]);

  const showGestureFeedback = useCallback((message: string) => {
    setGestureFeedback(message);
    if (gestureFeedbackTimerRef.current) {
      clearTimeout(gestureFeedbackTimerRef.current);
    }
    gestureFeedbackTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setGestureFeedback(null);
      }
    }, 1800);
  }, []);

  const seekRelative = useCallback(
    (deltaSec: number) => {
      const dur = durationSec > 0 ? durationSec : 0;
      let target = currentTimeSec + deltaSec;
      if (target < 0) {
        target = 0;
      }
      if (dur > 0 && target > dur) {
        target = dur;
      }
      pausedOffsetRef.current = target;
      if (isPlayingRef.current) {
        playbackStartWallRef.current = Date.now();
        // Seeking can make the native player emit a transient 'pause'/stall; guard
        // against it and re-assert playback so the picture does not freeze.
        seekGuardUntilRef.current = Date.now() + 600;
      }
      setCurrentTimeSec(target);
      if (playerRef.current) {
        try {
          playerRef.current.currentTime = target;
          if (isPlayingRef.current) {
            playerRef.current.play().catch(() => {});
          }
        } catch (e) {
          console.warn('[LivingFrame Video] Gesture seek notice:', e);
        }
      }
    },
    [currentTimeSec, durationSec],
  );

  const showRoomNotice = useCallback((message: string) => {
    setRoomNotice(message);
    if (roomNoticeTimerRef.current) {
      clearTimeout(roomNoticeTimerRef.current);
    }
    roomNoticeTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setRoomNotice(null);
      }
    }, 4000);
  }, []);

  const seekTo = useCallback(
    (targetSec: number) => {
      const dur = durationSec > 0 ? durationSec : 0;
      let target = Math.max(0, targetSec);
      if (dur > 0 && target > dur) {
        target = dur;
      }
      pausedOffsetRef.current = target;
      if (isPlayingRef.current) {
        playbackStartWallRef.current = Date.now();
        seekGuardUntilRef.current = Date.now() + 600;
      }
      setCurrentTimeSec(target);
      if (playerRef.current) {
        try {
          playerRef.current.currentTime = target;
          if (isPlayingRef.current) {
            playerRef.current.play().catch(() => {});
          }
        } catch (e) {
          console.warn('[LivingFrame Video] Seek notice:', e);
        }
      }
    },
    [durationSec],
  );

  // --- Room-Aware Playback Intelligence handlers ---
  const handlePolicyAction = useCallback(
    (action: PlaybackPolicyAction) => {
      switch (action.type) {
        case 'PAUSE_SOLO': {
          if (isPlayingRef.current) {
            handlePause();
          }
          showRoomNotice('Room empty · Playback paused');
          break;
        }
        case 'RESUME_SOLO': {
          seekTo(action.positionSec);
          handlePlay();
          showRoomNotice('Viewer returned · Resuming');
          break;
        }
        case 'RECORD_SHARED_DEPARTURE': {
          // Playback continues uninterrupted for remaining viewers
          break;
        }
        case 'OFFER_RECAP': {
          setRecapOffer(action.offer);
          setFocusedOfferControl('show');
          break;
        }
        case 'START_RECAP': {
          setRecapOffer(null);
          setIsShowingRecap(true);
          setActiveRecapMeta(action.metadata || null);
          setActiveRecapResumePos(action.resumePositionSec);
          setActiveRecapDeparturePos(
            engineRef.current?.sharedCheckpoint?.departurePositionSec ?? 0,
          );
          if (isPlayingRef.current) {
            handlePause();
          }
          break;
        }
        case 'DISMISS_RECAP': {
          setRecapOffer(null);
          break;
        }
        case 'NONE':
        default:
          break;
      }
    },
    [handlePause, handlePlay, seekTo, showRoomNotice],
  );

  const handleAcceptRecap = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    const action = engine.vote('remote', Date.now());
    handlePolicyAction(action);
  }, [handlePolicyAction]);

  const handleDismissRecap = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    const action = engine.dismissRecapOffer();
    handlePolicyAction(action);
  }, [handlePolicyAction]);

  const handleFinishActiveRecap = useCallback(() => {
    const engine = engineRef.current;
    const result = engine?.finishRecap();
    const resumeSec =
      result?.resumePositionSec ?? activeRecapResumePos ?? currentTimeSec;
    setIsShowingRecap(false);
    setActiveRecapMeta(null);
    setActiveRecapResumePos(null);
    seekTo(resumeSec);
    handlePlay();
  }, [activeRecapResumePos, currentTimeSec, seekTo, handlePlay]);

  // Keep engine synchronized with active player state
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !item) {
      return;
    }
    engine.updatePlaybackState({
      titleId: item.id,
      durationSec,
      currentPositionSec: currentTimeSec,
      isPlaying: isPlayingRef.current,
      metadata: item.recap,
    });
  }, [item, durationSec, currentTimeSec]);

  // React to stabilized room occupancy count changes
  const prevViewersRef = useRef<number>(roomState.viewersPresent);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    const currentCount = roomState.viewersPresent;
    const previousCount = prevViewersRef.current;
    prevViewersRef.current = currentCount;

    if (currentCount !== previousCount) {
      const action = engine.onPersonCountChange(
        currentCount,
        previousCount,
        Date.now(),
      );
      handlePolicyAction(action);
    }
  }, [roomState.viewersPresent, handlePolicyAction]);

  // Grace period and offer auto-dismiss ticker (200ms)
  useEffect(() => {
    const interval = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) {
        return;
      }
      const action = engine.checkGracePeriod(Date.now());
      if (action.type !== 'NONE') {
        handlePolicyAction(action);
      }
      if (engine.recapOffer) {
        setRecapOffer({...engine.recapOffer});
      }
    }, 200);
    return () => clearInterval(interval);
  }, [handlePolicyAction]);

  // --- Family Mode / room-aware protection --------------------------------
  // A child in the room (detected, or already present when Family Mode is switched on)
  // is what arms the policy. `childPresent` is a body-proportion estimate, not identity.
  const safetySegments = item?.sceneSafety ?? [];
  const blockedSegment = findBlockingSegment({
    familyModeEnabled: roomState.familyModeEnabled,
    armed: roomState.childPresent,
    override: protectionOverride,
    segments: safetySegments,
    currentTimeSec,
  });
  const isProtectionBlocked = blockedSegment !== null;

  // Contextual reaction to room entries (the policy itself follows child presence).
  // (The sensor already debounces entries, so this is not a per-frame reaction.)
  useEffect(() => {
    const event = roomState.lastEvent;
    if (!event || event.id === lastRoomEventIdRef.current) {
      return;
    }
    lastRoomEventIdRef.current = event.id;

    if (event.type === 'person_entered') {
      // The policy itself is driven by child presence (below); this is the reaction.
      if (roomState.familyModeEnabled) {
        showRoomNotice('Someone joined the room · Family Mode active');
      }
      setArrivalText('Person entered');
      if (arrivalTimerRef.current) {
        clearTimeout(arrivalTimerRef.current);
      }
      arrivalTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setArrivalText(null);
        }
      }, 4000);
    }
  }, [roomState.lastEvent, roomState.familyModeEnabled, showRoomNotice]);

  // Turning Family Mode off clears any viewer override.
  useEffect(() => {
    if (!roomState.familyModeEnabled) {
      setProtectionOverride(false);
    }
  }, [roomState.familyModeEnabled]);

  // Room stats panel: shown whenever Family Mode is switched on, hidden when off.
  // Dismissing it stays dismissed until Family Mode is toggled on again.
  useEffect(() => {
    if (roomState.familyModeEnabled) {
      setStatsVisible(true);
    } else {
      setStatsVisible(false);
      setArrivalText(null);
    }
  }, [roomState.familyModeEnabled]);

  // Handle the playhead being inside a tagged segment: skip it, or pause with a reason.
  useEffect(() => {
    if (!isProtectionBlocked || !blockedSegment) {
      return;
    }
    if (blockedSegment.action === 'skip') {
      seekRelative(blockedSegment.resumeSec - currentTimeSec);
      return;
    }
    if (isPlayingRef.current) {
      console.info(
        `[LivingFrame] Family Mode blocked a "${blockedSegment.category}" segment`,
      );
      pausedByProtectionRef.current = true;
      handlePause();
    }
  }, [isProtectionBlocked, blockedSegment, currentTimeSec, seekRelative, handlePause]);

  // Resume automatically once the room is clear again (only if we were the ones pausing).
  useEffect(() => {
    if (!isProtectionBlocked && pausedByProtectionRef.current) {
      pausedByProtectionRef.current = false;
      handlePlay();
    }
  }, [isProtectionBlocked, handlePlay]);

  // React to room sensor gestures: hand raise toggles playback, swipes seek +/- 5s
  useEffect(() => {
    const event = roomState.lastEvent;
    if (!event || event.type !== 'gesture_detected') {
      return;
    }
    if (event.id === lastGestureEventIdRef.current) {
      return;
    }
    lastGestureEventIdRef.current = event.id;

    const gesture = event.payload?.gesture;
    if (gesture === 'hand_raised') {
      if (isVideoLoading) {
        return;
      }
      handleTogglePlay();
      showGestureFeedback(isPlayingRef.current ? 'Play' : 'Pause');
    } else if (gesture === 'swipe_left') {
      seekRelative(-GESTURE_SEEK_STEP_SEC);
      showGestureFeedback('Rewind');
    } else if (gesture === 'swipe_right') {
      seekRelative(GESTURE_SEEK_STEP_SEC);
      showGestureFeedback('Forward');
    } else if (gesture === 'thumbs_up') {
      const engine = engineRef.current;
      if (recapOffer && engine) {
        const action = engine.vote('thumbs_up', Date.now());
        if (action.type === 'START_RECAP') {
          handlePolicyAction(action);
        } else {
          showGestureFeedback('Vote Recorded');
          if (engine.recapOffer) {
            setRecapOffer({...engine.recapOffer});
          }
        }
      } else {
        showGestureFeedback('Thumbs Up');
      }
    }
  }, [
    roomState.lastEvent,
    isVideoLoading,
    handleTogglePlay,
    seekRelative,
    showGestureFeedback,
    recapOffer,
    handlePolicyAction,
  ]);

  // Hardware remote key event listener
  useTVEventHandler((evt: HWEvent) => {
    if (!visible || !evt || !evt.eventType) {
      return;
    }
    const eventType = evt.eventType.toLowerCase();

    // If recap modal is displayed, trap focus in the modal
    if (isShowingRecap) {
      if (eventType === 'left' || eventType === 'up') {
        setFocusedModalBtn('resume');
      } else if (eventType === 'right' || eventType === 'down') {
        setFocusedModalBtn('skip');
      } else if (eventType === 'select') {
        handleFinishActiveRecap();
      } else if (eventType === 'back') {
        handleFinishActiveRecap();
      }
      return;
    }

    // If recap offer banner is visible, allow remote D-pad selection
    if (recapOffer) {
      if (eventType === 'left') {
        setFocusedOfferControl('show');
        return;
      } else if (eventType === 'right') {
        setFocusedOfferControl('dismiss');
        return;
      } else if (eventType === 'select') {
        if (focusedOfferControl === 'show') {
          handleAcceptRecap();
        } else {
          handleDismissRecap();
        }
        return;
      } else if (eventType === 'back') {
        handleDismissRecap();
        return;
      }
    }

    // If controls are hidden, any user key wakes up the controller and restarts the 5s timer
    if (!controlsVisible) {
      if (eventType === 'back') {
        onClose();
        return;
      }
      showControls();
      return;
    }

    // Reset 5s countdown on every interaction while controls are visible
    resetHideTimer();

    if (eventType === 'back') {
      onClose();
    } else if (eventType === 'play' || eventType === 'media_play') {
      handlePlay();
    } else if (eventType === 'pause' || eventType === 'media_pause') {
      handlePause();
    } else if (eventType === 'rewind' || eventType === 'media_rewind') {
      const newTime = Math.max(0, currentTimeSec - 10);
      pausedOffsetRef.current = newTime;
      if (isPlayingRef.current) {
        playbackStartWallRef.current = Date.now();
      }
      setCurrentTimeSec(newTime);
      if (playerRef.current) {
        try {
          playerRef.current.currentTime = newTime;
        } catch (_e) {
          // ignore remote rewind error
        }
      }
    } else if (eventType === 'fastforward' || eventType === 'media_fast_forward') {
      const newTime = Math.min(durationSec, currentTimeSec + 10);
      pausedOffsetRef.current = newTime;
      if (isPlayingRef.current) {
        playbackStartWallRef.current = Date.now();
      }
      setCurrentTimeSec(newTime);
      if (playerRef.current) {
        try {
          playerRef.current.currentTime = newTime;
        } catch (_e) {
          // ignore remote fast forward error
        }
      }
    } else if (eventType === 'menu') {
      toggleControls();
    }
  });

  if (!item || visible === false) {
    return null;
  }

  const formatTime = (totalSeconds: number) => {
    const total = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent =
    durationSec > 0
      ? Math.min(100, Math.max(0, (currentTimeSec / durationSec) * 100))
      : 0;

  return (
    <View style={styles.playerContainer} testID="livingframe-videoplayer-view">
      {/* 1. Hardware Accelerated Native Video rendered full screen */}
      <View
        style={[
          styles.surfaceWrapper,
          {
            width: deviceWidth,
            height: deviceHeight,
          },
        ]}>
        <KeplerVideoSurfaceView
          style={[
            styles.surfaceView,
            {
              width: deviceWidth,
              height: deviceHeight,
            },
          ]}
          scalingmode="fit"
          onSurfaceViewCreated={handleSurfaceCreated}
          onSurfaceViewDestroyed={handleSurfaceDestroyed}
          testID="kepler-video-surface-view"
        />
      </View>

      {/* 2. Full-Screen Backdrop: 1 click toggles controls, another hides and views video full screen */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={toggleControls}
        testID="btn-screen-toggle-controls"
      />

      {/* 3. Buffering / Loading Indicator */}
      {isVideoLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accentGold} />
          <Text style={styles.loadingText}>Connecting Video Stream...</Text>
        </View>
      )}

      {/* 3b. Single centered play/pause (and gesture) status — middle of the screen only */}
      {(gestureFeedback || (!isPlaying && controlsVisible)) && (
        <View
          style={styles.centerStatusOverlay}
          pointerEvents="none"
          testID="player-center-status">
          <View style={styles.centerStatusBadge}>
            <Text
              style={styles.centerStatusText}
              testID="player-center-status-text">
              {gestureFeedback ?? 'Pause'}
            </Text>
          </View>
        </View>
      )}

      {/* Subtle room-event notice (Family Mode reaction) */}
      {roomNotice && (
        <View
          style={styles.roomNoticeWrapper}
          pointerEvents="none"
          testID="room-notice">
          <View style={styles.roomNoticePill}>
            <Text style={styles.roomNoticeText}>{roomNotice}</Text>
          </View>
        </View>
      )}

      {/* Family Mode room stats — right edge, semi-transparent, dismissible */}
      {statsVisible && roomState.familyModeEnabled && (
        <View
          style={[
            styles.roomStatsPanel,
            {
              transform: [
                {translateX: panelOffset.x},
                {translateY: panelOffset.y},
              ],
            },
          ]}
          testID="room-stats-panel">
          <View style={styles.roomStatsHeader}>
            <View
              style={styles.roomStatsDragHandle}
              {...panelPanResponder.panHandlers}
              testID="room-stats-drag-handle">
              <View style={styles.roomStatsGrip}>
                {[0, 1, 2, 3, 4, 5].map(dot => (
                  <View key={dot} style={styles.roomStatsGripDot} />
                ))}
              </View>
              <Text style={styles.roomStatsTitle}>FAMILY MODE</Text>
            </View>
            <Pressable
              style={styles.roomStatsDismiss}
              onPress={() => setStatsVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Hide room stats"
              testID="btn-room-stats-dismiss">
              <Icon name="close" size={11} color="#E2E8F0" />
            </Pressable>
          </View>

          <View style={styles.roomStatsRow}>
            <Text style={styles.roomStatsLabel}>People in view</Text>
            <Text style={styles.roomStatsValue} testID="room-stats-people">
              {roomState.viewersPresent}
            </Text>
          </View>

          <View style={styles.roomStatsRow}>
            <Text style={styles.roomStatsLabel}>Another person</Text>
            <Text
              style={[
                styles.roomStatsValue,
                roomState.viewersPresent >= 2 && styles.roomStatsValueAlert,
              ]}
              testID="room-stats-another">
              {roomState.viewersPresent >= 2 ? 'Yes' : 'No'}
            </Text>
          </View>

          <View style={styles.roomStatsRow}>
            <Text style={styles.roomStatsLabel}>Child present (est.)</Text>
            <Text
              style={[
                styles.roomStatsValue,
                roomState.childPresent && styles.roomStatsValueAlert,
              ]}
              testID="room-stats-child">
              {roomState.childPresent ? 'Yes' : 'No'}
            </Text>
          </View>

          {arrivalText && (
            <View style={styles.roomStatsArrival}>
              <Icon name="person" size={11} color="#7DD3FC" />
              <Text style={styles.roomStatsArrivalText}>{arrivalText}</Text>
            </View>
          )}

          <Text style={styles.roomStatsFootnote}>
            Presence + child estimate · no identity
          </Text>
        </View>
      )}

      {/* 4. Controls & HUD Overlays (disappear after 5s or on tap to view video full screen) */}
      {controlsVisible && (
        <>
          {/* Subtle Edge Vignettes for Navigation Legibility */}
          <View style={styles.topVignette} pointerEvents="none" />
          <View style={styles.bottomVignette} pointerEvents="none" />

          {/* Top Navigation & Info HUD */}
          <View style={styles.topHeader}>
            <TVFocusGuideView style={styles.headerRow}>
              <Pressable
                style={[
                  styles.hudButton,
                  focusedControl === 'back' && styles.hudButtonFocused,
                ]}
                onFocus={() => {
                  resetHideTimer();
                  setFocusedControl('back');
                }}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Back to Browse"
                testID="btn-player-back">
                <View style={styles.hudButtonIcon}>
                  <Icon
                    name="chevron-left"
                    size={14}
                    color={focusedControl === 'back' ? '#0F172A' : '#F8FAFC'}
                  />
                </View>
                <Text
                  style={[
                    styles.hudButtonText,
                    focusedControl === 'back' && styles.controlBtnTextFocused,
                  ]}>
                  Back to Browse
                </Text>
              </Pressable>

              <View style={styles.titleGroup}>
                <Text style={styles.playerTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.metaRow}>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingBadgeText}>{item.contentRating}</Text>
                  </View>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.metaText}>{item.category}</Text>
                  <Text style={styles.metaDot}>•</Text>
                  <View
                    style={[
                      styles.streamBadge,
                      isPlaying ? styles.streamBadgePlaying : styles.streamBadgePaused,
                    ]}>
                    <View
                      style={[
                        styles.streamDot,
                        isPlaying ? styles.streamDotPlaying : styles.streamDotPaused,
                      ]}
                    />
                    <Text style={styles.streamBadgeText}>
                      {isPlaying ? 'PLAYING 1080p' : 'PAUSED'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Gesture Control On/Off Toggle (starts/stops the real webcam CV pipeline) */}
              <Pressable
                style={[
                  styles.visionToggle,
                  roomState.gesturesEnabled && styles.visionToggleOn,
                  focusedControl === 'gesture' && styles.visionToggleFocused,
                ]}
                onFocus={() => {
                  resetHideTimer();
                  setFocusedControl('gesture');
                }}
                onPress={() => setGesturesEnabled(!roomState.gesturesEnabled)}
                accessibilityRole="button"
                accessibilityLabel={
                  roomState.gesturesEnabled
                    ? 'Turn off gesture control'
                    : 'Turn on gesture control'
                }
                testID="btn-player-gesture-toggle">
                <View style={styles.visionToggleIcon}>
                  <Icon
                    name="camera"
                    size={14}
                    color={roomState.gesturesEnabled ? '#6EE7B7' : '#94A3B8'}
                  />
                </View>
                <Text
                  style={[
                    styles.visionToggleText,
                    roomState.gesturesEnabled && styles.visionToggleTextOn,
                  ]}>
                  {roomState.gesturesEnabled ? 'GESTURES ON' : 'GESTURES OFF'}
                </Text>
              </Pressable>

              {/* Family Mode: room-aware protection (explicit viewer opt-in) */}
              <Pressable
                style={[
                  styles.visionToggle,
                  roomState.familyModeEnabled && styles.familyToggleOn,
                  focusedControl === 'family' && styles.visionToggleFocused,
                ]}
                onFocus={() => {
                  resetHideTimer();
                  setFocusedControl('family');
                }}
                onPress={() => setFamilyMode(!roomState.familyModeEnabled)}
                accessibilityRole="button"
                accessibilityLabel={
                  roomState.familyModeEnabled
                    ? 'Turn off Family Mode'
                    : 'Turn on Family Mode'
                }
                testID="btn-player-family-toggle">
                <View style={styles.visionToggleIcon}>
                  <Icon
                    name="family"
                    size={14}
                    color={roomState.familyModeEnabled ? '#FDE68A' : '#94A3B8'}
                  />
                </View>
                <Text
                  style={[
                    styles.visionToggleText,
                    roomState.familyModeEnabled && styles.familyToggleTextOn,
                  ]}>
                  {roomState.familyModeEnabled ? 'FAMILY ON' : 'FAMILY OFF'}
                </Text>
              </Pressable>
            </TVFocusGuideView>
          </View>

          {/* Center pause/play status is rendered once, above, in the middle of the screen */}

          {/* Bottom Cinema Playback Control Bar */}
          <View style={styles.bottomControls}>
            {/* Progress Bar & Real Time Stamps */}
            <View style={styles.progressRow}>
              <Text style={styles.timeLabel} testID="player-current-time">
                {formatTime(Math.min(durationSec, currentTimeSec))}
              </Text>
              <View style={styles.progressBarTrack}>
                <View
                  style={[styles.progressBarFill, {width: `${progressPercent}%`}]}
                />
                <View
                  style={[
                    styles.progressBarThumb,
                    {left: `${Math.min(99, progressPercent)}%`},
                  ]}
                />
              </View>
              <Text style={styles.timeLabel} testID="player-duration-time">
                {formatTime(durationSec)}
              </Text>
            </View>

            {/* Interactive TV Remote Control Buttons */}
            <TVFocusGuideView style={styles.controlsRow}>
              <Pressable
                style={[
                  styles.controlBtn,
                  styles.primaryControlBtn,
                  focusedControl === 'play' && styles.controlBtnFocused,
                ]}
                onFocus={() => {
                  resetHideTimer();
                  setFocusedControl('play');
                }}
                onPress={handleTogglePlay}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
                testID="btn-player-toggle">
                <View style={styles.controlIcon}>
                  <Icon
                    name={isPlaying ? 'pause' : 'play'}
                    size={13}
                    color="#0F172A"
                  />
                </View>
                <Text style={styles.primaryControlBtnText}>
                  {isPlaying ? 'Pause' : 'Resume'}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.controlBtn,
                  focusedControl === 'restart' && styles.controlBtnFocused,
                ]}
                onFocus={() => {
                  resetHideTimer();
                  setFocusedControl('restart');
                }}
                onPress={handleRestart}
                accessibilityRole="button"
                accessibilityLabel="Restart video from beginning"
                testID="btn-player-restart">
                <View style={styles.controlIcon}>
                  <Icon
                    name="restart"
                    size={13}
                    color={focusedControl === 'restart' ? '#0F172A' : '#F8FAFC'}
                  />
                </View>
                <Text
                  style={[
                    styles.controlBtnText,
                    focusedControl === 'restart' && styles.controlBtnTextFocused,
                  ]}>
                  Restart
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.controlBtn,
                  styles.recapBtn,
                  focusedControl === 'recap' && styles.controlBtnFocused,
                ]}
                onFocus={() => {
                  resetHideTimer();
                  setFocusedControl('recap');
                }}
                onPress={() => {
                  resetHideTimer();
                  onRoomRecap(item);
                }}
                accessibilityRole="button"
                accessibilityLabel="Open ambient room context recap"
                testID="btn-player-recap">
                <View style={styles.recapBtnIcon}>
                  <Icon
                    name="spark"
                    size={12}
                    color={focusedControl === 'recap' ? '#0F172A' : '#F59E0B'}
                  />
                </View>
                <Text
                  style={[
                    styles.recapBtnText,
                    focusedControl === 'recap' && styles.controlBtnTextFocused,
                  ]}>
                  Room Context
                </Text>
              </Pressable>
            </TVFocusGuideView>
          </View>
        </>
      )}

      {/* Family Mode protection: opaque cover + explanation over the real video */}
      {isProtectionBlocked && blockedSegment && (
        <View style={styles.protectionOverlay} testID="family-protection-overlay">
          <View style={styles.protectionCard}>
            <Text style={styles.protectionBadge}>FAMILY MODE</Text>
            <Text style={styles.protectionTitle}>Playback paused</Text>
            <Text style={styles.protectionText}>
              Someone joined the room during a scene tagged for{' '}
              {blockedSegment.category.replace('_', ' ')}. This segment is not
              family-safe.
            </Text>
            <Text style={styles.protectionHint}>
              Playback resumes automatically when the room clears.
            </Text>
            <TVFocusGuideView style={styles.protectionActions}>
              <Pressable
                style={styles.protectionResumeBtn}
                onPress={() => setProtectionOverride(true)}
                accessibilityRole="button"
                accessibilityLabel="Resume anyway"
                testID="btn-protection-resume">
                <View style={styles.protectionResumeIcon}>
                  <Icon name="play" size={13} color="#0F172A" />
                </View>
                <Text style={styles.protectionResumeText}>Resume anyway</Text>
              </Pressable>
            </TVFocusGuideView>
          </View>
        </View>
      )}

      {/* Shared Viewing: Non-blocking recap offer banner */}
      {recapOffer && !isShowingRecap && (
        <View style={styles.recapOfferBanner} testID="recap-offer-banner">
          <View style={styles.recapOfferTopRow}>
            <View style={styles.recapOfferBadge}>
              <Icon name="spark" size={10} color="#00E5FF" />
              <Text style={styles.recapOfferBadgeText}>SOMEONE'S BACK</Text>
            </View>
            <Text style={styles.recapOfferTimer}>
              {Math.max(
                0,
                Math.ceil((recapOffer.expiresAtMs - Date.now()) / 1000),
              )}
              s
            </Text>
          </View>

          <Text style={styles.recapOfferHeadline}>Catch them up?</Text>
          <Text style={styles.recapOfferDetails}>
            Missed {recapOffer.missedSec.toFixed(0)}s (
            {(recapOffer.missedProgress * 100).toFixed(0)}% of content) • Movie keeps playing
          </Text>

          {recapOffer.requiredVotes > 1 && (
            <View style={styles.recapVoteRow}>
              <Text style={styles.recapVoteCount}>
                Consensus: {recapOffer.currentVotes} / {recapOffer.requiredVotes} votes
              </Text>
              <Text style={styles.recapVoteHint}>
                Thumbs-up or Remote to vote
              </Text>
            </View>
          )}

          <TVFocusGuideView style={styles.recapOfferActionRow}>
            <Pressable
              style={[
                styles.recapOfferBtn,
                styles.recapOfferShowBtn,
                focusedOfferControl === 'show' && styles.recapOfferBtnFocused,
              ]}
              onFocus={() => setFocusedOfferControl('show')}
              onPress={handleAcceptRecap}
              accessibilityRole="button"
              accessibilityLabel="Show recap"
              testID="btn-recap-offer-show">
              <View style={styles.recapOfferBtnIcon}>
                <Icon name="spark" size={11} color="#0F172A" />
              </View>
              <Text style={styles.recapOfferShowText}>Show Recap</Text>
            </Pressable>

            <Pressable
              style={[
                styles.recapOfferBtn,
                styles.recapOfferDismissBtn,
                focusedOfferControl === 'dismiss' && styles.recapOfferBtnFocused,
              ]}
              onFocus={() => setFocusedOfferControl('dismiss')}
              onPress={handleDismissRecap}
              accessibilityRole="button"
              accessibilityLabel="Keep watching"
              testID="btn-recap-offer-dismiss">
              <Text style={styles.recapOfferDismissText}>Keep Watching</Text>
            </Pressable>
          </TVFocusGuideView>
        </View>
      )}

      {/* Approved recap experience overlay */}
      {isShowingRecap && (
        <View style={styles.activeRecapBackdrop} testID="active-recap-overlay">
          <View style={styles.activeRecapCard}>
            <View style={styles.activeRecapHeader}>
              <View style={styles.activeRecapGlowIcon}>
                <Icon name="spark" size={20} color="#00E5FF" />
              </View>
              <View style={styles.activeRecapTitleBlock}>
                <Text style={styles.activeRecapHeaderTag}>
                  LIVINGFRAME CONTEXT CATCH-UP
                </Text>
                <Text style={styles.activeRecapHeaderTitle}>{item.title}</Text>
              </View>
            </View>

            <View style={styles.activeRecapBody}>
              <View style={styles.activeRecapNarrativeBox}>
                <Text style={styles.activeRecapNarrativeHeading}>
                  Missed Story Context (Zero Spoilers)
                </Text>
                <Text style={styles.activeRecapNarrativeText}>
                  {activeRecapMeta?.summary ||
                    `You stepped away while the room watched from ${formatTime(
                      activeRecapDeparturePos,
                    )} to ${formatTime(
                      activeRecapResumePos ?? currentTimeSec,
                    )}. Continuing normal playback from the room's current position.`}
                </Text>

                {activeRecapMeta?.keyPlotPoints &&
                  activeRecapMeta.keyPlotPoints.length > 0 && (
                    <View style={styles.activeRecapPointsList}>
                      {activeRecapMeta.keyPlotPoints.map((point, idx) => (
                        <View key={idx} style={styles.activeRecapPointRow}>
                          <Text style={styles.activeRecapPointBullet}>•</Text>
                          <Text style={styles.activeRecapPointText}>{point}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                <View style={styles.activeRecapNoticePill}>
                  <Icon name="spark" size={10} color="#F59E0B" />
                  <Text style={styles.activeRecapNoticeText}>
                    Authored room-aware recap • Movie will resume at{' '}
                    {formatTime(activeRecapResumePos ?? currentTimeSec)}
                  </Text>
                </View>
              </View>
            </View>

            <TVFocusGuideView style={styles.activeRecapFooter}>
              <Pressable
                style={[
                  styles.activeRecapResumeBtn,
                  focusedModalBtn === 'resume' && styles.activeRecapBtnFocused,
                ]}
                onFocus={() => setFocusedModalBtn('resume')}
                onPress={handleFinishActiveRecap}
                accessibilityRole="button"
                accessibilityLabel="Continue movie"
                hasTVPreferredFocus
                testID="btn-recap-modal-resume">
                <View style={styles.activeRecapResumeIcon}>
                  <Icon name="play" size={12} color="#0F172A" />
                </View>
                <Text style={styles.activeRecapResumeBtnText}>
                  Continue Movie
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.activeRecapSkipBtn,
                  focusedModalBtn === 'skip' && styles.activeRecapBtnFocused,
                ]}
                onFocus={() => setFocusedModalBtn('skip')}
                onPress={handleFinishActiveRecap}
                accessibilityRole="button"
                accessibilityLabel="Skip recap"
                testID="btn-recap-modal-skip">
                <Text style={styles.activeRecapSkipBtnText}>Skip Recap</Text>
              </Pressable>
            </TVFocusGuideView>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  playerContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    position: 'relative',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  surfaceWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  surfaceView: {
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 2,
  },
  loadingText: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    letterSpacing: 0.5,
  },
  centerStatusOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  centerStatusBadge: {
    backgroundColor: 'rgba(3, 7, 18, 0.85)',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  centerStatusText: {
    color: '#F8FAFC',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 2,
  },
  roomNoticeWrapper: {
    position: 'absolute',
    top: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 40,
  },
  roomNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
  },
  roomNoticeText: {
    color: '#E0F2FE',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  roomStatsPanel: {
    position: 'absolute',
    right: 48,
    top: '34%',
    width: 264,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'rgba(3, 7, 18, 0.5)',
    zIndex: 30,
  },
  roomStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  roomStatsDragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomStatsGrip: {
    width: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginRight: 8,
  },
  roomStatsGripDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(226, 232, 240, 0.55)',
  },
  roomStatsTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: '#FDE68A',
  },
  roomStatsDismiss: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  roomStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  roomStatsLabel: {
    fontSize: 13,
    color: 'rgba(226, 232, 240, 0.88)',
  },
  roomStatsValue: {
    fontSize: 19,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  roomStatsValueAlert: {
    color: '#FDE68A',
  },
  roomStatsArrival: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
  },
  roomStatsArrivalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7DD3FC',
  },
  roomStatsFootnote: {
    marginTop: 10,
    fontSize: 10,
    letterSpacing: 0.2,
    color: 'rgba(148, 163, 184, 0.9)',
  },
  protectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  protectionCard: {
    width: 760,
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.6)',
    padding: 36,
  },
  protectionBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#F59E0B',
    marginBottom: 10,
  },
  protectionTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  protectionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#CBD5E1',
    marginBottom: 10,
  },
  protectionHint: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 22,
  },
  protectionActions: {
    flexDirection: 'row',
  },
  protectionResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  protectionResumeIcon: {
    marginRight: 8,
  },
  protectionResumeText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'rgba(3, 7, 18, 0.75)',
    zIndex: 3,
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: 'rgba(3, 7, 18, 0.85)',
    zIndex: 3,
  },
  topHeader: {
    position: 'absolute',
    top: 36,
    left: 48,
    right: 48,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hudButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  hudButtonFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: colors.accentGold,
    transform: [{scale: 1.05}],
  },
  hudButtonIcon: {
    marginRight: 8,
  },
  hudButtonText: {
    fontSize: 15,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  titleGroup: {
    flex: 1,
    marginLeft: 32,
    marginRight: 24,
  },
  playerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingBadgeText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  metaDot: {
    color: '#64748B',
    fontSize: 13,
    marginHorizontal: 8,
  },
  metaText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  streamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  streamBadgePlaying: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  streamBadgePaused: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  streamDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  streamDotPlaying: {
    backgroundColor: '#10B981',
  },
  streamDotPaused: {
    backgroundColor: '#F59E0B',
  },
  streamBadgeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  visionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  visionToggleOn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: 'rgba(16, 185, 129, 0.6)',
  },
  visionToggleFocused: {
    borderColor: colors.accentGold,
    transform: [{scale: 1.05}],
  },
  visionToggleIcon: {
    marginRight: 8,
  },
  visionToggleText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  visionToggleTextOn: {
    color: '#6EE7B7',
  },
  familyToggleOn: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.6)',
  },
  familyToggleTextOn: {
    color: '#FDE68A',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 36,
    left: 48,
    right: 48,
    zIndex: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  timeLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 48,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  progressBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    marginHorizontal: 16,
    position: 'relative',
    overflow: 'visible',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentGold,
    borderRadius: 4,
  },
  progressBarThumb: {
    position: 'absolute',
    top: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: colors.accentGold,
    marginLeft: -8,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginRight: 16,
  },
  controlIcon: {
    marginRight: 8,
  },
  controlBtnFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.accentGold,
    transform: [{scale: 1.05}],
  },
  controlBtnText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  controlBtnTextFocused: {
    color: '#0F172A',
  },
  primaryControlBtn: {
    backgroundColor: colors.accentGold,
    borderColor: colors.accentGold,
    paddingHorizontal: 28,
  },
  primaryControlBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  recapBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  recapBtnIcon: {
    marginRight: 8,
  },
  recapBtnText: {
    color: '#FDE68A',
    fontSize: 15,
    fontWeight: '700',
  },

  // --- Room-Aware Recap Offer Banner Styles ---
  recapOfferBanner: {
    position: 'absolute',
    top: 80,
    right: 48,
    width: 360,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.45)',
    padding: 18,
    zIndex: 60,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.7,
    shadowRadius: 20,
  },
  recapOfferTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recapOfferBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.35)',
  },
  recapOfferBadgeText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginLeft: 5,
  },
  recapOfferTimer: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  recapOfferHeadline: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  recapOfferDetails: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  recapVoteRow: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recapVoteCount: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  recapVoteHint: {
    color: '#94A3B8',
    fontSize: 10,
  },
  recapOfferActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recapOfferBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  recapOfferShowBtn: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
  },
  recapOfferDismissBtn: {
    backgroundColor: 'rgba(51, 65, 85, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  recapOfferBtnFocused: {
    borderColor: '#FFFFFF',
    transform: [{scale: 1.04}],
    backgroundColor: '#FFFFFF',
  },
  recapOfferBtnIcon: {
    marginRight: 6,
  },
  recapOfferShowText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  recapOfferDismissText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },

  // --- Active Recap Experience Modal Styles ---
  activeRecapBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 18, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 90,
  },
  activeRecapCard: {
    width: 680,
    maxWidth: '90%',
    backgroundColor: '#0B1120',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    padding: 32,
    shadowColor: '#00E5FF',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.25,
    shadowRadius: 30,
  },
  activeRecapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 16,
  },
  activeRecapGlowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  activeRecapTitleBlock: {
    flex: 1,
  },
  activeRecapHeaderTag: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  activeRecapHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  activeRecapBody: {
    marginBottom: 24,
  },
  activeRecapNarrativeBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
  },
  activeRecapNarrativeHeading: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  activeRecapNarrativeText: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  activeRecapPointsList: {
    marginBottom: 14,
    paddingLeft: 6,
  },
  activeRecapPointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  activeRecapPointBullet: {
    color: '#00E5FF',
    fontSize: 14,
    marginRight: 8,
    marginTop: -1,
  },
  activeRecapPointText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  activeRecapNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  activeRecapNoticeText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 6,
  },
  activeRecapFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 14,
  },
  activeRecapResumeBtn: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeRecapSkipBtn: {
    backgroundColor: 'rgba(51, 65, 85, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  activeRecapBtnFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    transform: [{scale: 1.05}],
  },
  activeRecapResumeIcon: {
    marginRight: 8,
  },
  activeRecapResumeBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  activeRecapSkipBtnText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
});
