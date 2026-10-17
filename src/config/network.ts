/**
 * LivingFrame Sensor Hub & WebSocket Network Configuration
 *
 * Configurable endpoints for connecting the Vega TV app to the development laptop sensor server.
 *
 * Inside the Vega Virtual Device (QEMU):
 * - '10.0.2.2' maps to the host laptop's loopback interface via QEMU gateway.
 * - '192.168.0.102' connects over the physical host LAN interface.
 *
 * Candidates are attempted in sequence to ensure seamless connectivity across both
 * local emulators and physical Fire TV devices on the same Wi-Fi network.
 */

export const SENSOR_SERVER_CANDIDATES = [
  'ws://10.0.2.2:8080',       // QEMU Virtual Device host gateway
  'ws://192.168.0.102:8080',  // Development Laptop Wi-Fi LAN IP
];

export const WS_RECONNECT_INTERVAL_MS = 5000;
