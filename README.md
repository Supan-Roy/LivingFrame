# LivingFrame ❖
### AI-Enhanced Living Room Viewing Experience on Amazon Vega OS
**Amazon Build, Ship, Shape: Amazon Developer Hackathon 2026 (Fire TV Track)**

> *"The TV should not merely display content; it should respond intelligently to the people sharing the room."*

---

## 1. Product Vision

**LivingFrame** transforms traditional TV viewing into a responsive, ambient living room experience. By combining Amazon Vega OS with an ambient room intelligence layer (phone/laptop camera sensor + multimodal vision + LLM intelligence), LivingFrame enables the television to adapt naturally to room presence and dynamics:

- **Hardware-Accelerated Native Video**: Pure W3C media pipeline built with `@amazon-devices/react-native-w3cmedia` (`VideoPlayer` + `KeplerVideoSurfaceView`) and HTTP Range streaming.
- **Calibrated Monotonic Seek Bar**: Rock-solid linear time progression (`00:00` $\to$ `00:10`) immune to virtual decoder buffer surges, with seamless looping.
- **Immersive Full-Screen Controls**: 5-second inactivity auto-hide with 1-click full-screen toggle overlay.
- **Contextual Arrival Recaps ("Catch Me Up")**: When someone enters the room mid-stream, the TV offers a concise, spoiler-free recap tailored to the viewers present.
- **Natural Interaction**: Simple gestures (hand raise, pointing) summon non-intrusive contextual character bios or scene trivia.
- **Adaptive Atmosphere**: Real-time room presence and viewer count sync over local WebSocket.

---

## 2. Architecture & Service Ports

LivingFrame operates across a unified local mesh connecting the Vega Virtual Device with host services:

```text
 ┌─────────────────────────────────────────────────────────────┐
 │                     HOST LAPTOP / WORKSTATION                │
 │                                                             │
 │  ┌───────────────────────┐       ┌───────────────────────┐  │
 │  │   Metro Bundler       │       │ Video & WS Server     │  │
 │  │   Port 8081           │       │ Port 8080             │  │
 │  │   (react-native start)│       │ (test_ws_server.js)   │  │
 │  └───────────▲───────────┘       └───────────▲───────────┘  │
 │              │                               │              │
 │              │ (JS Bundle)                   │ (MP4 Stream  │
 │              │                               │  & WS Events)│
 │  ┌───────────┴───────────────────────────────┴───────────┐  │
 │  │            AMAZON VEGA VIRTUAL DEVICE                 │  │
 │  │            Ports 5554 / 5555                          │  │
 │  │                                                       │  │
 │  │   LivingFrame TV App                                  │  │
 │  │   ├── Home Screen (Hero Banner, Rows, Details Modal)  │  │
 │  │   ├── VideoPlayerView (VideoPlayer + SurfaceView)     │  │
 │  │   └── RoomContext (WebSocket Client -> 10.0.2.2:8080) │  │
 │  └───────────────────────────────────────────────────────┘  │
 │                              ▲                              │
 │                              │ (Telemetry & Frames)         │
 │  ┌───────────────────────────┴───────────────────────────┐  │
 │  │   Vision Sensor Pipeline (MediaPipe Gesture Engine)   │  │
 │  │   scripts/webcam_sensor.py                            │  │
 │  └───────────────────────────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────┘
```

### Port Overview

| Port | Service | Role | Accessible from Vega VM As |
|---|---|---|---|
| **`8080`** | Video & WS Server (`scripts/test_ws_server.js`) | Streams catalog MP4 videos via HTTP Range & delivers real-time room events / gestures | `http://10.0.2.2:8080` / `ws://10.0.2.2:8080` |
| **`8081`** | Metro Bundler (`react-native start`) | Compiles and serves the React Native / Kepler JavaScript bundle | `http://10.0.2.2:8081` |
| **`5554` / `5555`** | Vega Virtual Device (QEMU & VDA) | Virtual Fire TV / Vega OS 1.2 runtime displaying the application | `localhost` |

---

## 3. Project Structure

```text
LivingFrame/
├── manifest.toml                # Vega OS package manifest, permissions & media services
├── app.json                     # Vega OS KRL application configuration
├── package.json                 # Dependencies and build scripts
├── tsconfig.json                # TypeScript configuration
├── public/
│   └── videos/                  # 9 Catalog MP4 titles (H.264/AAC ~10s clips)
├── scripts/
│   ├── test_ws_server.js        # Port 8080 HTTP range video server + WebSocket gateway
│   └── webcam_sensor.py         # MediaPipe gesture detection & room presence sensor
├── src/
│   ├── App.tsx                  # Root TV application controller & modal dispatcher
│   ├── assets/                  # 4K dark cinematic background gradient & Vega badges
│   ├── components/
│   │   ├── VideoPlayerView.tsx  # Native VideoPlayer + KeplerVideoSurfaceView with sync
│   │   ├── Header.tsx           # Brand header with live ambient room sensor status
│   │   ├── HeroBanner.tsx       # Dynamic featured hero section with action buttons
│   │   ├── ContentCard.tsx      # 16:9 TV remote-focusable content card
│   │   ├── ContentRow.tsx       # TVFocusGuideView horizontal carousel row
│   │   ├── TitleDetailsModal.tsx# Cinematic title synopsis dialog
│   │   ├── AmbientRecapModal.tsx# AI Contextual Recap modal ("Catch Me Up")
│   │   └── GestureReactionOverlay.tsx # In-stream room gesture response HUD
│   ├── context/
│   │   └── RoomContext.tsx      # Real-time WebSocket room awareness state provider
│   ├── data/
│   │   └── catalogData.ts       # Curated 9-title catalog items & category sets
│   ├── services/
│   │   └── catalogService.ts    # Resilient catalog provider with offline fallback
│   ├── theme/
│   │   └── theme.ts             # 10-foot TV design tokens (colors, typography, spacing)
│   └── types/
│       ├── catalog.ts           # MediaItem and ContentCategory interfaces
│       └── room.ts              # RoomState, RoomEvent, and SensorStatus types
└── test/
    ├── App.spec.tsx             # Home screen, video player, and remote event tests
    └── Tile.spec.tsx            # Tile component tests
```

---

## 4. How to Run the Project (Step-by-Step)

To run the project with all ports enabled, open **3 terminal tabs**:

### Step 1: Start the Video & Room Awareness Server (Port 8080)
> **Crucial:** Must be running for videos to stream and room sensors to connect.
```bash
node scripts/test_ws_server.js
```
*(Runs on `http://0.0.0.0:8080` and `ws://0.0.0.0:8080` with minimal memory footprint).*

---

### Step 2: Start the Metro JavaScript Bundler (Port 8081)
```bash
npm start
# or: npx react-native start --port 8081
```

---

### Step 3: Launch the Vega Virtual Device & Deploy App

1. **Start the Vega Virtual Device:**
   ```bash
   vega virtual-device start
   ```

2. **Verify device connection:**
   ```bash
   vega device list
   # Expected:
   # Found the following device:
   # VirtualDevice : tv - x86_64 - OS - amazon-...
   ```

3. **Build the Debug Package (`.vpkg`):**
   ```bash
   vega build --buildTypes Debug --targets x86_64
   ```

4. **Install & Launch onto the Virtual Device:**
   ```bash
   vega run-app build/private/kepler/@amazon-devices/livingframe/undefined/vega/x86_64/Debug/@amazon-devices/livingframe_x86_64.vpkg
   ```

---

### Optional Step 4: Laptop Camera AI Vision Sensor (Gesture Control)
The webcam + MediaPipe pipeline can be launched either from the TV or from the CLI:

**From the TV (recommended):** open any video and toggle the **🎥 GESTURES OFF / ON** button in the
player header. Turning it **ON** starts the real sensor process (and pops up the native camera
preview window on the laptop); turning it **OFF** stops the process and releases the camera. The
button reflects the live state reported by the server.

**From the CLI:**
```bash
python3 scripts/webcam_sensor.py
```
*(Live camera feed + landmarks are also viewable in your browser at `http://localhost:8080/preview`).*

**From the server API:**
```bash
curl http://localhost:8080/vision/start   # start the webcam sensor
curl http://localhost:8080/vision/stop    # stop the webcam sensor
curl http://localhost:8080/vision/status  # current running state
```

---

## 5. Health & Verification Commands

Verify all running services at any time:

```bash
# 1. Verify Video & WebSocket server (port 8080)
curl -I http://localhost:8080/health
curl -I http://localhost:8080/videos/behind-the-screams.mp4

# 2. Verify Metro Bundler (port 8081)
curl -s http://localhost:8081/status
# Expected: packager-status:running

# 3. Trigger video playback remotely on the TV
curl -s "http://localhost:8080/trigger?type=play_video&itemId=behind-the-screams"

# 4. Trigger simulated hand-raised room gesture
curl -s "http://localhost:8080/gesture/hand_raised"

# 5. Start / stop the real webcam gesture-control sensor
curl -s "http://localhost:8080/vision/start"
curl -s "http://localhost:8080/vision/stop"

# 6. Run automated tests (low memory mode)
npm test -- --runInBand
```

---

## 6. Remote Navigation & Player Controls

### Home Screen Navigation
| Control | Action |
|---|---|
| **Arrow Right / Left** | Navigate between cards in a row; auto-scrolls the carousel |
| **Arrow Up / Down** | Move between Hero Action buttons and horizontal content rows |
| **Enter / Return (Select)** | Opens Title Details screen for the focused card |
| **Hero: Explore & Watch** | Launches native full-screen video player |
| **Hero: More Info** | Opens Title Details modal dialog |
| **Hero: Catch Me Up** | Opens the LivingFrame Room AI Contextual Recap modal |
| **Back / Escape (ESC)** | Exits modals back to browse grid, or exits app at root |

### Video Player Controls
| Control | Action |
|---|---|
| **Click Anywhere on Screen** | **1-Click Full Screen Toggle**: Hides or restores all controls and overlays |
| **5-Second Inactivity** | **Auto-Hide**: HUD, vignettes, and buttons automatically disappear |
| **Space / Return / Select** | Play / Pause toggle |
| **Arrow Left / Rewind Key** | Rewind 10 seconds (smooth seek bar update) |
| **Arrow Right / Fast-Forward** | Fast-Forward 10 seconds |
| **Button: Restart (↺)** | Resets video to `00:00` and resumes playback |
| **Button: Room Context (⚡)** | Opens live ambient room context recap overlay |
| **Button: Gesture Control (🎥 GESTURES OFF/ON)** | Starts / stops the real webcam + MediaPipe sensor. When ON, hand gestures control playback |
| **Gesture: Raise Hand (✋)** | *(gesture control ON)* Toggles Play / Pause |
| **Gesture: Swipe Left / Right (⏪ ⏩)** | *(gesture control ON)* Seek back / forward 5 seconds |
| **Button: Back (←)** / **ESC** | Exits video player and returns to browse screen |

---

## 7. Room-Aware Playback (Family Mode) — Demo

LivingFrame reacts to changes in the **room**, not just to hand gestures.

**Presence detection (local, no cloud).** The sensor runs MediaPipe's Pose Landmarker
(lite, ~5.8 MB) on a fraction of camera frames and emits `person_entered` / `person_left`
over the existing WebSocket. It counts **visible people only** — no identity, age, or face
recognition. Download the model once:

```bash
curl -L -o models/pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```

If it is missing, gesture control still works and presence detection is simply disabled.

**Family Mode.** In the player header, toggle **👨‍👩‍👧 FAMILY ON**. When Family Mode is on
and a new person enters, the room policy arms. If the playhead is inside a scene tagged in
the asset's authored metadata, playback **pauses**, the picture is covered, and a warning
explains why. Playback resumes automatically when the room clears, or via *Resume anyway*.
With Family Mode off, playback is completely unaffected.

**Authored safety metadata** (`src/data/catalogData.ts`) — hand-written per demo asset,
not content analysis: `Behind The Screams` is tagged `adult_content` for its whole 10 s
clip; `Cereal Streamz` and `Feline Assistant` are marked family-safe.

**Manual room triggers** (test playback behaviour without a camera):
```bash
curl -s "http://localhost:8080/room/person_entered?count=2"
curl -s "http://localhost:8080/room/person_left?count=1"
curl -s "http://localhost:8080/room/events"
```
The dashboard (`/camera`) shows the live **people in view** count and a room-event log, and
labels manual events as `manual trigger` so they are distinguishable from real detection.

**Deterministic demo**
1. Start the server, Metro and the Vega app; play **Behind The Screams**.
2. In the player, turn **FAMILY ON**.
3. Let a second person enter (or trigger `person_entered`) — the dashboard logs the event.
4. The TV pauses, blacks out, and explains why.
5. Trigger `person_left` → playback resumes automatically.
6. Turn **FAMILY OFF** and repeat: playback continues untouched.

**Tests:** `npm test -- --runInBand` (scene-policy + catalog metadata) and
`.venv/bin/python test/presence_stabilizer_test.py` (presence debounce/cooldown).

---

## 8. License & Community

- **License**: Released under the [MIT License](./LICENSE) &copy; 2026 Supan Roy.
- **Security Policy**: See [SECURITY.md](./SECURITY.md) for vulnerability reporting.
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- **Contributing**: Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- **Contact**: Supan Roy — [contact@supanroy.com](mailto:contact@supanroy.com)
