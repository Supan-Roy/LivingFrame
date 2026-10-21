# LivingFrame API & Protocol Reference

This document details the REST endpoints, WebSocket event contracts, remote control key mappings, and test accessibility identifiers across the **LivingFrame** platform.

---

## 1. REST API Specification

The embedded local gateway ([scripts/test_ws_server.js](file:///home/supanroy/Projects/LivingFrame/scripts/test_ws_server.js)) exposes HTTP services on port `8080`:

- **Host Base URL**: `http://localhost:8080`
- **Vega Virtual Device Base URL**: `http://10.0.2.2:8080`

### Health & System Status

#### `GET /health`
Returns health metrics, client connection counts, and vision engine status.

**Response (`200 OK`)**:
```json
{
  "status": "ok",
  "service": "LivingFrame-Gateway",
  "connectedClients": 1,
  "hasCameraFeed": true,
  "visionRunning": true,
  "telemetry": {
    "activeGesture": "thumbs_up",
    "confidence": 0.94,
    "fps": 28.5,
    "timestamp": 1792590220365
  },
  "timestamp": 1792590703938
}
```

---

### Media Streaming (HTTP Range)

#### `GET /videos/:id.mp4`
Streams H.264/AAC 1080p MP4 assets with native HTTP 206 Partial Content byte-range negotiation for smooth scrubbing and zero buffering on Vega OS.

**Request Headers**:
```http
Range: bytes=1048576-2097151
```

**Response (`206 Partial Content`)**:
```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 1048576-2097151/15728640
Accept-Ranges: bytes
Content-Length: 1048576
Content-Type: video/mp4
```

---

### Deterministic Room & Vision Simulation Endpoints

These endpoints allow automated testing and verification of all room scenarios without requiring physical camera hardware:

#### `GET /room/attention`
Simulates attention and orientation state transitions.
- **Query Parameters**:
  - `distracted` (`integer`, `0` or `1`): Number of turned-away viewers.
  - `attentive` (`integer`, `0` or `1`): Number of attentive viewers facing the TV.
- **Example**: `GET /room/attention?distracted=1&attentive=0`
- **Response (`200 OK`)**:
  ```json
  {
    "status": "event_dispatched",
    "source": "manual",
    "clientsNotified": 1,
    "event": {
      "type": "attention_state",
      "payload": {
        "attentiveCount": 0,
        "distractedCount": 1,
        "isDistracted": true,
        "inattentiveRatio": 1.0,
        "viewerCount": 1
      }
    }
  }
  ```

#### `GET /room/person_entered`
Simulates viewers entering the living room.
- **Query Parameters**: `count` (`integer`, new total occupancy).
- **Example**: `GET /room/person_entered?count=2`

#### `GET /room/person_left`
Simulates viewers leaving the living room.
- **Query Parameters**: `count` (`integer`, new total occupancy).
- **Example**: `GET /room/person_left?count=1`

#### `GET /room/gesture`
Simulates on-demand gesture recognition.
- **Query Parameters**: `gesture` (`string`, e.g. `thumbs_up`, `open_palm`, `swipe_left`, `swipe_right`).
- **Example**: `GET /room/gesture?gesture=thumbs_up`

---

### Vision Subprocess Management

#### `GET /vision/start`
Launches `scripts/webcam_sensor.py` as a child process.

#### `GET /vision/stop`
Gracefully terminates the active webcam sensor subprocess.

#### `GET /vision/status`
Returns `{ "running": boolean, "pid": number | null }`.

---

## 2. WebSocket Protocol (`ws://10.0.2.2:8080`)

The Fire TV application maintains a persistent, auto-reconnecting WebSocket connection to the gateway to receive real-time room events.

### Message Envelope Structure
All messages conform to the following JSON schema:
```typescript
interface RoomEventMessage {
  type: 'attention_state' | 'person_entered' | 'person_left' | 'gesture_detected' | 'room_state';
  source: 'sensor' | 'manual' | 'app';
  message?: string;
  payload: Record<string, any>;
  timestamp: number;
}
```

### Event Catalog

#### 1. Attention State Event (`attention_state`)
Emitted by the sensor when viewer orientation or inattention ratio shifts:
```json
{
  "type": "attention_state",
  "source": "sensor",
  "message": "Viewers facing TV (1/1) · Attentive",
  "payload": {
    "attentiveCount": 1,
    "distractedCount": 0,
    "isDistracted": false,
    "inattentiveRatio": 0.0,
    "viewerCount": 1
  },
  "timestamp": 1792590708117
}
```

#### 2. Presence Shift Event (`person_entered` / `person_left`)
Emitted when room occupancy changes after majority stabilization:
```json
{
  "type": "person_entered",
  "source": "sensor",
  "message": "Room presence changed: 2 viewers",
  "payload": {
    "personCount": 2,
    "previousCount": 1
  },
  "timestamp": 1792590800000
}
```

#### 3. Gesture Detection Event (`gesture_detected`)
Emitted upon confident hand gesture classification:
```json
{
  "type": "gesture_detected",
  "source": "sensor",
  "message": "Gesture: thumbs_up (0.94)",
  "payload": {
    "gesture": "thumbs_up",
    "confidence": 0.94,
    "handedness": "Right"
  },
  "timestamp": 1792590815000
}
```

---

## 3. Remote Control Key Mappings

LivingFrame captures native remote events using `useTVEventHandler`:

| Action / Event | Native Key Code | Behavior in Application |
|---|---|---|
| `dpadLeft` | `KeyEvent.KEYCODE_DPAD_LEFT` | Moves focus left; scrubs video backward 10s during playback |
| `dpadRight` | `KeyEvent.KEYCODE_DPAD_RIGHT` | Moves focus right; scrubs video forward 10s during playback |
| `dpadUp` | `KeyEvent.KEYCODE_DPAD_UP` | Moves focus upward; reveals player HUD controls |
| `dpadDown` | `KeyEvent.KEYCODE_DPAD_DOWN` | Moves focus downward; hides player HUD controls |
| `select` | `KeyEvent.KEYCODE_DPAD_CENTER` | Selects focused element / toggles Play and Pause |
| `playPause` | `KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE` | Toggles Play and Pause directly |
| `rewind` | `KeyEvent.KEYCODE_MEDIA_REWIND` | Instant 10-second rewind |
| `fastForward` | `KeyEvent.KEYCODE_MEDIA_FAST_FORWARD` | Instant 10-second fast-forward |
| `back` | `KeyEvent.KEYCODE_BACK` | Closes active modals; exits video player back to browse grid |

---

## 4. Test Automation Accessibility IDs

All interactive TV elements provide explicit `testID` attributes for Jest and automated accessibility audits:

| Test ID | Element Description |
|---|---|
| `livingframe-videoplayer-view` | Root container for the full-screen video player |
| `kepler-video-surface-view` | Native Kepler hardware video surface plane |
| `btn-screen-toggle-controls` | Invisible full-screen tap target for 1-click HUD toggle |
| `btn-attention-keep-playing` | "Keep Playing 👍" button on Attention Prompt card |
| `btn-attention-replay-accept` | "Rewind Xs" button on Attention Replay banner |
| `btn-attention-replay-dismiss`| "Dismiss" button on Attention Replay banner |
| `btn-recap-offer-show` | "Show Recap" button on Arrival Recap offer banner |
| `btn-recap-offer-dismiss` | "Dismiss" button on Arrival Recap offer banner |
| `btn-recap-modal-resume` | "Resume Movie" button inside active recap modal |
| `btn-family-mode-toggle` | Family Mode switch in header / player HUD |
| `btn-gesture-control-toggle` | Gestures On / Off switch in player HUD |
| `room-notice` | Toast notification pill displaying environmental alerts |
