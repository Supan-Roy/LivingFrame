import React, {useState, useRef, useEffect, useCallback} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Dimensions,
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
import {MediaItem} from '../types/catalog';
import {colors} from '../theme/theme';
import {useRoom} from '../context/RoomContext';
import {GestureReactionOverlay} from './GestureReactionOverlay';

export interface VideoPlayerViewProps {
  item: MediaItem | null;
  visible?: boolean;
  onClose: () => void;
  onRoomRecap: (item: MediaItem) => void;
}

const sendDebugLog = (msg: string) => {
  console.info(`[LivingFrame Video] ${msg}`);
  try {
    fetch('http://10.0.2.2:8080/telemetry/log', {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: `[PLAYER] ${msg}`,
    }).catch(() => {});
  } catch (_e) {}
};

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
      : 10,
  );
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(true);
  const [focusedControl, setFocusedControl] = useState<
    'back' | 'play' | 'restart' | 'recap'
  >('play');

  const playerRef = useRef<VideoPlayer | null>(null);
  const surfaceHandleRef = useRef<string | null>(null);
  const isPlayingRef = useRef<boolean>(true);
  const isMountedRef = useRef<boolean>(true);
  const {roomState} = useRoom();

  const targetSrc = item?.videoUrl || (item?.id ? `http://10.0.2.2:8080/videos/${item.id}.mp4` : '');

  // Manage VideoPlayer lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    setIsVideoLoading(true);
    setCurrentTimeSec(0);
    setIsPlaying(true);
    isPlayingRef.current = true;

    sendDebugLog(`Creating new VideoPlayer instance for item: ${item?.id} src=${targetSrc}`);
    const player = new VideoPlayer();
    playerRef.current = player;

    const onLoadedMetadata = () => {
      const dur = player.duration;
      sendDebugLog(`EVENT: loadedmetadata duration=${dur}`);
      if (dur && !isNaN(dur) && dur > 0) {
        setDurationSec(Math.round(dur));
      }
    };

    const onCanPlay = () => {
      sendDebugLog('EVENT: canplay -> calling player.play()');
      if (isMountedRef.current) {
        setIsVideoLoading(false);
        player.play().catch(e => {
          sendDebugLog(`play notice: ${e}`);
        });
      }
    };

    const onPlaying = () => {
      sendDebugLog('EVENT: playing');
      if (isMountedRef.current) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        setIsVideoLoading(false);
      }
    };

    const onTimeUpdate = () => {
      if (!isMountedRef.current) return;
      const ct = player.currentTime;
      sendDebugLog(`EVENT: timeupdate ct=${ct}`);
      if (ct != null && !isNaN(ct)) {
        setCurrentTimeSec(Math.floor(ct));
      }
      const dur = player.duration;
      if (dur && !isNaN(dur) && dur > 0) {
        setDurationSec(Math.round(dur));
      }
      setIsVideoLoading(false);
    };

    const onPause = () => {
      sendDebugLog('EVENT: pause');
      if (isMountedRef.current) {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    };

    const onError = () => {
      const err = player.error;
      sendDebugLog(`EVENT: error code=${err?.code} msg=${err?.message}`);
      if (isMountedRef.current) {
        setIsVideoLoading(false);
      }
    };

    const onEnded = () => {
      sendDebugLog('EVENT: ended -> looping');
      try {
        player.currentTime = 0;
        player.play().catch(() => {});
      } catch (_e) {}
    };

    player
      .initialize()
      .then(() => {
        sendDebugLog('VideoPlayer initialized successfully');
        player.addEventListener('loadedmetadata', onLoadedMetadata);
        player.addEventListener('canplay', onCanPlay);
        player.addEventListener('playing', onPlaying);
        player.addEventListener('timeupdate', onTimeUpdate);
        player.addEventListener('pause', onPause);
        player.addEventListener('error', onError);
        player.addEventListener('ended', onEnded);

        player.autoplay = false;
        player.muted = true;

        if (surfaceHandleRef.current) {
          sendDebugLog(`Attaching existing surface handle ${surfaceHandleRef.current}`);
          player.setSurfaceHandle(surfaceHandleRef.current);
          player.src = targetSrc;
          player.load();
        }
      })
      .catch(err => {
        sendDebugLog(`VideoPlayer initialize error: ${err}`);
      });

    return () => {
      isMountedRef.current = false;
      sendDebugLog(`Tearing down VideoPlayer for item: ${item?.id}`);
      try {
        player.pause();
        if (surfaceHandleRef.current) {
          player.clearSurfaceHandle(surfaceHandleRef.current);
        }
        player.removeEventListener('loadedmetadata', onLoadedMetadata);
        player.removeEventListener('canplay', onCanPlay);
        player.removeEventListener('playing', onPlaying);
        player.removeEventListener('timeupdate', onTimeUpdate);
        player.removeEventListener('pause', onPause);
        player.removeEventListener('error', onError);
        player.removeEventListener('ended', onEnded);
        player.deinitialize().catch(() => {});
      } catch (e) {
        sendDebugLog(`Error during player deinit: ${e}`);
      }
      playerRef.current = null;
    };
  }, [item?.id, targetSrc]);

  const handleSurfaceCreated = useCallback(
    (handle: string) => {
      sendDebugLog(`EVENT: onSurfaceViewCreated handle=${handle}`);
      surfaceHandleRef.current = handle;
      if (playerRef.current) {
        try {
          playerRef.current.setSurfaceHandle(handle);
          playerRef.current.src = targetSrc;
          playerRef.current.load();
        } catch (e) {
          sendDebugLog(`Error in setSurfaceHandle/load: ${e}`);
        }
      }
    },
    [targetSrc],
  );

  const handleSurfaceDestroyed = useCallback((handle: string) => {
    sendDebugLog(`EVENT: onSurfaceViewDestroyed handle=${handle}`);
    if (playerRef.current) {
      try {
        playerRef.current.clearSurfaceHandle(handle);
      } catch (e) {
        sendDebugLog(`Error in clearSurfaceHandle: ${e}`);
      }
    }
    surfaceHandleRef.current = null;
  }, []);

  // Playback control functions
  const handlePlay = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.play().catch(e => sendDebugLog(`play error: ${e}`));
      } catch (e) {
        console.warn('[LivingFrame Video] play notice:', e);
      }
    }
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, []);

  const handlePause = useCallback(() => {
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
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [isVideoLoading]);

  const handleTogglePlay = useCallback(() => {
    if (isVideoLoading) {
      console.info('[LivingFrame Video] Ignoring toggle while video is loading');
      return;
    }
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying, isVideoLoading, handlePause, handlePlay]);

  const handleRestart = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.currentTime = 0;
        playerRef.current.play().catch(e => sendDebugLog(`restart play error: ${e}`));
      } catch (e) {
        console.warn('[LivingFrame Video] restart notice:', e);
      }
    }
    setCurrentTimeSec(0);
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, []);

  // Hardware remote key event listener
  useTVEventHandler((evt: HWEvent) => {
    if (!visible || !evt || !evt.eventType) {
      return;
    }
    const eventType = evt.eventType.toLowerCase();
    if (eventType === 'play' || eventType === 'media_play') {
      handlePlay();
    } else if (eventType === 'pause' || eventType === 'media_pause') {
      handlePause();
    } else if (eventType === 'rewind' || eventType === 'media_rewind') {
      if (playerRef.current) {
        playerRef.current.currentTime = Math.max(
          0,
          (playerRef.current.currentTime || 0) - 10,
        );
      }
    } else if (eventType === 'fastforward' || eventType === 'media_fast_forward') {
      if (playerRef.current) {
        playerRef.current.currentTime = Math.min(
          durationSec,
          (playerRef.current.currentTime || 0) + 10,
        );
      }
    }
  });

  if (!item || visible === false) {
    return null;
  }

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent =
    durationSec > 0
      ? Math.min(100, Math.max(0, (currentTimeSec / durationSec) * 100))
      : 0;

  return (
    <View style={styles.playerContainer} testID="livingframe-videoplayer-view">
      {/* 1. Hardware Accelerated Native Video rendered by Vega Media Engine */}
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

      {/* 2. Buffering / Loading Indicator */}
      {isVideoLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accentGold} />
          <Text style={styles.loadingText}>Connecting Video Stream...</Text>
        </View>
      )}

      {/* 3. Subtle Edge Vignettes for Navigation Legibility */}
      <View style={styles.topVignette} pointerEvents="none" />
      <View style={styles.bottomVignette} pointerEvents="none" />

      {/* 4. Live Room Awareness Gesture Reaction Overlay */}
      <GestureReactionOverlay onOpenRecap={() => onRoomRecap(item)} />

      {/* 5. Top Navigation & Info HUD */}
      <View style={styles.topHeader}>
        <TVFocusGuideView style={styles.headerRow}>
          <Pressable
            style={[
              styles.hudButton,
              focusedControl === 'back' && styles.hudButtonFocused,
            ]}
            onFocus={() => setFocusedControl('back')}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Back to Browse"
            testID="btn-player-back">
            <Text style={styles.hudButtonIcon}>←</Text>
            <Text style={styles.hudButtonText}>Back to Browse</Text>
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
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaEngineText}>Vega Media Engine</Text>
            </View>
          </View>

          {/* Room Sensing Status Indicator */}
          <View style={styles.ambientPill}>
            <View
              style={[
                styles.ambientDot,
                roomState.sensorStatus === 'active' && styles.ambientDotActive,
              ]}
            />
            <Text style={styles.ambientPillText}>
              {roomState.activeGesture
                ? `ROOM: ${roomState.activeGesture.toUpperCase()}`
                : roomState.sensorStatus === 'active'
                ? 'ROOM SENSOR ACTIVE'
                : 'AMBIENT SYNC ON'}
            </Text>
          </View>
        </TVFocusGuideView>
      </View>

      {/* 6. Center Pause Watermark Indicator */}
      {!isPlaying && (
        <View style={styles.pausedIndicator} pointerEvents="none">
          <View style={styles.pausedBadge}>
            <Text style={styles.pausedIcon}>⏸</Text>
            <Text style={styles.pausedText}>PAUSED</Text>
          </View>
        </View>
      )}

      {/* 7. Bottom Cinema Playback Control Bar */}
      <View style={styles.bottomControls}>
        {/* Progress Bar & Real Time Stamps */}
        <View style={styles.progressRow}>
          <Text style={styles.timeLabel}>{formatTime(currentTimeSec)}</Text>
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
          <Text style={styles.timeLabel}>{formatTime(durationSec)}</Text>
        </View>

        {/* Interactive TV Remote Control Buttons */}
        <TVFocusGuideView style={styles.controlsRow}>
          <Pressable
            style={[
              styles.controlBtn,
              styles.primaryControlBtn,
              focusedControl === 'play' && styles.controlBtnFocused,
            ]}
            onFocus={() => setFocusedControl('play')}
            onPress={handleTogglePlay}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
            testID="btn-player-toggle">
            <Text style={styles.primaryControlBtnText}>
              {isPlaying ? '⏸  Pause' : '▶  Resume'}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.controlBtn,
              focusedControl === 'restart' && styles.controlBtnFocused,
            ]}
            onFocus={() => setFocusedControl('restart')}
            onPress={handleRestart}
            accessibilityRole="button"
            accessibilityLabel="Restart video from beginning"
            testID="btn-player-restart">
            <Text style={styles.controlBtnText}>↺  Restart</Text>
          </Pressable>

          <Pressable
            style={[
              styles.controlBtn,
              styles.recapBtn,
              focusedControl === 'recap' && styles.controlBtnFocused,
            ]}
            onFocus={() => setFocusedControl('recap')}
            onPress={() => onRoomRecap(item)}
            accessibilityRole="button"
            accessibilityLabel="Open ambient room context recap"
            testID="btn-player-recap">
            <Text style={styles.recapBtnIcon}>⚡</Text>
            <Text style={styles.recapBtnText}>Room Context</Text>
          </Pressable>
        </TVFocusGuideView>
      </View>
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
    fontSize: 18,
    color: '#F8FAFC',
    marginRight: 8,
    fontWeight: '700',
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
  metaEngineText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
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
  ambientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(3, 7, 18, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  ambientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#64748B',
    marginRight: 8,
  },
  ambientDotActive: {
    backgroundColor: '#38BDF8',
  },
  ambientPillText: {
    color: '#E0F2FE',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pausedIndicator: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(3, 7, 18, 0.85)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  pausedIcon: {
    fontSize: 24,
    color: '#F8FAFC',
    marginRight: 12,
  },
  pausedText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 2,
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
    fontSize: 16,
    color: '#F59E0B',
    marginRight: 8,
  },
  recapBtnText: {
    color: '#FDE68A',
    fontSize: 15,
    fontWeight: '700',
  },
});
