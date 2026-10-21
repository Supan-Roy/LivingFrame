# Amazon Fire TV (Vega OS & Kepler SDK) Developer Friction Log

**Project**: LivingFrame — Intelligent, Ambient Room-Aware Media Experience for Amazon Fire TV  
**Repository**: [https://github.com/Supan-Roy/LivingFrame](https://github.com/Supan-Roy/LivingFrame)  
**Platform Evaluated**: Amazon Vega OS 1.2, Kepler SDK (`@amazon-devices/react-native-kepler` v4.0.0), W3C Media API (`@amazon-devices/react-native-w3cmedia` v2.3.2), Vega CLI (`vega` v0.24.12112)

---

## Executive Summary

During the development of **LivingFrame**—a native React Native Kepler media application with on-device computer vision and playback state intelligence—we systematically documented architectural friction points encountered when interfacing with Vega OS native subsystems.

This document details:
1. **Friction Log 1**: Asynchronous Race Condition in Native Surface-to-Player Handoff (`@amazon-devices/react-native-w3cmedia`).
2. **Friction Log 2**: Remote Key Event Leakage & Focus Bleed During React 18 Modal Transitions (`@amazon-devices/react-native-kepler`).
3. **Friction Log 3**: Subnet Translation & Port Forwarding Isolation in Vega Virtual Devices (`vda` / QEMU).
4. **Feature Requests & Priority Ratings**: High-impact improvements for the Vega OS developer ecosystem.

---

## Friction Log 1: Asynchronous Race Condition in Native Surface-to-Player Handoff

### 1. Specific Task Attempted
Initializing hardware-accelerated video decoding on Amazon Vega OS and attaching the platform compositor surface view (`KeplerVideoSurfaceView`) to the JavaScript `VideoPlayer` controller within a React Native component lifecycle.

### 2. Steps Taken
1. Instantiated native player controller: `const player = new VideoPlayer()`.
2. Mounted declarative video surface in JSX:
   ```tsx
   <KeplerVideoSurfaceView
     onSurfaceViewCreated={handleSurfaceCreated}
     onSurfaceViewDestroyed={handleSurfaceDestroyed}
   />
   ```
3. In `useEffect`, invoked `player.initialize()` and attached event listeners (`loadedmetadata`, `loadeddata`, `playing`, etc.).
4. When `handleSurfaceCreated(handle)` fired, passed the native surface handle to the player: `player.setSurfaceHandle(handle)`.
5. Called `player.load(targetSrc)` and `player.play()`.

### 3. Expected vs. Actual Result
- **Expected Result**: 
  The asynchronous player initialization promise and the native surface creation event would resolve in a deterministic lifecycle order, allowing seamless attachment without requiring manual synchronization barriers.
- **Actual Result**: 
  A multi-thread race condition occurs between the JavaScript/V8 thread (`player.initialize()`) and the platform UI/compositor thread (`onSurfaceViewCreated`):
  - **Case A (Surface fires before player resolves)**: If `player.setSurfaceHandle(handle)` is called while `player.initialize()` is still in flight, the native Kepler bridge throws an unhandled promise rejection.
  - **Case B (Player loads before surface attaches)**: If `player.load(src)` executes before the compositor surface has finished allocating, the hardware decoder decodes frames into an orphaned buffer. The player enters `playing` state, audio streams cleanly, but the screen remains permanently black with zero error events thrown (`player.error` remains `null`).

### 4. Severity Rating
**High / Blocker** (causes silent rendering failures on cold app starts, video restarts, or rapid view transitions).

### 5. Workaround Implemented
Implemented a defensive multi-state rendezvous machine in [src/components/VideoPlayerView.tsx](file:///home/supanroy/Projects/LivingFrame/src/components/VideoPlayerView.tsx):
- Created three mutable synchronization refs: `isInitializedRef`, `surfaceHandleRef`, and `isLoadedRef`.
- Implemented a unified gate function `tryAttachAndLoad()`:
  ```typescript
  const tryAttachAndLoad = useCallback(() => {
    const player = playerRef.current;
    const handle = surfaceHandleRef.current;
    if (!player || !isInitializedRef.current || !handle || isLoadedRef.current) {
      return; // Wait until both subsystems have rendezvoused
    }
    try {
      player.setSurfaceHandle(handle);
      player.src = targetSrc;
      player.load();
      isLoadedRef.current = true;
    } catch (e) {
      console.warn('[LivingFrame Video] Surface attach retry required:', e);
    }
  }, [targetSrc]);
  ```
- Guaranteed symmetrical teardown in `handleSurfaceDestroyed` by clearing the surface handle before deinitializing.

### 6. Actionable Suggestion for Amazon
Abstract the low-level string handle handoff entirely from JavaScript. Introduce a composite React component that encapsulates the surface view and player lifecycle natively in C++:
```tsx
// Suggested Amazon Kepler API:
<KeplerVideoView
  player={player}
  src={targetSrc}
  onReady={() => console.log('Decoder and Surface synchronized')}
/>
```
Alternatively, expose a formal promise API on `VideoPlayer`:
`await player.attachSurface(surfaceRef);` that handles internal queuing automatically.

---

## Friction Log 2: Remote Key Event Leakage & Focus Bleed During React 18 Modal Transitions

### 1. Specific Task Attempted
Displaying dynamic contextual modal dialogs (such as the Arrival Recap overlay, Attention-Aware Prompt, or Child Safety Advisory) over active media playback, while trapping TV remote DPAD focus exclusively within the modal and blocking background player controls.

### 2. Steps Taken
1. Registered global TV remote event listeners using Kepler's `useTVEventHandler`:
   ```tsx
   useTVEventHandler((evt) => {
     if (evt.eventType === 'dpadLeft') handleRewind();
     if (evt.eventType === 'dpadRight') handleFastForward();
     if (evt.eventType === 'select') handleTogglePlay();
   });
   ```
2. Implemented modal overlay containing focusable buttons configured with `hasTVPreferredFocus={true}` inside a `TVFocusGuideView`.
3. Set modal visibility state to `true` when room intelligence triggers an overlay.

### 3. Expected vs. Actual Result
- **Expected Result**: 
  When the modal becomes visible, remote focus should immediately transfer to the modal's primary action button, and background player keybindings (scrubbing Left/Right) should be suppressed.
- **Actual Result**: 
  Due to React 18 batched state updates and asynchronous layout measurement, the native focus manager takes several milliseconds to resolve `hasTVPreferredFocus` on the modal element. During this intermediate frame, `useTVEventHandler` on the parent view continues receiving remote key events. When a user presses DPAD Left or Select to interact with the newly presented prompt, the keystroke bleeds into the background video player, accidentally scrubbing the film or toggling pause behind the modal.

### 4. Severity Rating
**Moderate / UX Degradation** (violates Amazon 10-foot TV design standards by creating accidental background navigation).

### 5. Workaround Implemented
Architected an explicit event-interception barrier at the entry point of `useTVEventHandler` in [src/components/VideoPlayerView.tsx](file:///home/supanroy/Projects/LivingFrame/src/components/VideoPlayerView.tsx):
- Maintained synchronous layout refs (`isShowingRecap`, `isAttentionPaused`, `isProtectionBlocked`, `attentionReplayOffer`).
- Hard-blocked media player actions at the top of the event callback:
  ```typescript
  if (isAttentionPaused || isShowingRecap || isProtectionBlocked || attentionReplayOffer) {
    // Media controls strictly suppressed while overlays are active
    handleOverlayRemoteNavigation(evt);
    return;
  }
  ```

### 6. Actionable Suggestion for Amazon
Introduce a native `TVFocusTrap` or `TVModal` primitive in `@amazon-devices/react-native-kepler` that automatically pauses lower-priority focus zones and prevents remote key event dispatch from propagating down the view hierarchy while an overlay is mounted.

---

## Friction Log 3: Subnet Translation & Port Forwarding Isolation in Vega Virtual Devices

### 1. Specific Task Attempted
Connecting the Fire TV application running inside the Vega Virtual Device emulator to a local background service (such as an on-device sensor gateway or media server) running on the developer workstation.

### 2. Steps Taken
1. Started local WebSocket server on host machine at `http://127.0.0.1:8080`.
2. Attempted to connect from the TV application via `ws://localhost:8080`.
3. Tested `vega device start-port-forwarding` and `vda forward` CLI tools.

### 3. Expected vs. Actual Result
- **Expected Result**: 
  Clear documentation on how Vega QEMU networking translates host addresses, or seamless automated port forwarding for development servers.
- **Actual Result**: 
  Connecting to `localhost` fails silently because the emulator routes to its own internal loopback interface. While standard Android emulators use `10.0.2.2`, Vega OS documentation does not explicitly document the QEMU host loopback mapping, nor does `vda reverse` provide clear status output when port bindings collide.

### 4. Severity Rating
**Low / Onboarding Friction** (causes initial confusion for developers building edge-to-TV architectures).

### 5. Workaround Implemented
Implemented a multi-tier address fallback resolver in [src/context/RoomContext.tsx](file:///home/supanroy/Projects/LivingFrame/src/context/RoomContext.tsx) that attempts connection to `10.0.2.2:8080` first, with graceful fallback to `127.0.0.1:8080` and automated reconnection retry timers.

### 6. Actionable Suggestion for Amazon
Add a dedicated section in the Vega CLI developer guide outlining guest-to-host network routing (`10.0.2.2`), and introduce an automated reverse tunnel command (e.g. `vega device bridge --port 8080`).

---

## Feature Requests & Priority Ratings for Amazon Vega Platform Team

| Feature Request | Description | Priority Rating | Impact on Developers |
|---|---|---|---|
| **`<KeplerVideoView>` High-Level Component** | A declarative video component that encapsulates surface creation, handle binding, and player lifecycle internally in native C++. | **Critical** | Eliminates asynchronous race conditions and reduces boilerplate for all Fire TV media developers. |
| **`TVFocusTrap` / Native `TVModal` Primitive** | A native view wrapper that locks remote focus within modal boundaries and suppresses background event dispatch. | **Important** | Ensures compliance with Amazon 10-foot UI design guidelines without complex custom event barriers. |
| **Integrated Emulator Screenshot / Screen Recording CLI** | A built-in command in Vega CLI (`vega device screenshot` / `vega device record-screen`). | **Important** | Greatly streamlines automated visual regression testing, CI/CD validation, and hackathon demo creation. |
| **Deterministic Surface Lifecycle Events** | Adding explicit `onSurfaceReady` and `onSurfaceDetached` lifecycle hooks to `KeplerVideoSurfaceView`. | **Nice-to-have** | Provides developers with reliable hooks for transitions and picture-in-picture modes. |
