# LivingFrame ❖
### AI-Enhanced Living Room Viewing Experience on Amazon Vega OS
**Amazon Build, Ship, Shape: Amazon Developer Hackathon 2026 (Fire TV Track)**

> *"The TV should not merely display content; it should respond intelligently to the people sharing the room."*

---

## 1. Product Vision

**LivingFrame** transforms traditional TV viewing into a responsive, ambient living room experience. By combining Amazon Vega OS with an ambient room intelligence layer (phone camera sensor + multimodal vision + LLM intelligence), LivingFrame enables the television to adapt naturally to room presence and dynamics:

- **Contextual Arrival Recaps ("Catch Me Up")**: When someone enters the room mid-stream, the TV offers a concise, spoiler-free recap tailored to the viewers present.
- **Natural Interaction**: Simple gestures (hand raise, pointing) summon non-intrusive contextual character bios or scene trivia.
- **Adaptive Atmosphere**: Automatic brightness, audio tone, and UI density adjustments tailored to living room activity.

This milestone establishes the clean, verified **Vega OS React Native application foundation** and a **cinematic TV Home Screen** with remote navigation, dynamic hero spotlight, curated content rows, title details overlay, and room-awareness hooks.

---

## 2. Milestone 1 Deliverables

- **Verified Vega OS Toolchain**: Built and launched using Vega SDK `0.24.12112` and `@amazon-devices/react-native-kepler ~4.0.0`.
- **Cinematic TV Home Screen**:
  - **LivingFrame Header**: Custom brand wordmark, live ambient room sensor indicator (`● Active • 2 Viewers`), clock, and Vega OS branding.
  - **Dynamic Featured Hero Section**: Rich 16:9 cinematic artwork backdrop with dark gradient overlays, title, content rating (`TV-G`, `TV-PG`, `TV-14`), duration, star ratings, and synopsis.
  - **Hero Action Buttons**: `▶ Explore & Watch`, `ℹ More Info`, and `⚡ Catch Me Up (Room AI Recap)`.
  - **Horizontally Arranged Content Rows**:
    1. *Featured & Trending on LivingFrame*
    2. *Living Room Sci-Fi & Speculative Cinema*
    3. *Shared Living Room Favorites (Family & Ambient)*
  - **TV-Optimized Content Cards**: 16:9 aspect ratio, high-contrast focus rings (`#00E5FF`), smooth scale transform (`1.06x`), metadata badges, and auto-scrolling row navigation.
  - **Title Details Modal**: Comprehensive synopsis, metadata, and preview triggers.
  - **Ambient Room Recap Preview**: Demonstrates the upcoming room intelligence feature in action.
- **Offline Reliability & Verified Catalog**: Uses verified Hackathon titles (*ADBT Quest*, *Build Ship Shape Hackathon*, *Aliens From Vega*, *Feline Assistant*, etc.) with guaranteed local fallback and remote sync safety (zero crashes or blank screens if offline).

---

## 3. Project Structure

```text
living-frame/
├── app.json                     # Vega OS KRL application configuration
├── manifest.toml                # Vega OS package manifest & component registration
├── package.json                 # Dependencies and build scripts
├── tsconfig.json                # TypeScript configuration
├── test/
│   ├── App.spec.tsx             # Home screen and component unit tests
│   └── Tile.spec.tsx            # Tile component tests
├── src/
│   ├── App.tsx                  # Root TV Home Screen container
│   ├── assets/
│   │   ├── background.png       # 4K dark cinematic background gradient
│   │   └── vega.png             # Official Vega logo badge
│   ├── theme/
│   │   └── theme.ts             # 10-foot TV design tokens (colors, typography, spacing)
│   ├── types/
│   │   ├── catalog.ts           # MediaItem and ContentCategory interfaces
│   │   └── room.ts              # RoomState, RoomEvent, and SensorStatus types
│   ├── context/
│   │   └── RoomContext.tsx      # Clean architecture Room Awareness state provider
│   ├── data/
│   │   └── catalogData.ts       # Verified fallback catalog items and category sets
│   ├── services/
│   │   └── catalogService.ts    # Resilient catalog provider with offline fallback
│   └── components/
│       ├── Header.tsx           # Brand header with ambient room status
│       ├── HeroBanner.tsx       # Dynamic featured section with action buttons
│       ├── ContentCard.tsx      # TV remote-focusable 16:9 card
│       ├── ContentRow.tsx       # TVFocusGuideView horizontal carousel row
│       ├── TitleDetailsModal.tsx# Cinematic title details dialog
│       └── AmbientRecapModal.tsx# AI Contextual Recap modal (product vision preview)
└── docs/
    └── ARCHITECTURE.md          # Room awareness & AI integration architecture note
```

---

## 4. Prerequisites & Environment

- **Node.js**: `v20.x` or `v22.x` (`v22.22.1` verified)
- **Vega SDK**: `0.24.12112` located at `~/vega/sdk/vega-sdk/main/0.24.12112`
- **Vega CLI**: `~/vega/bin/vega`
- **Platform Framework**: `@amazon-devices/react-native-kepler ~4.0.0`
- **Target OS**: Amazon Vega OS 1.2 (Interactive component `com.amazondeveloper.livingframe.main`)

---

## 5. Verified Commands

### Installation & Quality Checks
```bash
# Install dependencies
npm install

# Type-check with TypeScript compiler
npx tsc --noEmit

# Run ESLint validation
npm run lint

# Run Jest unit tests
npm test
```

### Build Vega Application Package (.vpkg)
```bash
# Debug build (generates x86_64, aarch64, and armv7 packages)
npm run build:debug

# Release build
npm run build:release
```

*Build output location:*
`build/private/kepler/@amazon-devices/livingframe/undefined/vega/x86_64/Debug/@amazon-devices/livingframe_x86_64.vpkg`

### Vega Virtual Device & Deployment
```bash
# 1. Start the Vega Virtual Device (detached background process)
setsid vega virtual-device start > /tmp/vvd.log 2>&1 &

# 2. Verify device is connected
vega device list
# Expected output:
# Found the following device:
# VirtualDevice : tv - x86_64 - OS - amazon-...

# 3. Install and launch LivingFrame onto the Virtual Device
vega run-app build/private/kepler/@amazon-devices/livingframe/undefined/vega/x86_64/Debug/@amazon-devices/livingframe_x86_64.vpkg com.amazondeveloper.livingframe.main --deviceId VirtualDevice

# 4. Confirm app is running on the device
vega device is-app-running --appName com.amazondeveloper.livingframe.main
```

---

## 6. Remote Navigation Controls

When testing on the Vega Virtual Device or using keyboard controls:

| Control | Action |
|---|---|
| **Arrow Right / Left** | Navigate between cards in a row; auto-scrolls the carousel |
| **Arrow Up / Down** | Move between Hero Action buttons and horizontal content rows |
| **Enter / Return (Select)** | Opens Title Details screen for the focused card |
| **Hero Action: Explore** | Triggers media details / preview |
| **Hero Action: Catch Me Up** | Opens the LivingFrame Room AI Contextual Recap modal |
| **Back / Escape (ESC)** | Dismisses details modal or recap modal back to browse grid |

---

## 7. Architecture Note & Next Milestones

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for full details on how the room sensing layer connects to the TV experience:

- **Milestone 2**: Vision Sensor Ingestion (Companion web/mobile stream feeding presence events).
- **Milestone 3**: Interpretation Layer (Event aggregation + Bedrock/Gemini prompt orchestrator).
- **Milestone 4**: Interactive TV Overlay (Seamless picture-in-picture recap HUD and gesture-driven card interactions).

---

## 8. License & Community

- **License**: Released under the [MIT License](./LICENSE) &copy; 2026 Supan Roy.
- **Security Policy**: See [SECURITY.md](./SECURITY.md) for vulnerability reporting.
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- **Contributing**: Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- **Contact**: Supan Roy — [contact@supanroy.com](mailto:contact@supanroy.com)

