#!/usr/bin/env python3
"""
LivingFrame Laptop Webcam Room Sensor
=====================================
Minimal, privacy-preserving local vision sensor that detects a hand-raise gesture
and dispatches real-time room awareness events to the local WebSocket server.

Key Features:
- 100% Local Processing: Raw video never leaves memory; zero streaming or disk recording.
- Zero Heavy Dependencies: Uses native GStreamer pipeline and standard Pillow (PIL).
- Dynamic Baseline & Debouncing: Calibrates to ambient room lighting and prevents duplicate triggers.
- Manual Fallback: Supports keyboard trigger (Enter) and simulation flags for camera-free testing.

Usage:
  python3 scripts/webcam_sensor.py
  python3 scripts/webcam_sensor.py --device /dev/video0 --server http://localhost:8080
  python3 scripts/webcam_sensor.py --manual     # Trigger via Enter key without webcam
  python3 scripts/webcam_sensor.py --simulate   # Periodically fire simulated gestures
"""

import sys
import os
import time
import signal
import argparse
import subprocess
import json
import urllib.request
import urllib.error
from PIL import Image

# Pipeline parameters
DEFAULT_WIDTH = 160
DEFAULT_HEIGHT = 120
DEFAULT_DEVICE = '/dev/video0'
DEFAULT_SERVER = 'http://localhost:8080'

# Detection parameters
UPPER_ZONE_FRACTION = 0.35      # Upper 35% of frame (Y < 42)
SKIN_DELTA_THRESHOLD = 500      # Increase in skin pixels over baseline
MIN_CONSECUTIVE_FRAMES = 2      # Frames to confirm gesture
COOLDOWN_SECONDS = 3.0          # Refractory period to prevent duplicate events


class WebcamSensor:
    def __init__(self, device=DEFAULT_DEVICE, server_url=DEFAULT_SERVER, manual_mode=False, simulate_mode=False):
        self.device = device
        self.server_url = server_url.rstrip('/')
        self.manual_mode = manual_mode
        self.simulate_mode = simulate_mode
        self.running = True
        self.proc = None
        
        # Geometry
        self.width = DEFAULT_WIDTH
        self.height = DEFAULT_HEIGHT
        self.frame_size = self.width * self.height * 3
        self.upper_pixels = int(self.width * (self.height * UPPER_ZONE_FRACTION))

        # State tracking
        self.baseline_skin = 180.0
        self.consecutive_hits = 0
        self.last_trigger_time = 0.0
        self.is_gesture_active = False

        # Register signals
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

    def _handle_signal(self, signum, frame):
        print("\n[SENSOR] Shutdown signal received. Stopping sensor cleanly...")
        self.running = False
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=1.0)
            except Exception:
                pass

    def send_event(self, gesture='hand_raised', confidence=0.95):
        """Send small JSON event to laptop WebSocket/HTTP server."""
        payload = {
            'type': 'gesture_detected',
            'gesture': gesture,
            'confidence': confidence,
            'source': 'laptop_webcam_sensor',
            'timestamp': int(time.time() * 1000),
            'message': 'Hand Raised Detected'
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
                print(f"📡 [EVENT SENT] '{gesture}' (conf={confidence:.2f}) -> {clients} connected TV client(s) notified!")
                return True
        except urllib.error.URLError as e:
            print(f"⚠️ [EVENT FAILED] Could not contact server at {trigger_url}: {e.reason}")
            return False
        except Exception as e:
            print(f"⚠️ [EVENT ERROR] {e}")
            return False

    def run_manual_mode(self):
        """Allow manual keyboard trigger fallback without requiring webcam."""
        print("========================================================")
        print("   LivingFrame Manual Event Sensor (Fallback Mode)")
        print("========================================================")
        print(f"Target Server: {self.server_url}")
        print("Press [Enter] to dispatch a 'hand_raised' gesture event.")
        print("Type 'q' and press [Enter] to quit.")
        print("--------------------------------------------------------")

        while self.running:
            try:
                user_input = input(">> Press [Enter] to trigger Hand-Raise: ")
                if user_input.strip().lower() == 'q':
                    break
                self.send_event(gesture='hand_raised', confidence=1.0)
            except (EOFError, KeyboardInterrupt):
                break

    def run_simulate_mode(self):
        """Simulate periodic hand-raise gestures for automated testing."""
        print("========================================================")
        print("   LivingFrame Simulation Sensor Mode")
        print("========================================================")
        print(f"Target Server: {self.server_url}")
        print("Firing a simulated 'hand_raised' event every 8 seconds...")
        print("Press Ctrl+C to stop.")
        print("--------------------------------------------------------")

        while self.running:
            time.sleep(8)
            if not self.running:
                break
            self.send_event(gesture='hand_raised', confidence=0.98)

    def run_camera_mode(self):
        """Real-time webcam pipeline using native GStreamer and PIL."""
        if not os.path.exists(self.device):
            print(f"❌ Camera device '{self.device}' not found.")
            print("Switching to manual fallback mode...")
            self.run_manual_mode()
            return

        cmd = [
            'gst-launch-1.0', '-q',
            'v4l2src', f'device={self.device}',
            '!', 'videoconvert',
            '!', 'videoscale',
            '!', f'video/x-raw,format=RGB,width={self.width},height={self.height},framerate=10/1',
            '!', 'fdsink'
        ]

        print("========================================================")
        print("   LivingFrame Real-Time Laptop Webcam Sensor")
        print("========================================================")
        print(f"Video Device : {self.device}")
        print(f"Resolution   : {self.width}x{self.height} @ 10fps (in-memory)")
        print(f"Target Server: {self.server_url}")
        print(f"Privacy Mode : 100% Local Processing (Zero video streaming/storage)")
        print("--------------------------------------------------------")
        print("Instructions:")
        print("  - Sit facing the laptop camera naturally.")
        print("  - Raise your hand ✋ into the upper view of the webcam.")
        print("  - Press Ctrl+C to exit.")
        print("========================================================\n")

        try:
            self.proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=self.frame_size * 2
            )
        except Exception as e:
            print(f"❌ Failed to start GStreamer capture: {e}")
            print("Falling back to manual trigger mode...")
            self.run_manual_mode()
            return

        fps_count = 0
        fps_start = time.time()

        while self.running and self.proc.poll() is None:
            raw_data = self.proc.stdout.read(self.frame_size)
            if len(raw_data) != self.frame_size:
                break

            fps_count += 1
            now = time.time()

            # Process frame in memory
            try:
                # Convert raw RGB to YCbCr for fast skin segmentation
                im = Image.frombytes('RGB', (self.width, self.height), raw_data).convert('YCbCr')
                _, cb, cr = im.split()
                cb_bytes = cb.tobytes()
                cr_bytes = cr.tobytes()

                # Count skin pixels in upper zone (Y < upper_pixels / width)
                upper_skin = 0
                for idx in range(self.upper_pixels):
                    if 77 <= cb_bytes[idx] <= 127 and 133 <= cr_bytes[idx] <= 173:
                        upper_skin += 1

                # Adaptive baseline tracking during idle state
                delta = upper_skin - self.baseline_skin

                # Detection logic with debouncing and cooldown
                time_since_trigger = now - self.last_trigger_time

                if delta > SKIN_DELTA_THRESHOLD and time_since_trigger > COOLDOWN_SECONDS:
                    self.consecutive_hits += 1
                    if self.consecutive_hits >= MIN_CONSECUTIVE_FRAMES and not self.is_gesture_active:
                        # Gesture confirmed!
                        self.is_gesture_active = True
                        self.last_trigger_time = now
                        confidence = min(0.99, max(0.85, 0.85 + (delta / 2500.0) * 0.14))
                        print(f"\n✋ [GESTURE DETECTED] Hand Raised! (Skin count: {upper_skin}, Baseline: {int(self.baseline_skin)}, Delta: +{int(delta)})")
                        self.send_event(gesture='hand_raised', confidence=confidence)
                else:
                    self.consecutive_hits = 0
                    if delta < (SKIN_DELTA_THRESHOLD * 0.5):
                        self.is_gesture_active = False
                        # Smooth baseline adaptation when hand is lowered
                        self.baseline_skin = 0.95 * self.baseline_skin + 0.05 * upper_skin

                # Periodic heartbeat output every 5 seconds
                if now - fps_start >= 5.0:
                    fps = fps_count / (now - fps_start)
                    print(f"[SENSOR RUNNING] ~{fps:.1f} fps | Ambient skin baseline: {int(self.baseline_skin)} px | Delta: {int(delta):+d} px", end='\r', flush=True)
                    fps_count = 0
                    fps_start = now

            except Exception as e:
                print(f"[SENSOR WARN] Frame processing error: {e}")

        if self.proc:
            try:
                self.proc.terminate()
            except Exception:
                pass
        print("\n[SENSOR] Sensor stopped.")


def main():
    parser = argparse.ArgumentParser(description='LivingFrame Laptop Webcam Room Sensor')
    parser.add_argument('--device', default=DEFAULT_DEVICE, help='V4L2 camera device (default: /dev/video0)')
    parser.add_argument('--server', default=DEFAULT_SERVER, help='WebSocket/HTTP server URL (default: http://localhost:8080)')
    parser.add_argument('--manual', action='store_true', help='Run in manual keypress trigger fallback mode')
    parser.add_argument('--simulate', action='store_true', help='Periodically simulate hand-raise gestures')

    args = parser.parse_args()
    sensor = WebcamSensor(
        device=args.device,
        server_url=args.server,
        manual_mode=args.manual,
        simulate_mode=args.simulate
    )

    if args.manual:
        sensor.run_manual_mode()
    elif args.simulate:
        sensor.run_simulate_mode()
    else:
        sensor.run_camera_mode()


if __name__ == '__main__':
    main()
