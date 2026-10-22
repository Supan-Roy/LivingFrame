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
import {MediaItem, TitleRecapMetadata, SceneSafetySegment} from '../types/catalog';
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

  // --- Phase 2: Attention-Aware Viewing state ---
  const [isAttentionPaused, setIsAttentionPaused] = useState<boolean>(false);
  const [attentionReplayOffer, setAttentionReplayOffer] = useState<{
    missedSec: number;
    replayPositionSec: number;
  } | null>(null);
  const [focusedAttentionBtn, setFocusedAttentionBtn] = useState<'keep_playing' | 'dismiss'>('keep_playing');
  const [focusedAttentionReplayBtn, setFocusedAttentionReplayBtn] = useState<'replay' | 'dismiss'>('replay');

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
  const [focusedProtectionBtn, setFocusedProtectionBtn] = useState<'resume' | 'exit'>('resume');
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

  const isProtectionBlockedRef = useRef<boolean>(false);

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
      console.info('[LivingFrame Video] Event: canplay');
      if (isMountedRef.current) {
        setIsVideoLoading(false);
        if (isProtectionBlockedRef.current) {
          console.info('[LivingFrame Video] Blocked by family protection on canplay, holding playback');
          pausedByProtectionRef.current = true;
          try {
            player.pause();
          } catch (_e) {
            // Ignore pause errors during state transition
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
        } else {
          player.play().catch(e => {
            console.warn('[LivingFrame Video] play notice:', e);
          });
        }
      }
    };

    const onPlaying = () => {
      console.info('[LivingFrame Video] Event: playing');
      if (isMountedRef.current) {
        if (isProtectionBlockedRef.current) {
          console.info('[LivingFrame Video] Blocked on playing event, pausing immediately');
          pausedByProtectionRef.current = true;
          try {
            player.pause();
          } catch (_e) {
            // Ignore pause errors during state transition
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
          return;
        }
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
    if (isProtectionBlockedRef.current) {
      console.info('[LivingFrame Video] Play requested but content is protected');
      return;
    }
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
    if (isProtectionBlockedRef.current) {
      console.info('[LivingFrame Video] Toggle requested but content is protected');
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
        case 'PAUSE_ATTENTION': {
          if (isPlayingRef.current) {
            handlePause();
          }
          setIsAttentionPaused(true);
          showRoomNotice('Attention paused · Viewers turned away');
          break;
        }
        case 'RESUME_ATTENTION': {
          setIsAttentionPaused(false);
          if (action.offerReplay && action.missedSec >= 4) {
            setAttentionReplayOffer({
              missedSec: action.missedSec,
              replayPositionSec: action.replayPositionSec,
            });
          }
          if (action.autoResume && !isPlayingRef.current) {
            handlePlay();
          }
          showRoomNotice('Attention returned · Resuming');
          break;
        }
        case 'OVERRIDE_ATTENTION': {
          setIsAttentionPaused(false);
          if (action.resume && !isPlayingRef.current) {
            handlePlay();
          }
          showRoomNotice('Playback continuing (Thumbs Up 👍)');
          break;
        }
        case 'NONE':
        default:
          break;
      }
    },
    [handlePause, handlePlay, seekTo, showRoomNotice],
  );

  const handleKeepPlaying = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      const action = engine.overrideAttention(Date.now());
      handlePolicyAction(action);
    }
  }, [handlePolicyAction]);

  const handleAcceptAttentionReplay = useCallback(() => {
    if (!attentionReplayOffer) {
      return;
    }
    const replayPos = attentionReplayOffer.replayPositionSec;
    const missed = Math.round(attentionReplayOffer.missedSec);
    setAttentionReplayOffer(null);
    engineRef.current?.dismissAttentionOffer();
    seekTo(replayPos);
    handlePlay();
    showRoomNotice(`Rewound ${missed}s`);
  }, [attentionReplayOffer, seekTo, handlePlay, showRoomNotice]);

  const handleDismissAttentionReplay = useCallback(() => {
    setAttentionReplayOffer(null);
    engineRef.current?.dismissAttentionOffer();
  }, []);

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

  // React to attention state changes (Phase 2: Attention-Aware Viewing)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    const action = engine.onAttentionChange({
      attentiveCount: roomState.attentiveCount,
      distractedCount: roomState.distractedCount,
      totalViewers: roomState.viewersPresent,
      nowMs: Date.now(),
    });
    if (action.type !== 'NONE') {
      handlePolicyAction(action);
    }
  }, [
    roomState.attentiveCount,
    roomState.distractedCount,
    roomState.isDistracted,
    roomState.viewersPresent,
    handlePolicyAction,
  ]);

  // Grace period and offer auto-dismiss ticker (200ms)
  useEffect(() => {
    const interval = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) {
        return;
      }
      if (isPlayingRef.current && playbackStartWallRef.current !== null && item) {
        const elapsed = (Date.now() - playbackStartWallRef.current) / 1000 + pausedOffsetRef.current;
        const cur = durationSec > 0 ? elapsed % durationSec : elapsed;
        engine.updatePlaybackState({
          titleId: item.id,
          durationSec,
          currentPositionSec: Math.min(durationSec, Math.max(0, cur)),
          isPlaying: isPlayingRef.current,
          metadata: item.recap,
        });
      }
      const action = engine.checkGracePeriod(Date.now());
      if (action.type !== 'NONE') {
        handlePolicyAction(action);
      }
      if (engine.recapOffer) {
        setRecapOffer({...engine.recapOffer});
      }
      if (engine.attentionReplayOffer) {
        setAttentionReplayOffer({
          missedSec: engine.attentionReplayOffer.missedSec,
          replayPositionSec: engine.attentionReplayOffer.replayPositionSec,
        });
      } else if (attentionReplayOffer && !engine.attentionReplayOffer) {
        setAttentionReplayOffer(null);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [handlePolicyAction, attentionReplayOffer, durationSec, item]);

  // --- Family Mode / room-aware protection --------------------------------
  // A child in the room (detected, or already present when Family Mode is switched on)
  // is what arms the policy. `childPresent` is a body-proportion estimate, not identity.
  const rawSafetySegments = (item?.sceneSafety && item.sceneSafety.length > 0)
    ? item.sceneSafety
    : (item?.id === 'behind-the-screams' || item?.contentRating === 'TV-14' || item?.contentRating === 'TV-MA' || item?.category === 'Horror')
      ? [{
          startSec: 0,
          endSec: durationSec || 86400,
          category: 'adult_content' as const,
          action: 'pause' as const,
          resumeSec: 0,
          note: 'Content rated TV-14/TV-MA or Horror not suitable for children',
        }]
      : [];

  const safetySegments: SceneSafetySegment[] = rawSafetySegments.map(s => ({
    ...s,
    // For adult content or Behind The Screams, ensure protection spans the entire movie
    // so it doesn't prematurely expire after a 10s demo window
    endSec: (item?.id === 'behind-the-screams' || s.category === 'adult_content')
      ? Math.max(s.endSec, durationSec || 86400)
      : s.endSec,
  }));

  const blockedSegment = findBlockingSegment({
    familyModeEnabled: roomState.familyModeEnabled,
    armed: roomState.childPresent,
    override: protectionOverride,
    segments: safetySegments,
    currentTimeSec,
  });
  const isProtectionBlocked = blockedSegment !== null;
  isProtectionBlockedRef.current = isProtectionBlocked;

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

  // Turning Family Mode off or child leaving the room clears any viewer override.
  useEffect(() => {
    if (!roomState.familyModeEnabled || !roomState.childPresent) {
      setProtectionOverride(false);
    }
  }, [roomState.familyModeEnabled, roomState.childPresent]);

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
    console.info(
      `[LivingFrame] Family Mode blocked a "${blockedSegment.category}" segment`,
    );
    pausedByProtectionRef.current = true;
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch (_e) {
        // Ignore pause errors when already stopped
      }
    }
    if (playbackStartWallRef.current !== null) {
      const elapsed = (Date.now() - playbackStartWallRef.current) / 1000 + pausedOffsetRef.current;
      pausedOffsetRef.current = durationSec > 0 ? elapsed % durationSec : elapsed;
    }
    playbackStartWallRef.current = null;
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [isProtectionBlocked, blockedSegment, currentTimeSec, durationSec, seekRelative]);

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
          showGestureFeedback(
            `Vote: ${engine.recapOffer?.currentVotes || 1}/${engine.recapOffer?.eligibleViewers || 2} 👍`,
          );
          if (engine.recapOffer) {
            setRecapOffer({...engine.recapOffer});
          }
        }
      } else if (engine) {
        // Phase 2: Thumbs-up overrides inattention and allows playback to continue
        const action = engine.overrideAttention(Date.now());
        handlePolicyAction(action);
        showGestureFeedback('Keep Playing 👍');
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

    // If protection is blocking playback, handle back to exit or select to continue anyway
    if (isProtectionBlocked) {
      if (eventType === 'back') {
        onClose();
      } else if (eventType === 'left') {
        setFocusedProtectionBtn('resume');
      } else if (eventType === 'right') {
        setFocusedProtectionBtn('exit');
      } else if (eventType === 'select') {
        if (focusedProtectionBtn === 'exit') {
          onClose();
        } else {
          setProtectionOverride(true);
        }
      }
      return;
    }

    // Phase 2: If attention-aware pause prompt is active, select or play resumes playback
    if (isAttentionPaused) {
      if (eventType === 'back') {
        onClose();
      } else if (eventType === 'select' || eventType === 'play' || eventType === 'play_pause') {
        handleKeepPlaying();
      }
      return;
    }

    // Phase 2: If attention replay offer banner is active, allow remote selection
    if (attentionReplayOffer && !isShowingRecap) {
      if (eventType === 'left') {
        setFocusedAttentionReplayBtn('replay');
        return;
      } else if (eventType === 'right') {
        setFocusedAttentionReplayBtn('dismiss');
        return;
      } else if (eventType === 'select') {
        if (focusedAttentionReplayBtn === 'replay') {
          handleAcceptAttentionReplay();
        } else {
          handleDismissAttentionReplay();
        }
        return;
      } else if (eventType === 'back') {
        handleDismissAttentionReplay();
        return;
      }
    }

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
            <Text style={styles.protectionBadge}>FAMILY SAFETY SHIELD</Text>
            <Text style={styles.protectionTitle}>Playback paused</Text>
            <Text style={styles.protectionText}>
              A child was detected in the room during content tagged for{' '}
              {blockedSegment.category.replace('_', ' ')}. This content is not family-safe.
            </Text>
            <Text style={styles.protectionHint}>
              Playback will automatically resume when the child leaves the room.
            </Text>
            <TVFocusGuideView style={styles.protectionActions}>
              <Pressable
                style={[
                  styles.protectionResumeBtn,
                  focusedProtectionBtn === 'resume' && styles.protectionResumeBtnFocused,
                ]}
                onFocus={() => setFocusedProtectionBtn('resume')}
                onPress={() => setProtectionOverride(true)}
                accessibilityRole="button"
                accessibilityLabel="Continue anyway"
                hasTVPreferredFocus
                testID="btn-protection-resume">
                <View style={styles.protectionResumeIcon}>
                  <Icon name="play" size={13} color="#0F172A" />
                </View>
                <Text style={styles.protectionResumeText}>Continue anyway</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.protectionExitBtn,
                  focusedProtectionBtn === 'exit' && styles.protectionExitBtnFocused,
                ]}
                onFocus={() => setFocusedProtectionBtn('exit')}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Exit"
                testID="btn-protection-exit">
                <View style={styles.protectionExitIcon}>
                  <Icon name="close" size={13} color="#F8FAFC" />
                </View>
                <Text style={styles.protectionExitText}>Exit</Text>
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

          {/* Real-time voting stat card whenever recap offer is present */}
          <View style={styles.recapVoteRow} testID="recap-vote-stat-card">
            <View style={styles.recapVoteHeader}>
              <View style={styles.recapVoteHeaderLeft}>
                <Icon name="spark" size={11} color="#F59E0B" />
                <Text style={styles.recapVoteHeaderTitle}>CONSENSUS VOTE</Text>
              </View>
              <View style={styles.recapVoteLiveBadge}>
                <View style={styles.recapVoteLiveDot} />
                <Text style={styles.recapVoteLiveText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.recapVoteStatsRow}>
              <Text style={styles.recapVoteCount}>
                Consensus: {recapOffer.currentVotes} / {recapOffer.requiredVotes} votes
              </Text>
              <Text style={styles.recapVoteFraction}>
                {recapOffer.currentVotes}/{recapOffer.eligibleViewers}
              </Text>
            </View>

            {/* Visual vote progress bar */}
            <View style={styles.recapVoteBarTrack}>
              <View
                style={[
                  styles.recapVoteBarFill,
                  {
                    width: `${Math.min(
                      100,
                      (recapOffer.currentVotes / Math.max(1, recapOffer.eligibleViewers)) * 100,
                    )}%`,
                  },
                ]}
              />
            </View>

            <Text style={styles.recapVoteHint}>
              Thumbs-up 👍 gesture or Remote to cast vote
            </Text>
          </View>

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

      {/* Phase 2: Attention-Aware Viewing - Subtle Pause Prompt */}
      {isAttentionPaused && (
        <View style={styles.attentionPromptOverlay} testID="attention-prompt-overlay">
          <View style={styles.attentionPromptCard}>
            <View style={styles.attentionPromptIconBox}>
              <Icon name="spark" size={18} color="#00E5FF" />
            </View>
            <View style={styles.attentionPromptContent}>
              <View style={styles.attentionPromptBadge}>
                <View style={styles.attentionPromptPulseDot} />
                <Text style={styles.attentionPromptBadgeText}>ATTENTION-AWARE VIEWING</Text>
              </View>
              <Text style={styles.attentionPromptTitle}>Playback paused</Text>
              <Text style={styles.attentionPromptSubtitle}>
                Viewers appear turned away from the TV. Look toward the screen to resume, or give a thumbs-up to keep playing.
              </Text>
            </View>
            <TVFocusGuideView style={styles.attentionPromptActions}>
              <Pressable
                style={[
                  styles.attentionPromptBtn,
                  focusedAttentionBtn === 'keep_playing' && styles.attentionPromptBtnFocused,
                ]}
                onFocus={() => setFocusedAttentionBtn('keep_playing')}
                onPress={handleKeepPlaying}
                hasTVPreferredFocus
                accessibilityRole="button"
                accessibilityLabel="Keep playing"
                testID="btn-attention-keep-playing">
                <Text style={styles.attentionPromptBtnText}>Keep Playing 👍</Text>
              </Pressable>
            </TVFocusGuideView>
          </View>
        </View>
      )}

      {/* Phase 2: Optional Replay / Recap Offer after returning attention */}
      {attentionReplayOffer && !isShowingRecap && !isAttentionPaused && (
        <View style={styles.attentionReplayBanner} testID="attention-replay-banner">
          <View style={styles.attentionReplayLeft}>
            <View style={styles.attentionReplayBadge}>
              <Icon name="spark" size={12} color="#00E5FF" />
              <Text style={styles.attentionReplayBadgeText}>WELCOME BACK</Text>
            </View>
            <Text style={styles.attentionReplayTitle}>
              Missed ~{Math.round(attentionReplayOffer.missedSec)}s while turned away?
            </Text>
            <Text style={styles.attentionReplaySubtitle}>
              Optional rewind to catch up before continuing
            </Text>
          </View>
          <TVFocusGuideView style={styles.attentionReplayActions}>
            <Pressable
              style={[
                styles.attentionReplayBtn,
                styles.attentionReplayAcceptBtn,
                focusedAttentionReplayBtn === 'replay' && styles.attentionReplayBtnFocused,
              ]}
              onFocus={() => setFocusedAttentionReplayBtn('replay')}
              onPress={handleAcceptAttentionReplay}
              accessibilityRole="button"
              accessibilityLabel="Replay missed portion"
              testID="btn-attention-replay-accept">
              <Text style={styles.attentionReplayAcceptText}>
                Rewind {Math.round(attentionReplayOffer.missedSec)}s
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.attentionReplayBtn,
                styles.attentionReplayDismissBtn,
                focusedAttentionReplayBtn === 'dismiss' && styles.attentionReplayBtnFocused,
              ]}
              onFocus={() => setFocusedAttentionReplayBtn('dismiss')}
              onPress={handleDismissAttentionReplay}
              accessibilityRole="button"
              accessibilityLabel="Dismiss replay offer"
              testID="btn-attention-replay-dismiss">
              <Text style={styles.attentionReplayDismissText}>Dismiss</Text>
            </Pressable>
          </TVFocusGuideView>
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
    backgroundColor: 'rgba(5, 8, 16, 0.98)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
    elevation: 200,
  },
  protectionCard: {
    width: 760,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#F59E0B',
    padding: 36,
    shadowColor: '#F59E0B',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 210,
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
    alignItems: 'center',
    gap: 14,
  },
  protectionResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 10,
  },
  protectionResumeBtnFocused: {
    backgroundColor: '#FFFFFF',
    transform: [{scale: 1.05}],
    shadowColor: '#F59E0B',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  protectionResumeIcon: {
    marginRight: 8,
  },
  protectionResumeText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  protectionExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(51, 65, 85, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  protectionExitBtnFocused: {
    backgroundColor: 'rgba(71, 85, 105, 0.95)',
    borderColor: '#FFFFFF',
    transform: [{scale: 1.05}],
  },
  protectionExitIcon: {
    marginRight: 8,
  },
  protectionExitText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
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
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  recapVoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recapVoteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recapVoteHeaderTitle: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  recapVoteLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  recapVoteLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#EF4444',
  },
  recapVoteLiveText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  recapVoteStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recapVoteCount: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
  },
  recapVoteFraction: {
    color: '#00E5FF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  recapVoteBarTrack: {
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  recapVoteBarFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 3,
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

  // --- Phase 2: Attention-Aware Viewing Styles ---
  attentionPromptOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 8, 18, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 90,
  },
  attentionPromptCard: {
    backgroundColor: '#0F172A',
    borderColor: '#00E5FF',
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 28,
    maxWidth: 580,
    width: '88%',
    alignItems: 'center',
    shadowColor: '#00E5FF',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  attentionPromptIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  attentionPromptContent: {
    alignItems: 'center',
    marginBottom: 20,
  },
  attentionPromptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderColor: 'rgba(0, 229, 255, 0.35)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  attentionPromptPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#00E5FF',
    marginRight: 7,
  },
  attentionPromptBadgeText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  attentionPromptTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  attentionPromptSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  attentionPromptActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  attentionPromptBtn: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  attentionPromptBtnFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    transform: [{scale: 1.05}],
  },
  attentionPromptBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },

  // Attention Replay / Recap Banner
  attentionReplayBanner: {
    position: 'absolute',
    bottom: 110,
    left: '50%',
    marginLeft: -290,
    width: 580,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderColor: 'rgba(0, 229, 255, 0.4)',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 85,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  attentionReplayLeft: {
    flex: 1,
    marginRight: 16,
  },
  attentionReplayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  attentionReplayBadgeText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  attentionReplayTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  attentionReplaySubtitle: {
    color: '#94A3B8',
    fontSize: 11,
  },
  attentionReplayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attentionReplayBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
  },
  attentionReplayAcceptBtn: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
  },
  attentionReplayDismissBtn: {
    backgroundColor: 'rgba(51, 65, 85, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  attentionReplayBtnFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    transform: [{scale: 1.05}],
  },
  attentionReplayAcceptText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  attentionReplayDismissText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
});
