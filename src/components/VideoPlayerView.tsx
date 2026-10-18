import React, {useState, useRef, useEffect, useCallback} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  Pressable,
  Dimensions,
} from 'react-native';
import {
  TVFocusGuideView,
  useTVEventHandler,
  HWEvent,
} from '@amazon-devices/react-native-kepler';
import {Video} from '@amazon-devices/react-native-w3cmedia';
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

export const VideoPlayerView = ({
  item,
  visible = true,
  onClose,
  onRoomRecap,
}: VideoPlayerViewProps) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(
    item?.durationSec && item.durationSec > 0 ? item.durationSec : 120,
  );
  const [focusedControl, setFocusedControl] = useState<
    'back' | 'play' | 'restart' | 'recap'
  >('play');

  const {width: windowWidth = 1920, height: windowHeight = 1080} =
    Dimensions.get('window') || {};
  const videoRef = useRef<Video>(null);
  const {roomState} = useRoom();

  // Reset progress when item changes
  useEffect(() => {
    if (visible && item) {
      setIsPlaying(true);
      setIsVideoLoaded(false);
      setCurrentTimeSec(0);
      setDurationSec(item.durationSec > 0 ? item.durationSec : 120);
      setFocusedControl('play');
    }
  }, [visible, item]);

  // Remote key handling for media playback
  useTVEventHandler((evt: HWEvent) => {
    if (!visible || !evt || !evt.eventType) {
      return;
    }
    const eventType = evt.eventType.toLowerCase();
    if (eventType === 'play' || eventType === 'media_play') {
      handlePlay();
    } else if (eventType === 'pause' || eventType === 'media_pause') {
      handlePause();
    } else if (
      eventType === 'play_pause' ||
      eventType === 'media_play_pause' ||
      eventType === 'space'
    ) {
      handleTogglePlay();
    } else if (eventType === 'rewind' || eventType === 'media_rewind') {
      handleRestart();
    }
  });

  const handlePlay = useCallback(() => {
    if (videoRef.current) {
      try {
        if (
          videoRef.current.currentTime != null &&
          videoRef.current.duration != null &&
          videoRef.current.currentTime >= videoRef.current.duration
        ) {
          videoRef.current.currentTime = 0;
          setCurrentTimeSec(0);
        }
        videoRef.current.play();
      } catch (e) {
        console.warn('[LivingFrame Video] video.play() notice:', e);
      }
    }
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    if (videoRef.current && typeof videoRef.current.pause === 'function') {
      try {
        videoRef.current.pause();
      } catch (e) {
        console.warn('[LivingFrame Video] video.pause() notice:', e);
      }
    }
    setIsPlaying(false);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying, handlePause, handlePlay]);

  const handleRestart = useCallback(() => {
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = 0;
      } catch (e) {
        console.warn('[LivingFrame Video] resetting currentTime notice:', e);
      }
    }
    setCurrentTimeSec(0);
    handlePlay();
  }, [handlePlay]);

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

  const playerWidth = windowWidth > 0 ? windowWidth : 1920;
  const playerHeight = windowHeight > 0 ? windowHeight : 1080;

  return (
    <View style={styles.playerContainer} testID="livingframe-videoplayer-view">
      {/* 1. Underlying Poster Backdrop (visible while video stream buffers) */}
      {!isVideoLoaded && item.posterUrl ? (
        <Image
          source={{uri: item.posterUrl}}
          style={styles.posterBackdrop}
          resizeMode="cover"
        />
      ) : null}

      {/* 2. Hardware Accelerated Native Video Surface */}
      {item.videoUrl ? (
        <View style={styles.videoSurfaceWrapper}>
          <Video
            ref={videoRef}
            testID="native-video-surface"
            src={item.videoUrl}
            autoplay={true}
            loop={true}
            controls={false}
            showCaptions={false}
            scalingmode="fit"
            width={playerWidth}
            height={playerHeight}
            style={styles.nativeVideo}
            onLoadStart={() => {
              console.log('[LivingFrame Video] Stream load started:', item.videoUrl);
            }}
            onLoadedMetadata={() => {
              console.log(
                '[LivingFrame Video] Metadata loaded, duration:',
                videoRef.current?.duration,
              );
              if (
                videoRef.current?.duration != null &&
                videoRef.current.duration > 0
              ) {
                setDurationSec(Math.floor(videoRef.current.duration));
              }
            }}
            onCanPlay={() => {
              console.log('[LivingFrame Video] Stream ready to play');
              setIsVideoLoaded(true);
            }}
            onTimeUpdate={() => {
              if (videoRef.current?.currentTime != null) {
                setCurrentTimeSec(Math.floor(videoRef.current.currentTime));
              }
              if (
                videoRef.current?.duration != null &&
                videoRef.current.duration > 0
              ) {
                setDurationSec(Math.floor(videoRef.current.duration));
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              console.log('[LivingFrame Video] Stream ended');
              setIsPlaying(false);
            }}
            onError={(e) => {
              console.warn('[LivingFrame Video] Native stream notice:', e);
            }}
          />
        </View>
      ) : null}

      {/* 3. Cinema Edge Overlays (subtle, non-obtrusive) */}
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
              <Text style={styles.metaText}>1080p Full HD</Text>
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
        <View style={styles.pausedIndicator}>
          <View style={styles.pausedBadge}>
            <Text style={styles.pausedIcon}>⏸</Text>
            <Text style={styles.pausedText}>PAUSED</Text>
          </View>
        </View>
      )}

      {/* 7. Bottom Cinema Playback Control Bar */}
      <View style={styles.bottomControls}>
        {/* Progress Bar & Time Stamps */}
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
            hasTVPreferredFocus={true}
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
    backgroundColor: '#030712',
    position: 'relative',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  videoSurfaceWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  nativeVideo: {
    width: '100%',
    height: '100%',
  },
  posterBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    opacity: 0.7,
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(3, 7, 18, 0.45)',
    zIndex: 2,
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'rgba(3, 7, 18, 0.55)',
    zIndex: 2,
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
    color: '#06B6D4',
    fontSize: 13,
    fontWeight: '600',
  },
  ambientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  ambientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#64748B',
    marginRight: 8,
  },
  ambientDotActive: {
    backgroundColor: '#10B981',
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
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 36,
  },
  pausedIcon: {
    fontSize: 22,
    color: '#F8FAFC',
    marginRight: 12,
  },
  pausedText: {
    fontSize: 18,
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
    color: '#CBD5E1',
    fontSize: 15,
    fontFamily: 'monospace',
    fontWeight: '600',
    minWidth: 54,
    textAlign: 'center',
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
    backgroundColor: '#06B6D4',
    borderRadius: 4,
  },
  progressBarThumb: {
    position: 'absolute',
    top: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    marginLeft: -8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  controlBtn: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.accentGold,
    transform: [{scale: 1.06}],
  },
  controlBtnText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  primaryControlBtn: {
    backgroundColor: '#06B6D4',
    borderColor: '#22D3EE',
    minWidth: 140,
  },
  primaryControlBtnText: {
    color: '#041E26',
    fontSize: 16,
    fontWeight: '800',
  },
  recapBtn: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  recapBtnIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  recapBtnText: {
    color: '#FDE68A',
    fontSize: 16,
    fontWeight: '700',
  },
});
