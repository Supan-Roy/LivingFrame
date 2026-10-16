# Contributing to LivingFrame

Thank you for your interest in contributing to **LivingFrame**! LivingFrame is an AI-enhanced living room viewing experience built for **Amazon's Build, Ship, Shape: Developer Hackathon 2026** (Fire TV / Vega OS Track).

---

## Code of Conduct

All contributors are expected to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md). Please report any unacceptable behavior to [contact@supanroy.com](mailto:contact@supanroy.com).

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.x` or `v22.x`
- **Amazon Vega SDK**: `0.24.12112` or later
- **Vega CLI**: Installed and configured on your `PATH`
- **Platform Framework**: `@amazon-devices/react-native-kepler ~4.0.0`

### Local Setup

```bash
# Clone the repository
git clone https://github.com/Supan-Roy/LivingFrame.git
cd LivingFrame

# Install dependencies
npm install
```

---

## Development Workflow

### 1. Code Style & Verification

Before submitting code, ensure that all validation checks pass with zero errors:

```bash
# 1. TypeScript verification
npx tsc --noEmit

# 2. Linting (ESLint with Kepler plugin)
npm run lint

# 3. Unit test execution
npm test
```

### 2. Building for Vega OS

```bash
# Debug build (generates x86_64, aarch64, and armv7 vpkg bundles)
npm run build:debug

# Release build
npm run build:release
```

### 3. Testing on the Vega Virtual Device

```bash
# Start the virtual device
vega virtual-device start

# Deploy and launch the application package
vega run-app build/private/kepler/@amazon-devices/livingframe/undefined/vega/x86_64/Debug/@amazon-devices/livingframe_x86_64.vpkg com.amazondeveloper.livingframe.main --deviceId VirtualDevice
```

---

## Submitting Pull Requests

1. **Fork & Branch**: Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Commit Guidelines**: Use clear, conventional commit messages:
   - `feat:` new feature or UI component
   - `fix:` bug fix
   - `docs:` documentation updates
   - `refactor:` code restructuring without feature change
   - `test:` test suite additions
3. **PR Template**: Complete the pull request template checklist, including testing confirmation on the Vega Virtual Device or emulator.

---

## Questions and Feedback

For any questions, design discussions, or support, feel free to reach out to:

- **Lead Maintainer**: Supan Roy
- **Email**: [contact@supanroy.com](mailto:contact@supanroy.com)
