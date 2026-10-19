import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  ScrollView,
} from 'react-native';
import {
  VideoPlayer,
  KeplerVideoSurfaceView,
} from '@amazon-devices/react-native-w3cmedia';
import {useTVEventHandler, HWEvent} from '@amazon-devices/react-native-kepler';

const TEST_SOURCES = [
  {
    name: 'Remote MP4 (MDN Flower, 540p H.264)',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
  {
    name: 'Remote MP4 (Big Buck Bunny, 720p H.264)',
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
  },
  {
    name: 'Local HTTP (Behind the Screams, 1080p H.264)',
    url: 'http://10.0.2.2:8080/videos/behind-the-screams.mp4',
  },
];

export interface MinimalVideoProbeProps {
  onClose?: () => void;
}

export const MinimalVideoProbe = ({onClose}: MinimalVideoProbeProps) => {
  const {width: deviceWidth, height: deviceHeight} = Dimensions.get('window');

  // React state for HUD rendering ONLY
  const [sourceIndex, setSourceIndex] = useState<number>(0);
  const [hudHandle, setHudHandle] = useState<string>('none');
  const [hudInit, setHudInit] = useState<string>('Uninitialized');
  const [hudSurfaceAttached, setHudSurfaceAttached] = useState<boolean>(false);
  const [hudSource, setHudSource] = useState<string>('None');
  const [hudPlay, setHudPlay] = useState<string>('Not called');
  const [hudState, setHudState] = useState<string>('idle');
  const [hudCurrentTime, setHudCurrentTime] = useState<number>(0);
  const [hudDuration, setHudDuration] = useState<number>(0);
  const [hudTicks, setHudTicks] = useState<number>(0);
  const [hudLogs, setHudLogs] = useState<string[]>([]);
  const [hudError, setHudError] = useState<string | null>(null);

  // Non-rendering mutable refs for playback control
  const playerRef = useRef<VideoPlayer | null>(null);
  const surfaceHandleRef = useRef<string | null>(null);
  const isInitializedRef = useRef<boolean>(false);
  const isStartedRef = useRef<boolean>(false);
  const currentSourceIdxRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const logMessage = useCallback((msg: string) => {
    const timestamp = new Date().toISOString().substring(14, 23);
    const line = `[${timestamp}] ${msg}`;
    console.info(`[PROBE] ${msg}`);
    if (isMountedRef.current) {
      setHudLogs(prev => [line, ...prev.slice(0, 19)]);
    }
  }, []);

  // Set up and start playback once BOTH player is initialized AND surface handle is available
  const tryAttachAndPlay = useCallback(() => {
    const player = playerRef.current;
    const handle = surfaceHandleRef.current;
    const isInit = isInitializedRef.current;

    logMessage(`tryAttachAndPlay check: player=${!!player}, handle=${handle}, isInit=${isInit}, isStarted=${isStartedRef.current}`);

    if (!player || !handle || !isInit) {
      return;
    }

    if (isStartedRef.current) {
      logMessage('Playback already started on this player instance');
      return;
    }

    isStartedRef.current = true;
    const targetSource = TEST_SOURCES[currentSourceIdxRef.current];

    try {
      logMessage(`Step 1: Attaching surface handle: ${handle}`);
      player.setSurfaceHandle(handle);
      setHudSurfaceAttached(true);

      logMessage(`Step 2: Assigning player.src: ${targetSource.url}`);
      setHudSource(targetSource.url);
      player.autoplay = true;
      player.src = targetSource.url;

      logMessage('Step 3: Calling player.play()');
      setHudPlay('Calling player.play()...');
      player
        .play()
        .then(() => {
          logMessage('player.play() resolved successfully');
          if (isMountedRef.current) {
            setHudPlay('Resolved (Playing)');
            setHudState('PLAYING');
          }
        })
        .catch((err: any) => {
          const msg = err?.message || String(err);
          logMessage(`player.play() rejected: ${msg}`);
          if (isMountedRef.current) {
            setHudPlay(`Rejected: ${msg}`);
            setHudError(msg);
          }
        });
    } catch (e: any) {
      const msg = e?.message || String(e);
      logMessage(`Exception during attach & play: ${msg}`);
      if (isMountedRef.current) {
        setHudError(msg);
      }
    }
  }, [logMessage]);

  // Surface view created callback
  const onSurfaceViewCreated = useCallback((handle: string) => {
    logMessage(`onSurfaceViewCreated callback fired: "${handle}"`);
    surfaceHandleRef.current = handle;
    setHudHandle(handle);
    tryAttachAndPlay();
  }, [logMessage, tryAttachAndPlay]);

  // Surface view destroyed callback
  const onSurfaceViewDestroyed = useCallback((handle: string) => {
    logMessage(`onSurfaceViewDestroyed callback fired: "${handle}"`);
    if (playerRef.current) {
      try {
        playerRef.current.clearSurfaceHandle(handle);
      } catch (e: any) {
        logMessage(`clearSurfaceHandle error: ${e?.message}`);
      }
    }
    surfaceHandleRef.current = null;
    setHudHandle('none');
    setHudSurfaceAttached(false);
    isStartedRef.current = false;
  }, [logMessage]);

  // One-time player setup on component mount
  useEffect(() => {
    isMountedRef.current = true;
    logMessage('Component mounted: Creating VideoPlayer instance');

    const player = new VideoPlayer();
    playerRef.current = player;

    // Emulator compatibility: mute audio to bypass missing physical audio device
    player.defaultMuted = true;
    player.muted = true;
    player.volume = 0;

    logMessage('Calling player.initialize()...');
    setHudInit('Initializing...');

    player
      .initialize()
      .then(() => {
        if (!isMountedRef.current) return;
        logMessage('player.initialize() Promise fulfilled');
        isInitializedRef.current = true;
        setHudInit('Initialized (Success)');

        // Attach event listeners
        player.addEventListener('loadstart', () => {
          logMessage('EVENT: loadstart');
          if (isMountedRef.current) setHudState('loadstart');
        });

        player.addEventListener('loadedmetadata', () => {
          const dur = player.duration;
          logMessage(`EVENT: loadedmetadata duration=${dur}`);
          if (isMountedRef.current) {
            if (dur && !isNaN(dur) && dur > 0) setHudDuration(dur);
            setHudState('loadedmetadata');
          }
        });

        player.addEventListener('loadeddata', () => {
          logMessage('EVENT: loadeddata');
          if (isMountedRef.current) setHudState('loadeddata');
        });

        player.addEventListener('canplay', () => {
          logMessage('EVENT: canplay');
          if (isMountedRef.current) setHudState('canplay');
        });

        player.addEventListener('canplaythrough', () => {
          logMessage('EVENT: canplaythrough');
          if (isMountedRef.current) setHudState('canplaythrough');
        });

        player.addEventListener('playing', () => {
          logMessage('EVENT: playing (actively rendering frames)');
          if (isMountedRef.current) setHudState('PLAYING');
        });

        player.addEventListener('timeupdate', () => {
          if (!isMountedRef.current) return;
          const ct = player.currentTime;
          if (ct != null && !isNaN(ct)) {
            setHudCurrentTime(ct);
          }
          setHudTicks(prev => prev + 1);
        });

        player.addEventListener('pause', () => {
          logMessage('EVENT: pause');
          if (isMountedRef.current) setHudState('paused');
        });

        player.addEventListener('waiting', () => {
          logMessage('EVENT: waiting (buffering)');
          if (isMountedRef.current) setHudState('buffering');
        });

        player.addEventListener('ended', () => {
          logMessage('EVENT: ended');
          if (isMountedRef.current) setHudState('ended');
        });

        player.addEventListener('error', (evt: any) => {
          const errMsg =
            evt?.target?.mediaControlStateUtil?.mError?.message_ ||
            evt?.message ||
            'Media playback error';
          logMessage(`EVENT: error -> ${errMsg}`);
          if (isMountedRef.current) {
            setHudError(errMsg);
            setHudState('ERROR');
          }
        });

        // Check if surface handle arrived before player.initialize() finished
        tryAttachAndPlay();
      })
      .catch((err: any) => {
        const msg = err?.message || String(err);
        logMessage(`player.initialize() REJECTED: ${msg}`);
        if (isMountedRef.current) {
          setHudInit(`Failed: ${msg}`);
          setHudError(msg);
          setHudState('INIT_FAILED');
        }
      });

    return () => {
      isMountedRef.current = false;
      logMessage('Component unmounting: cleaning up VideoPlayer');
      const p = playerRef.current;
      const h = surfaceHandleRef.current;
      if (p) {
        if (h) {
          try {
            p.clearSurfaceHandle(h);
          } catch (e) {
            // ignore
          }
        }
        try {
          p.deinitialize().catch(() => {});
        } catch (e) {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [logMessage, tryAttachAndPlay]);

  // Switch source dynamically without recreating the player
  const switchSource = useCallback((newIdx: number) => {
    currentSourceIdxRef.current = newIdx;
    setSourceIndex(newIdx);
    setHudTicks(0);
    setHudCurrentTime(0);
    setHudDuration(0);
    setHudError(null);
    setHudState('switching');

    const player = playerRef.current;
    if (!player) return;

    const targetSource = TEST_SOURCES[newIdx];
    logMessage(`Switching to source [${newIdx}]: ${targetSource.name}`);
    setHudSource(targetSource.url);

    try {
      player.pause();
      player.src = targetSource.url;
      player.play().catch(e => logMessage(`play error: ${e?.message}`));
    } catch (e: any) {
      logMessage(`Switch error: ${e?.message}`);
    }
  }, [logMessage]);

  // Remote key handling
  useTVEventHandler((evt: HWEvent) => {
    if (!evt || !evt.eventType) return;
    const type = evt.eventType.toLowerCase();
    if (type === 'select' || type === 'play' || type === 'playpause') {
      const p = playerRef.current;
      if (p) {
        if (p.paused) {
          logMessage('Remote PLAY');
          p.play().catch(e => logMessage(`Play err: ${e?.message}`));
        } else {
          logMessage('Remote PAUSE');
          p.pause();
        }
      }
    } else if (type === 'up' || type === 'right') {
      const nextIdx = (currentSourceIdxRef.current + 1) % TEST_SOURCES.length;
      switchSource(nextIdx);
    } else if (type === 'down' || type === 'left') {
      const prevIdx = (currentSourceIdxRef.current - 1 + TEST_SOURCES.length) % TEST_SOURCES.length;
      switchSource(prevIdx);
    } else if (type === 'back' && onClose) {
      onClose();
    }
  });

  const currentSource = TEST_SOURCES[sourceIndex];

  return (
    <View style={[styles.container, {width: deviceWidth, height: deviceHeight}]}>
      {/* 1. Underlying Kepler Video Surface View */}
      <KeplerVideoSurfaceView
        style={styles.surface}
        onSurfaceViewCreated={onSurfaceViewCreated}
        onSurfaceViewDestroyed={onSurfaceViewDestroyed}
        scalingmode="fit"
        testID="kepler-video-surface-probe"
      />

      {/* 2. Diagnostic Telemetry Overlay (Top HUD) */}
      <View style={styles.hudOverlay}>
        <View style={styles.hudHeader}>
          <Text style={styles.hudTitle}>VEGA OS VIDEO PLAYBACK PROBE (DIAGNOSTIC)</Text>
          <Text style={styles.hudSubtitle}>Press [UP/DOWN] on Remote to Switch Test Video | [SELECT] Play/Pause</Text>
        </View>

        {/* Status Grid */}
        <View style={styles.gridContainer}>
          <View style={styles.gridCol}>
            <Text style={styles.metricLabel}>Test Source ({sourceIndex + 1}/{TEST_SOURCES.length}):</Text>
            <Text style={styles.metricHighlight}>{currentSource.name}</Text>
            <Text style={styles.metricUrl} numberOfLines={1}>{currentSource.url}</Text>

            <Text style={styles.metricLabel}>Surface View Handle:</Text>
            <Text style={hudHandle !== 'none' ? styles.metricOk : styles.metricWarn}>
              {hudHandle !== 'none' ? `READY (${hudHandle})` : 'Waiting for onSurfaceViewCreated...'}
            </Text>

            <Text style={styles.metricLabel}>Player Initialization:</Text>
            <Text style={hudInit.includes('Success') ? styles.metricOk : styles.metricWarn}>
              {hudInit}
            </Text>
          </View>

          <View style={styles.gridCol}>
            <Text style={styles.metricLabel}>Surface Attached to Player:</Text>
            <Text style={hudSurfaceAttached ? styles.metricOk : styles.metricWarn}>
              {hudSurfaceAttached ? 'YES (setSurfaceHandle attached)' : 'NO'}
            </Text>

            <Text style={styles.metricLabel}>player.play() Request:</Text>
            <Text style={hudPlay.includes('Playing') || hudPlay.includes('Resolved') ? styles.metricOk : styles.metricWarn}>
              {hudPlay}
            </Text>

            <Text style={styles.metricLabel}>Playback State / Ticks:</Text>
            <Text style={hudState === 'PLAYING' ? styles.metricOk : styles.metricWarn}>
              {hudState.toUpperCase()} | timeupdate ticks: {hudTicks}
            </Text>

            <Text style={styles.metricLabel}>Current Time / Duration:</Text>
            <Text style={styles.metricHighlight}>
              {hudCurrentTime.toFixed(2)}s / {hudDuration > 0 ? hudDuration.toFixed(2) + 's' : 'unknown'}
            </Text>
          </View>
        </View>

        {hudError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>FAILURE DETECTED: {hudError}</Text>
          </View>
        )}

        {/* Live Event Stream Log */}
        <Text style={styles.logHeader}>Event Stream (Latest at Top):</Text>
        <ScrollView style={styles.logScrollView}>
          {hudLogs.map((log, idx) => (
            <Text key={idx} style={styles.logLine}>{log}</Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#05070B',
    position: 'relative',
    flex: 1,
  },
  surface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  hudOverlay: {
    position: 'absolute',
    top: 24,
    left: 48,
    right: 48,
    bottom: 24,
    backgroundColor: 'rgba(10, 15, 25, 0.85)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(0, 240, 255, 0.4)',
    zIndex: 10,
  },
  hudHeader: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    paddingBottom: 12,
  },
  hudTitle: {
    color: '#00F0FF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  hudSubtitle: {
    color: '#A0AEC0',
    fontSize: 14,
    marginTop: 4,
  },
  gridContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  gridCol: {
    flex: 1,
    paddingRight: 16,
  },
  metricLabel: {
    color: '#718096',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 8,
  },
  metricHighlight: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  metricUrl: {
    color: '#4FD1C5',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  metricOk: {
    color: '#48BB78',
    fontSize: 15,
    fontWeight: '700',
  },
  metricWarn: {
    color: '#ED8936',
    fontSize: 15,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: 'rgba(229, 62, 62, 0.25)',
    borderLeftWidth: 4,
    borderLeftColor: '#E53E3E',
    padding: 10,
    marginBottom: 12,
    borderRadius: 6,
  },
  errorText: {
    color: '#FEB2B2',
    fontSize: 14,
    fontWeight: '700',
  },
  logHeader: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  logScrollView: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    padding: 10,
  },
  logLine: {
    color: '#CBD5E0',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});
