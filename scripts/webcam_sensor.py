#!/usr/bin/env python3
"""
LivingFrame Laptop Webcam Room Sensor (MediaPipe ML & Heuristic Fallback)
========================================================================
Privacy-preserving local vision sensor that detects hand gestures
using Google MediaPipe ML and dispatches real-time events to the local WebSocket server.

Features:
- Primary Engine: Pretrained MediaPipe Gesture Recognizer (Hand Raised, Closed Fist, Thumbs Up)
- Playback Control: Open palm (hand raise) toggles pause/play; horizontal swipes seek +/- 5s
- Room Presence: MediaPipe Pose Landmarker counts visible people and emits
  person_entered / person_left room events (presence only — never identity)
- Fallback Engine: Lightweight heuristic YCbCr skin-tone detector (--engine heuristic)
- Zero Cloud/Streaming: Raw video never leaves memory; 100% on-device inference
- Dual Visual Previews: Native desktop popup window + live web dashboard at /camera
- Robust Fallback: Clear failure reporting and automatic or manual fallback modes

Usage:
  python3 scripts/webcam_sensor.py                          # Run with MediaPipe ML engine
  python3 scripts/webcam_sensor.py --engine heuristic       # Run existing skin-pixel detector
  python3 scripts/webcam_sensor.py --manual                 # Interactive keyboard trigger
  python3 scripts/webcam_sensor.py --simulate               # Periodic gesture simulator
"""

import sys
import os
import importlib

# Ensure project .venv site-packages is in sys.path for both IDE language servers and runtime
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV_PYTHON = os.path.join(PROJECT_ROOT, '.venv', 'bin', 'python')

_venv_lib = os.path.join(PROJECT_ROOT, '.venv', 'lib')
if os.path.isdir(_venv_lib):
    for _entry in os.listdir(_venv_lib):
        _sp = os.path.join(_venv_lib, _entry, 'site-packages')
        if os.path.isdir(_sp) and _sp not in sys.path:
            sys.path.insert(0, _sp)

if os.path.exists(VENV_PYTHON) and sys.executable != VENV_PYTHON:
    try:
        importlib.import_module('mediapipe')
    except ImportError:
        # Re-exec under project virtualenv
        os.execv(VENV_PYTHON, [VENV_PYTHON] + sys.argv)

import time
import signal
import argparse
import subprocess
import json
import io
import urllib.request
import urllib.error
import threading
import queue
from collections import deque
from PIL import Image

# Global parameters
DEFAULT_DEVICE = '/dev/video0'
DEFAULT_SERVER = 'http://localhost:8080'
DEFAULT_MODEL = os.path.join(PROJECT_ROOT, 'models', 'gesture_recognizer.task')
DEFAULT_POSE_MODEL = os.path.join(PROJECT_ROOT, 'models', 'pose_landmarker_lite.task')

# Room presence (visible person count) detection.
# Presence changes slowly, so the pose model runs on a fraction of frames to keep the
# gesture pipeline at full rate.
PRESENCE_FRAME_INTERVAL = 5      # run the pose model every N frames (~2 Hz at 10 fps)
PRESENCE_MAX_POSES = 3           # up to this many visible people are counted
PRESENCE_WINDOW = 5              # rolling window of raw counts used for stabilisation
PRESENCE_CONFIRM_SAMPLES = 3     # sustained samples required to confirm a change
PRESENCE_COOLDOWN_SEC = 3.0      # minimum gap between person_entered/person_left events

# MediaPipe Hand Landmarks Skeleton Connections
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),        # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),        # Index finger
    (5, 9), (9, 10), (10, 11), (11, 12),   # Middle finger
    (9, 13), (13, 14), (14, 15), (15, 16), # Ring finger
    (13, 17), (17, 18), (18, 19), (19, 20),# Pinky
    (0, 17)                                # Palm base
]

# Supported Gesture Mappings (MediaPipe category name -> room gesture payload)
# NOTE: Open_Palm is the physical "hand raise" used to toggle video playback.
GESTURE_MAP = {
    'Open_Palm': ('hand_raised', 'Hand Raised Detected', '✋'),
    'Closed_Fist': ('closed_fist', 'Closed Fist Detected', '✊'),
    'Thumb_Up': ('thumbs_up', 'Thumbs Up Detected', '👍'),
    'Pointing_Up': ('point_to_screen', 'Pointing Detected', '👆'),
    'Victory': ('victory', 'Victory Detected', '✌️'),
}

# Horizontal/vertical swipe gesture tuning (normalized frame coordinates, 0..1).
# Tuned to tolerate the intermittent hand detection of the per-frame (IMAGE) recognizer.
SWIPE_WINDOW_SEC = 0.7        # Time window over which motion is measured
SWIPE_MIN_SAMPLES = 2         # Minimum tracked samples before a swipe can fire
SWIPE_MIN_TIME_SEC = 0.08     # Minimum sample time span needed to infer a direction
SWIPE_DX_THRESHOLD = 0.12     # Minimum horizontal travel (fraction of frame width)
SWIPE_DY_THRESHOLD = 0.09     # Minimum vertical travel (fraction of frame height; 4:3 frame)
SWIPE_DOMINANCE_RATIO = 1.4   # Swipe axis must exceed the other by this factor
SWIPE_COOLDOWN_SEC = 0.6      # Debounce between consecutive swipe dispatches
SWIPE_SUPPRESS_SEC = 1.2      # Suppress gesture toggles right after a swipe dispatch
SWIPE_PALM_LANDMARK = 9       # Middle-finger MCP: stable palm-center proxy

# Motion gating: a pose gesture (hand raise, fist, ...) only counts when the hand is
# held reasonably still — otherwise waving an open palm would fire "select" mid-swipe.
MOTION_WINDOW_SEC = 0.25      # Window used to decide whether the hand is moving
MOTION_MOVE_THRESHOLD = 0.05  # Palm travel (normalized) within the window that = moving

# Swipe payload (emoji, human description) keyed by gesture name
SWIPE_LABELS = {
    'swipe_left': ('⏪', 'Swipe Left Detected'),
    'swipe_right': ('⏩', 'Swipe Right Detected'),
    'swipe_up': ('⬆️', 'Swipe Up Detected'),
    'swipe_down': ('⬇️', 'Swipe Down Detected'),
}


class PresenceStabilizer:
    """Turns noisy per-sample person counts into stable enter/leave events.

    Pure logic (no MediaPipe / camera dependency) so it can be unit-tested directly.

    Action plan:
      * establish a baseline once enough samples exist
      * a change is only *confirmed* when the same stable count persists across
        several samples (debounce)
      * confirmed changes are rate-limited by a cooldown
    """

    def __init__(self, window=PRESENCE_WINDOW, confirm=PRESENCE_CONFIRM_SAMPLES,
                 cooldown=PRESENCE_COOLDOWN_SEC):
        self.window = window
        self.confirm = confirm
        self.cooldown = cooldown
        self.samples = deque(maxlen=window)
        self.confirmed = None          # last confirmed person count
        self.pending_value = None
        self.pending_count = 0
        self.last_event_time = None

    def stable_count(self):
        """Majority vote over the rolling window (ties favour the higher count)."""
        if not self.samples:
            return 0
        votes = {}
        for count in self.samples:
            votes[count] = votes.get(count, 0) + 1
        return max(votes.items(), key=lambda item: (item[1], item[0]))[0]

    def add_sample(self, count, now):
        """Feed a raw count. Returns (event_type, count, previous) or None.

        A change is confirmed only when the same count is seen for `confirm`
        consecutive samples, so a single flickering sample can never fire an event.
        """
        self.samples.append(count)

        if self.confirmed is None:
            # Baseline after the first few samples, so startup noise cannot fire an event
            if len(self.samples) >= self.confirm:
                self.confirmed = count
            return None

        if count == self.confirmed:
            self.pending_value = None
            self.pending_count = 0
            return None

        if count == self.pending_value:
            self.pending_count += 1
        else:
            self.pending_value = count
            self.pending_count = 1

        if self.pending_count < self.confirm:
            return None

        if self.last_event_time is not None and (now - self.last_event_time) < self.cooldown:
            return None

        previous = self.confirmed
        event_type = 'person_entered' if count > previous else 'person_left'
        self.confirmed = count
        self.last_event_time = now
        self.pending_value = None
        self.pending_count = 0
        return event_type, count, previous


def count_visible_poses(result, min_visibility=0.3, min_visible_landmarks=6):
    """Count poses that really have enough visible landmarks.

    Presence only — never identity. Guards against MediaPipe emitting low-confidence
    'ghost' poses when nobody is clearly in frame.
    """
    if not result or not getattr(result, 'pose_landmarks', None):
        return 0
    count = 0
    for landmarks in result.pose_landmarks:
        visible = sum(
            1 for lm in landmarks
            if getattr(lm, 'visibility', 1.0) is not None
            and getattr(lm, 'visibility', 1.0) >= min_visibility
        )
        if visible >= min_visible_landmarks:
            count += 1
    return count


class FrameUploader(threading.Thread):
    """Asynchronous background worker to POST frames and telemetry to web dashboard."""
    def __init__(self, server_url):
        super().__init__(daemon=True)
        self.server_url = server_url.rstrip('/')
        self.q = queue.Queue(maxsize=1)
        self.running = True

    def post_frame(self, jpeg_bytes, headers):
        try:
            self.q.put_nowait((jpeg_bytes, headers))
        except queue.Full:
            pass  # Drop frame if previous upload is still in progress

    def stop(self):
        self.running = False

    def run(self):
        while self.running:
            try:
                jpeg_bytes, headers = self.q.get(timeout=0.5)
                req = urllib.request.Request(
                    f"{self.server_url}/camera/frame",
                    data=jpeg_bytes,
                    headers=headers,
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    resp.read()
            except (urllib.error.URLError, TimeoutError, queue.Empty):
                pass
            except Exception:
                pass


class WebcamSensor:
    def __init__(
        self,
        device=DEFAULT_DEVICE,
        server_url=DEFAULT_SERVER,
        engine='mediapipe',
        model_path=DEFAULT_MODEL,
        pose_model_path=DEFAULT_POSE_MODEL,
        min_confidence=0.65,
        manual_mode=False,
        simulate_mode=False,
        preview=True
    ):
        self.device = device
        self.server_url = server_url.rstrip('/')
        self.engine = engine.lower()
        self.model_path = model_path
        self.pose_model_path = pose_model_path
        self.min_confidence = min_confidence
        self.manual_mode = manual_mode
        self.simulate_mode = simulate_mode
        self.preview = preview
        self.running = True
        self.proc = None
        self.uploader = FrameUploader(self.server_url)

        # State tracking
        self.last_trigger_time = 0.0
        self.is_gesture_active = False
        self.consecutive_hits = 0
        self.last_candidate_gesture = None
        self.neutral_frames = 0
        self.cooldown_seconds = 2.0
        self.min_consecutive_frames = 2

        # Swipe (seek) tracking state
        self.swipe_history = deque(maxlen=40)
        self.last_swipe_time = 0.0
        self.swipe_suppress_until = 0.0
        self.motion_history = deque(maxlen=30)
        self.swipe_debug = os.environ.get('LIVINGFRAME_SWIPE_DEBUG') == '1'

        # Room presence (visible person count) state
        self.presence = PresenceStabilizer()
        self.person_count = 0
        self.room_event_log = deque(maxlen=20)

        # Heuristic parameters (for fallback mode)
        self.upper_zone_fraction = 0.35
        self.skin_delta_threshold = 500
        self.baseline_skin = 180.0

        # Register signals
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

    def _handle_signal(self, signum, frame):
        print("\n[SENSOR] Shutdown signal received. Stopping cleanly...")
        self.running = False
        self.uploader.stop()
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=1.0)
            except Exception:
                pass

    def send_event(self, gesture='open_palm', confidence=0.95, handedness='Right', message=None):
        """Send small structured JSON event to laptop WebSocket/HTTP server."""
        if not message:
            _, default_msg, emoji = GESTURE_MAP.get(gesture, (gesture, 'Gesture Detected', '✋'))
            message = f"{emoji} {default_msg}"

        payload = {
            'type': 'gesture_detected',
            'gesture': gesture,
            'confidence': round(float(confidence), 2),
            'handedness': handedness,
            'engine': self.engine,
            'source': 'laptop_webcam_sensor',
            'timestamp': int(time.time() * 1000),
            'message': message
        }
        trigger_url = f"{self.server_url}/trigger"
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            trigger_url,
            data=data_bytes,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                clients = result.get('clientsNotified', 0)
                print(f"📡 [EVENT SENT] '{gesture}' (conf={confidence:.2f}, hand={handedness}) -> {clients} connected TV client(s) notified!")
                return True
        except urllib.error.URLError as e:
            print(f"⚠️ [EVENT FAILED] Could not contact server at {trigger_url}: {e.reason}")
            return False
        except Exception as e:
            print(f"⚠️ [EVENT ERROR] {e}")
            return False

    def send_room_event(self, event_type, count, previous, source='webcam'):
        """Send a structured room-presence event (person_entered / person_left)."""
        verb = 'entered' if event_type == 'person_entered' else 'left'
        message = f"Person {verb} · {count} in view"
        payload = {
            'type': event_type,
            'source': source,
            'message': message,
            'payload': {
                'personCount': count,
                'count': count,
                'previousCount': previous,
                'delta': count - previous,
            },
            'timestamp': int(time.time() * 1000),
        }
        try:
            req = urllib.request.Request(
                f"{self.server_url}/trigger",
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                result = json.loads(resp.read().decode('utf-8'))
            clients = result.get('clientsNotified', 0)
            emoji = '👥' if event_type == 'person_entered' else '👋'
            print(f"{emoji} [ROOM EVENT] {event_type} count={count} (was {previous}) -> {clients} client(s)")
            self.room_event_log.append((payload['timestamp'], event_type, count))
            return True
        except Exception as e:
            print(f"⚠️ [ROOM EVENT FAILED] {e}")
            return False

    def _detect_swipe(self, results, now):
        """Track palm motion and return a directional swipe when detected.

        Returns 'swipe_left'/'swipe_right' for horizontal motion and
        'swipe_up'/'swipe_down' for vertical motion.

        Tolerant of transient hand-detection dropouts: samples are only aged out by the
        time window, never cleared on a single missed frame (the per-frame recognizer
        drops the hand often while it is moving, which previously discarded the motion).
        """
        if results.hand_landmarks:
            palm = results.hand_landmarks[0][SWIPE_PALM_LANDMARK]
            self.swipe_history.append((now, palm.x, palm.y))

        # Age out samples outside the measurement window
        while self.swipe_history and (now - self.swipe_history[0][0]) > SWIPE_WINDOW_SEC:
            self.swipe_history.popleft()

        if len(self.swipe_history) < SWIPE_MIN_SAMPLES:
            return None

        start_t, start_x, start_y = self.swipe_history[0]
        end_t, end_x, end_y = self.swipe_history[-1]
        span = end_t - start_t
        dx = end_x - start_x
        dy = end_y - start_y

        if self.swipe_debug and (abs(dx) >= 0.03 or abs(dy) >= 0.03):
            print(f"[SWIPE DEBUG] samples={len(self.swipe_history)} span={span:.2f}s dx={dx:+.2f} dy={dy:+.2f}")

        if span < SWIPE_MIN_TIME_SEC:
            return None
        if (now - self.last_swipe_time) < SWIPE_COOLDOWN_SEC:
            return None

        if abs(dx) >= SWIPE_DX_THRESHOLD and abs(dx) > abs(dy) * SWIPE_DOMINANCE_RATIO:
            self.last_swipe_time = now
            self.swipe_history.clear()
            return 'swipe_right' if dx > 0 else 'swipe_left'
        if abs(dy) >= SWIPE_DY_THRESHOLD and abs(dy) > abs(dx) * SWIPE_DOMINANCE_RATIO:
            self.last_swipe_time = now
            self.swipe_history.clear()
            # Image y grows downward: positive dy means the hand moved down
            return 'swipe_down' if dy > 0 else 'swipe_up'
        return None

    def _track_motion(self, results, now):
        """Record the palm position and report whether the hand is moving this frame."""
        if results.hand_landmarks:
            palm = results.hand_landmarks[0][SWIPE_PALM_LANDMARK]
            self.motion_history.append((now, palm.x, palm.y))

        while self.motion_history and (now - self.motion_history[0][0]) > MOTION_WINDOW_SEC:
            self.motion_history.popleft()

        if len(self.motion_history) < 2:
            return False

        _, start_x, start_y = self.motion_history[0]
        _, end_x, end_y = self.motion_history[-1]
        return max(abs(end_x - start_x), abs(end_y - start_y)) >= MOTION_MOVE_THRESHOLD

    def run_manual_mode(self):
        """Interactive manual trigger fallback mode."""
        print("========================================================")
        print("   LivingFrame Manual Event Sensor (Fallback Mode)")
        print("========================================================")
        print(f"Target Server: {self.server_url}")
        print("Select a gesture to dispatch to Vega TV:")
        print("  [1] Open Palm ✋ (open_palm)")
        print("  [2] Thumbs Up 👍 (thumbs_up)")
        print("  [3] Closed Fist ✊ (closed_fist)")
        print("  [4] Hand Raised ✋ (hand_raised) -> toggles pause/play")
        print("  [5] Swipe Left ⏪ (swipe_left) -> seek back 5s")
        print("  [6] Swipe Right ⏩ (swipe_right) -> seek forward 5s")
        print("  [7] Swipe Up ⬆️ (swipe_up) -> navigate up")
        print("  [8] Swipe Down ⬇️ (swipe_down) -> navigate down")
        print("  [q] Quit")
        print("--------------------------------------------------------")

        key_map = {
            '1': ('open_palm', 0.98, 'Open Palm Detected'),
            '2': ('thumbs_up', 0.99, 'Thumbs Up Detected'),
            '3': ('closed_fist', 0.95, 'Closed Fist Detected'),
            '4': ('hand_raised', 1.0, 'Hand Raised Detected'),
            '5': ('swipe_left', 0.97, 'Swipe Left Detected'),
            '6': ('swipe_right', 0.97, 'Swipe Right Detected'),
            '7': ('swipe_up', 0.97, 'Swipe Up Detected'),
            '8': ('swipe_down', 0.97, 'Swipe Down Detected'),
        }

        while self.running:
            try:
                choice = input(">> Select gesture [1-4 or q]: ").strip().lower()
                if choice == 'q':
                    break
                if choice in key_map:
                    g, conf, msg = key_map[choice]
                    self.send_event(gesture=g, confidence=conf, message=msg)
                elif choice == '':
                    # Default enter key sends open_palm
                    self.send_event(gesture='open_palm', confidence=0.95, message='Open Palm Detected')
                else:
                    print("Invalid selection. Choose 1-8, or q.")
            except (EOFError, KeyboardInterrupt):
                break

    def run_simulate_mode(self):
        """Simulate periodic hand gestures for automated testing."""
        print("========================================================")
        print("   LivingFrame Simulation Sensor Mode")
        print("========================================================")
        print(f"Target Server: {self.server_url}")
        print("Cycling playback-control gestures every 6 seconds: Hand Raised -> Swipe Right -> Hand Raised -> Swipe Left")
        print("Press Ctrl+C to stop.")
        print("--------------------------------------------------------")

        gestures = [
            ('hand_raised', 0.96, 'Hand Raised Detected'),
            ('swipe_right', 0.97, 'Swipe Right Detected'),
            ('hand_raised', 0.96, 'Hand Raised Detected'),
            ('swipe_left', 0.97, 'Swipe Left Detected'),
        ]
        idx = 0

        while self.running:
            time.sleep(6)
            if not self.running:
                break
            g, conf, msg = gestures[idx % len(gestures)]
            idx += 1
            self.send_event(gesture=g, confidence=conf, message=msg)

    def run_heuristic_mode(self):
        """Fallback: Heuristic skin-tone detector using native GStreamer + Pillow."""
        width = 160
        height = 120
        frame_size = width * height * 3
        upper_pixels = int(width * (height * self.upper_zone_fraction))

        if not os.path.exists(self.device):
            print(f"❌ Camera device '{self.device}' not found.")
            print("Switching to manual fallback mode...")
            self.run_manual_mode()
            return

        display_available = bool(os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY'))
        preview_window = self.preview and display_available
        sub_env = dict(os.environ)
        if display_available and 'DISPLAY' not in sub_env:
            sub_env['DISPLAY'] = ':0'

        if preview_window:
            cmd = [
                'gst-launch-1.0', '-q',
                'v4l2src', f'device={self.device}',
                '!', 'tee', 'name=t',
                't.', '!', 'queue', '!', 'videoconvert', '!', 'videoscale', '!', 'video/x-raw,width=480,height=360',
                '!', 'textoverlay', 'text=LivingFrame Camera Preview (Heuristic Fallback)', 'valignment=top', 'halignment=center', 'shaded-background=true', 'font-desc=Sans Bold 11',
                '!', 'ximagesink',
                't.', '!', 'queue', '!', 'videoconvert', '!', 'videoscale', '!', f'video/x-raw,format=RGB,width={width},height={height},framerate=10/1',
                '!', 'fdsink', 'fd=1'
            ]
        else:
            cmd = [
                'gst-launch-1.0', '-q',
                'v4l2src', f'device={self.device}',
                '!', 'videoconvert',
                '!', 'videoscale',
                '!', f'video/x-raw,format=RGB,width={width},height={height},framerate=10/1',
                '!', 'fdsink'
            ]

        print("========================================================")
        print("   LivingFrame Heuristic Skin-Pixel Sensor (Fallback)")
        print("========================================================")
        print(f"Video Device   : {self.device}")
        print(f"Resolution     : {width}x{height} @ 10fps (in-memory)")
        print(f"Desktop Window : {'ENABLED' if preview_window else 'DISABLED'}")
        print(f"Web Dashboard  : {self.server_url}/camera")
        print("--------------------------------------------------------\n")

        try:
            self.proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=frame_size * 2,
                env=sub_env
            )
        except Exception as e:
            print(f"❌ Failed to start GStreamer: {e}")
            self.run_manual_mode()
            return

        if not self.proc or not self.proc.stdout:
            print("❌ Failed to obtain video stdout pipe.")
            self.run_manual_mode()
            return

        stdout_pipe = self.proc.stdout
        self.uploader.start()
        fps_count = 0
        fps_start = time.time()
        current_fps = 10.0
        frame_idx = 0

        while self.running and self.proc.poll() is None:
            raw_data = stdout_pipe.read(frame_size)
            if len(raw_data) != frame_size:
                break

            fps_count += 1
            frame_idx += 1
            now = time.time()

            try:
                im = Image.frombytes('RGB', (width, height), raw_data).convert('YCbCr')
                _, cb, cr = im.split()
                cb_bytes = cb.tobytes()
                cr_bytes = cr.tobytes()

                upper_skin = 0
                for idx in range(upper_pixels):
                    if 77 <= cb_bytes[idx] <= 127 and 133 <= cr_bytes[idx] <= 173:
                        upper_skin += 1

                delta = upper_skin - self.baseline_skin
                time_since_trigger = now - self.last_trigger_time

                if delta > self.skin_delta_threshold and time_since_trigger > self.cooldown_seconds:
                    self.consecutive_hits += 1
                    if self.consecutive_hits >= 2 and not self.is_gesture_active:
                        self.is_gesture_active = True
                        self.last_trigger_time = now
                        confidence = min(0.99, max(0.85, 0.85 + (delta / 2500.0) * 0.14))
                        print(f"\n✋ [HEURISTIC DETECTED] Hand Raised! (Skin count: {upper_skin}, Delta: +{int(delta)})")
                        self.send_event(gesture='hand_raised', confidence=confidence, message='Hand Raised Detected')
                else:
                    self.consecutive_hits = 0
                    if delta < (self.skin_delta_threshold * 0.5):
                        self.is_gesture_active = False
                        self.baseline_skin = 0.95 * self.baseline_skin + 0.05 * upper_skin

                if frame_idx % 2 == 0:
                    bio = io.BytesIO()
                    im_rgb = Image.frombytes('RGB', (width, height), raw_data)
                    im_rgb.save(bio, format='JPEG', quality=65)
                    headers = {
                        'Content-Type': 'image/jpeg',
                        'X-Engine': 'heuristic',
                        'X-Gesture': 'hand_raised' if self.is_gesture_active else '',
                        'X-Message': 'Hand Raised Detected' if self.is_gesture_active else '',
                        'X-Confidence': '0.90' if self.is_gesture_active else '0',
                        'X-Skin-Count': str(upper_skin),
                        'X-Baseline': str(int(self.baseline_skin)),
                        'X-Delta': str(int(delta)),
                        'X-FPS': f"{current_fps:.1f}",
                    }
                    self.uploader.post_frame(bio.getvalue(), headers)

                if now - fps_start >= 5.0:
                    current_fps = fps_count / (now - fps_start)
                    print(f"[HEURISTIC RUNNING] ~{current_fps:.1f} fps | Baseline: {int(self.baseline_skin)} px | Delta: {int(delta):+d} px", end='\r', flush=True)
                    fps_count = 0
                    fps_start = now

            except Exception as e:
                print(f"[HEURISTIC WARN] Frame error: {e}")

        self.uploader.stop()
        if self.proc:
            try:
                self.proc.terminate()
            except Exception:
                pass
        print("\n[SENSOR] Heuristic sensor stopped.")

    def run_mediapipe_mode(self):
        """Primary Engine: Real-time hand gesture recognition using official Google MediaPipe."""
        # Step 1: Verify model asset existence
        if not os.path.exists(self.model_path):
            error_msg = f"Model asset not found at '{self.model_path}'."
            print(f"❌ [ML INITIALIZATION FAILED] {error_msg}")
            print("Please download the official model with:")
            print("  mkdir -p models && curl -L -o models/gesture_recognizer.task https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task")
            if self.engine == 'mediapipe' and '--engine' in sys.argv:
                print("Exiting because --engine mediapipe was explicitly requested.")
                sys.exit(1)
            print("⚠️ Falling back to heuristic skin-pixel engine...")
            self.engine = 'heuristic'
            self.run_heuristic_mode()
            return

        # Step 2: Attempt MediaPipe and OpenCV import
        try:
            cv2 = importlib.import_module('cv2')
            np = importlib.import_module('numpy')
            mp = importlib.import_module('mediapipe')
            mp_python = importlib.import_module('mediapipe.tasks.python')
            mp_vision = importlib.import_module('mediapipe.tasks.python.vision')
        except ImportError as e:
            print(f"❌ [ML INITIALIZATION FAILED] MediaPipe dependency missing: {e}")
            print(f"Running interpreter: {sys.executable}")
            print("Please install requirements into .venv:")
            print("  .venv/bin/pip install mediapipe opencv-python-headless numpy matplotlib pillow")
            if self.engine == 'mediapipe' and '--engine' in sys.argv:
                print("Exiting because --engine mediapipe was explicitly requested.")
                sys.exit(1)
            print("⚠️ Falling back to heuristic skin-pixel engine...")
            self.engine = 'heuristic'
            self.run_heuristic_mode()
            return

        # Step 3: Initialize MediaPipe Gesture Recognizer
        try:
            print(f"[ML INIT] Loading MediaPipe Gesture Recognizer from {self.model_path}...")
            base_options = mp_python.BaseOptions(model_asset_path=self.model_path)
            options = mp_vision.GestureRecognizerOptions(
                base_options=base_options,
                running_mode=mp_vision.RunningMode.IMAGE,
                num_hands=2,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            recognizer = mp_vision.GestureRecognizer.create_from_options(options)
            print("✅ [ML READY] MediaPipe Gesture Recognizer model initialized successfully!")
        except Exception as e:
            print(f"❌ [ML INITIALIZATION FAILED] Error creating GestureRecognizer: {e}")
            if self.engine == 'mediapipe' and '--engine' in sys.argv:
                sys.exit(1)
            print("⚠️ Falling back to heuristic skin-pixel engine...")
            self.engine = 'heuristic'
            self.run_heuristic_mode()
            return

        # Step 3b: Pose Landmarker for room presence (visible person count).
        # Optional — if the model is absent the sensor still runs gesture-only.
        pose_landmarker = None
        if not os.path.exists(self.pose_model_path):
            print(f"⚠️ [PRESENCE] Pose model not found at '{self.pose_model_path}'.")
            print("   Room presence detection disabled (gesture control is unaffected).")
            print("   Download it with:")
            print("     curl -L -o models/pose_landmarker_lite.task \\")
            print("       https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task")
        else:
            try:
                print(f"[PRESENCE INIT] Loading Pose Landmarker from {os.path.basename(self.pose_model_path)}...")
                pose_options = mp_vision.PoseLandmarkerOptions(
                    base_options=mp_python.BaseOptions(model_asset_path=self.pose_model_path),
                    running_mode=mp_vision.RunningMode.IMAGE,
                    num_poses=PRESENCE_MAX_POSES,
                    min_pose_detection_confidence=0.5,
                    min_pose_presence_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                pose_landmarker = mp_vision.PoseLandmarker.create_from_options(pose_options)
                print(f"✅ [PRESENCE READY] Pose Landmarker · up to {PRESENCE_MAX_POSES} people · sampled every {PRESENCE_FRAME_INTERVAL} frames")
            except Exception as e:
                print(f"⚠️ [PRESENCE] Could not start Pose Landmarker: {e}")
                pose_landmarker = None

        # Step 4: Video capture pipeline
        width = 320
        height = 240
        frame_size = width * height * 3

        if not os.path.exists(self.device):
            print(f"❌ Camera device '{self.device}' not found.")
            print("Switching to manual fallback mode...")
            self.run_manual_mode()
            return

        display_available = bool(os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY'))
        preview_window = self.preview and display_available
        sub_env = dict(os.environ)
        if display_available and 'DISPLAY' not in sub_env:
            sub_env['DISPLAY'] = ':0'

        if preview_window:
            cmd = [
                'gst-launch-1.0', '-q',
                'v4l2src', f'device={self.device}',
                '!', 'tee', 'name=t',
                't.', '!', 'queue', '!', 'videoconvert', '!', 'videoscale', '!', 'video/x-raw,width=480,height=360',
                '!', 'textoverlay', 'text=LivingFrame MediaPipe ML Sensor • Active', 'valignment=top', 'halignment=center', 'shaded-background=true', 'font-desc=Sans Bold 11',
                '!', 'ximagesink',
                't.', '!', 'queue', '!', 'videoconvert', '!', 'videoscale', '!', f'video/x-raw,format=RGB,width={width},height={height},framerate=10/1',
                '!', 'fdsink', 'fd=1'
            ]
        else:
            cmd = [
                'gst-launch-1.0', '-q',
                'v4l2src', f'device={self.device}',
                '!', 'videoconvert',
                '!', 'videoscale',
                '!', f'video/x-raw,format=RGB,width={width},height={height},framerate=10/1',
                '!', 'fdsink'
            ]

        print("========================================================")
        print("   LivingFrame MediaPipe ML Hand Gesture Sensor")
        print("========================================================")
        print(f"Engine         : Google MediaPipe Gesture Recognizer (TFLite)")
        print(f"Model File     : {os.path.basename(self.model_path)} (8.0 MB)")
        print(f"Video Device   : {self.device}")
        print(f"Resolution     : {width}x{height} @ 10fps (in-memory)")
        print(f"Min Confidence : {int(self.min_confidence * 100)}%")
        print(f"Supported ML   : Hand Raised ✋ | Thumbs Up 👍 | Closed Fist ✊ | Swipe ⏪⏩")
        print(f"Room Presence  : {'Pose Landmarker · up to ' + str(PRESENCE_MAX_POSES) + ' people' if pose_landmarker is not None else 'DISABLED (pose model missing)'}")
        print(f"Desktop Window : {'ENABLED (Native Popup on Desktop)' if preview_window else 'DISABLED (Headless)'}")
        print(f"Web Dashboard  : {self.server_url}/camera (Live video + landmarks)")
        print(f"Privacy Mode   : 100% Local Inference (Zero cloud/streaming)")
        print("--------------------------------------------------------")
        print("Playback Control:")
        print("  - Raise an open palm ✋ to toggle PAUSE / PLAY on the TV.")
        print("  - Swipe your hand ⏪ left to seek back 5s, ⏩ right to seek forward 5s.")
        print("Instructions:")
        print("  - Sit facing the laptop camera naturally.")
        print("  - Hand landmarks and skeletons will be highlighted in real time.")
        print("  - Watch the live camera window AND the Vega TV app react!")
        print("  - Press Ctrl+C to exit.")
        print("========================================================\n")

        try:
            self.proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=frame_size * 2,
                env=sub_env
            )
        except Exception as e:
            print(f"❌ Failed to start GStreamer capture: {e}")
            self.run_manual_mode()
            return

        if not self.proc or not self.proc.stdout:
            print("❌ Failed to obtain video capture stdout pipe.")
            self.run_manual_mode()
            return

        stdout_pipe = self.proc.stdout
        self.uploader.start()

        fps_count = 0
        fps_start = time.time()
        current_fps = 10.0
        frame_idx = 0

        while self.running and self.proc.poll() is None:
            raw_data = stdout_pipe.read(frame_size)
            if len(raw_data) != frame_size:
                break

            fps_count += 1
            frame_idx += 1
            now = time.time()

            try:
                # Convert raw RGB buffer to numpy array for inference and annotation
                frame_rgb = np.frombuffer(raw_data, dtype=np.uint8).reshape((height, width, 3))
                annotated_rgb = frame_rgb.copy()

                # Perform MediaPipe ML recognition
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
                results = recognizer.recognize(mp_image)

                detected_category = None
                detected_score = 0.0
                detected_hand = 'Right'

                # Parse recognized gestures and draw landmarks
                if results.gestures and len(results.gestures) > 0 and len(results.gestures[0]) > 0:
                    top_category = results.gestures[0][0]
                    detected_category = top_category.category_name
                    detected_score = top_category.score

                    if results.handedness and len(results.handedness) > 0 and len(results.handedness[0]) > 0:
                        detected_hand = results.handedness[0][0].category_name

                # Draw hand landmarks skeleton if hand detected
                if results.hand_landmarks:
                    for hand_landmarks in results.hand_landmarks:
                        # Draw connections
                        for start_idx, end_idx in HAND_CONNECTIONS:
                            p1 = hand_landmarks[start_idx]
                            p2 = hand_landmarks[end_idx]
                            pt1 = (int(p1.x * width), int(p1.y * height))
                            pt2 = (int(p2.x * width), int(p2.y * height))
                            cv2.line(annotated_rgb, pt1, pt2, (0, 229, 255), 1)  # Cyan bones

                        # Draw landmark keypoints
                        for lm in hand_landmarks:
                            pt = (int(lm.x * width), int(lm.y * height))
                            cv2.circle(annotated_rgb, pt, 2, (16, 185, 129), -1)  # Green joints

                        # Draw bounding box around hand
                        xs = [int(lm.x * width) for lm in hand_landmarks]
                        ys = [int(lm.y * height) for lm in hand_landmarks]
                        x_min, x_max = max(0, min(xs) - 8), min(width - 1, max(xs) + 8)
                        y_min, y_max = max(0, min(ys) - 8), min(height - 1, max(ys) + 8)

                        box_color = (0, 229, 255) if detected_category and detected_category != 'None' else (148, 163, 184)
                        cv2.rectangle(annotated_rgb, (x_min, y_min), (x_max, y_max), box_color, 1)

                        if detected_category and detected_category != 'None':
                            label_text = f"{detected_category}: {int(detected_score * 100)}%"
                            cv2.putText(annotated_rgb, label_text, (x_min, max(14, y_min - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 255), 1)

                hand_is_moving = self._track_motion(results, now)

                # Swipe detection -> horizontal seek (player) / vertical navigation (home)
                swipe_gesture = self._detect_swipe(results, now)
                if swipe_gesture:
                    swipe_emoji, swipe_desc = SWIPE_LABELS.get(swipe_gesture, ('↔', 'Swipe Detected'))
                    print(f"\n{swipe_emoji} [ML SWIPE DETECTED] {swipe_desc}")
                    self.send_event(
                        gesture=swipe_gesture,
                        confidence=0.9,
                        handedness=detected_hand,
                        message=f"{swipe_emoji} {swipe_desc}"
                    )
                    # Don't also emit a hand-raise/gesture toggle from the swipe motion
                    self.swipe_suppress_until = now + SWIPE_SUPPRESS_SEC

                # Gesture mapping and event debouncing
                mapped_gesture, gesture_desc, gesture_emoji = None, None, None
                if detected_category and detected_category in GESTURE_MAP:
                    mapped_gesture, gesture_desc, gesture_emoji = GESTURE_MAP[detected_category]

                time_since_trigger = now - self.last_trigger_time

                if (
                    mapped_gesture
                    and detected_score >= self.min_confidence
                    and now >= self.swipe_suppress_until
                    and not hand_is_moving
                ):
                    self.neutral_frames = 0
                    if self.last_candidate_gesture == mapped_gesture:
                        self.consecutive_hits += 1
                    else:
                        self.consecutive_hits = 1
                        self.last_candidate_gesture = mapped_gesture

                    if self.consecutive_hits >= self.min_consecutive_frames and not self.is_gesture_active and time_since_trigger > self.cooldown_seconds:
                        self.is_gesture_active = True
                        self.last_trigger_time = now
                        full_msg = f"{gesture_emoji} {gesture_desc}"
                        print(f"\n{gesture_emoji} [ML GESTURE DETECTED] {detected_category} ({detected_hand} Hand, Conf: {detected_score*100:.1f}%)")
                        self.send_event(gesture=mapped_gesture, confidence=detected_score, handedness=detected_hand, message=full_msg)
                else:
                    self.neutral_frames += 1
                    if self.neutral_frames >= 2:
                        self.consecutive_hits = 0
                        self.last_candidate_gesture = None
                        if time_since_trigger > 1.5:
                            self.is_gesture_active = False

                # --- Room presence: count visible people on a fraction of frames ---
                if pose_landmarker is not None and (frame_idx % PRESENCE_FRAME_INTERVAL == 0):
                    try:
                        # Reuse the frame already prepared for gesture recognition
                        pose_result = pose_landmarker.detect(mp_image)
                        self.person_count = count_visible_poses(pose_result)
                        presence_event = self.presence.add_sample(self.person_count, now)
                        if presence_event:
                            event_type, count, previous = presence_event
                            self.send_room_event(event_type, count, previous)
                        if len(results.hand_landmarks or []) == 0:
                            # Draw the count on the preview only when no hand label is shown
                            cv2.putText(annotated_rgb, f"People: {self.person_count}",
                                        (8, height - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 229, 255), 1)
                    except Exception as e:
                        print(f"[PRESENCE WARN] Frame error: {e}")

                # Upload frame to web dashboard every 2nd frame (~5 fps upload)
                if frame_idx % 2 == 0:
                    try:
                        bio = io.BytesIO()
                        im_annotated = Image.fromarray(annotated_rgb)
                        im_annotated.save(bio, format='JPEG', quality=65)
                        headers = {
                            'Content-Type': 'image/jpeg',
                            'X-Engine': 'mediapipe',
                            'X-Gesture': mapped_gesture if (self.is_gesture_active or (mapped_gesture and self.consecutive_hits >= 2)) else '',
                            'X-Message': f"{gesture_emoji} {gesture_desc}" if (mapped_gesture and gesture_emoji) else '',
                            'X-Confidence': f"{detected_score:.2f}",
                            'X-Handedness': detected_hand,
                            'X-Person-Count': str(self.person_count),
                            'X-FPS': f"{current_fps:.1f}",
                        }
                        self.uploader.post_frame(bio.getvalue(), headers)
                    except Exception:
                        pass

                # Periodic heartbeat output every 5 seconds
                if now - fps_start >= 5.0:
                    current_fps = fps_count / (now - fps_start)
                    hands_count = len(results.hand_landmarks) if results.hand_landmarks else 0
                    top_label = detected_category if (detected_category and detected_category != 'None') else 'None'
                    print(f"[ML RUNNING] ~{current_fps:.1f} fps | Hands: {hands_count} | People: {self.person_count} | Active: {top_label} ({detected_score*100:.0f}%)", end='\r', flush=True)
                    fps_count = 0
                    fps_start = now

            except Exception as e:
                print(f"[ML WARN] Frame processing error: {e}")

        self.uploader.stop()
        if self.proc:
            try:
                self.proc.terminate()
            except Exception:
                pass
        print("\n[SENSOR] MediaPipe sensor stopped.")

    def run(self):
        """Entry point based on configured sensor engine."""
        if self.manual_mode:
            self.run_manual_mode()
        elif self.simulate_mode:
            self.run_simulate_mode()
        elif self.engine == 'heuristic':
            self.run_heuristic_mode()
        else:
            self.run_mediapipe_mode()


def main():
    parser = argparse.ArgumentParser(description='LivingFrame Laptop Webcam Room Sensor')
    parser.add_argument('--engine', choices=['mediapipe', 'heuristic'], default='mediapipe', help='Gesture detection engine (default: mediapipe)')
    parser.add_argument('--model', default=DEFAULT_MODEL, help='Path to MediaPipe gesture_recognizer.task model')
    parser.add_argument('--pose-model', default=DEFAULT_POSE_MODEL, help='Path to MediaPipe pose_landmarker_lite.task model (room presence)')
    parser.add_argument('--confidence', type=float, default=0.55, help='Minimum confidence threshold for ML gesture detection (default: 0.55)')
    parser.add_argument('--device', default=DEFAULT_DEVICE, help='V4L2 camera device (default: /dev/video0)')
    parser.add_argument('--server', default=DEFAULT_SERVER, help='WebSocket/HTTP server URL (default: http://localhost:8080)')
    parser.add_argument('--manual', action='store_true', help='Run in manual keypress trigger fallback mode')
    parser.add_argument('--simulate', action='store_true', help='Periodically simulate hand gestures')
    parser.add_argument('--preview', dest='preview', action='store_true', default=True, help='Display live desktop camera window (default: enabled)')
    parser.add_argument('--no-preview', '--headless', dest='preview', action='store_false', help='Run headless without desktop window')

    args = parser.parse_args()
    sensor = WebcamSensor(
        device=args.device,
        server_url=args.server,
        engine=args.engine,
        model_path=args.model,
        pose_model_path=args.pose_model,
        min_confidence=args.confidence,
        manual_mode=args.manual,
        simulate_mode=args.simulate,
        preview=args.preview
    )
    sensor.run()


if __name__ == '__main__':
    main()
