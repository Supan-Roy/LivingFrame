#!/usr/bin/env node

/**
 * LivingFrame Laptop WebSocket Test Server
 *
 * Minimal test server for verifying local network communication between
 * the host laptop and the LivingFrame application running in the Vega Virtual Device.
 *
 * Usage:
 *   node scripts/test_ws_server.js
 *   node scripts/test_ws_server.js --port 8080 --host 0.0.0.0
 *
 * Triggers:
 *   - Auto-sends connectivity_test event upon client connection
 *   - HTTP GET/POST http://localhost:8080/trigger to manually broadcast a test event
 */

const http = require('http');
const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Parse CLI arguments or environment variables
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const hostIndex = args.indexOf('--host');

const PORT = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : parseInt(process.env.PORT, 10) || 8080;
const HOST = hostIndex !== -1 ? args[hostIndex + 1] : process.env.HOST || '0.0.0.0';

// Find host LAN IP addresses
function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ interface: name, address: iface.address });
      }
    }
  }
  return addresses;
}

// ---------------------------------------------------------------------------
// Vision sensor (webcam + MediaPipe CV) process lifecycle
// ---------------------------------------------------------------------------
let sensorProcess = null;

function getSensorPython() {
  const venvPython = path.join(__dirname, '..', '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return process.env.PYTHON || 'python3';
}

function findSensorPid() {
  try {
    for (const entry of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) {
        continue;
      }
      try {
        const parts = fs
          .readFileSync(`/proc/${entry}/cmdline`, 'utf8')
          .split('\0')
          .filter(Boolean);
        if (parts.length < 2) {
          continue;
        }
        const exe = path.basename(parts[0]);
        const isPython = /python/i.test(exe);
        const runsScript = parts.slice(1).some((arg) => arg.endsWith('webcam_sensor.py'));
        if (isPython && runsScript) {
          return parseInt(entry, 10);
        }
      } catch (_e) {
        // Process vanished between listing and read
      }
    }
  } catch (_e) {
    // /proc unavailable (non-Linux host)
  }
  return null;
}

function isSensorRunning() {
  if (sensorProcess && sensorProcess.exitCode === null && !sensorProcess.killed) {
    return true;
  }
  // Also report sensors started outside the server (e.g. manually from the CLI)
  return findSensorPid() !== null;
}

function broadcastVisionStatus() {
  broadcast({
    type: 'vision_status',
    enabled: isSensorRunning(),
    timestamp: Date.now(),
  });
}

function startSensor() {
  if (isSensorRunning()) {
    return { started: false, alreadyRunning: true };
  }
  const python = getSensorPython();
  const script = path.join(__dirname, 'webcam_sensor.py');
  console.log(`[VISION] Starting webcam sensor: ${python} ${script}`);

  sensorProcess = spawn(python, [script], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  sensorProcess.stdout.on('data', (chunk) => process.stdout.write(`[VISION] ${chunk}`));
  sensorProcess.stderr.on('data', (chunk) => process.stderr.write(`[VISION:ERR] ${chunk}`));
  sensorProcess.on('error', (err) => {
    console.error(`[VISION] Failed to start sensor: ${err.message}`);
    sensorProcess = null;
    broadcastVisionStatus();
  });
  sensorProcess.on('exit', (code, signal) => {
    console.log(`[VISION] Sensor exited (code=${code}, signal=${signal || 'none'})`);
    sensorProcess = null;
    broadcastVisionStatus();
  });

  broadcastVisionStatus();
  return { started: true, alreadyRunning: false };
}

function stopSensor() {
  const owned = sensorProcess && sensorProcess.exitCode === null && !sensorProcess.killed;
  const pid = owned ? sensorProcess.pid : findSensorPid();
  if (!pid) {
    return { stopped: false, alreadyRunning: false };
  }

  console.log(`[VISION] Stopping webcam sensor (pid=${pid})...`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    console.warn(`[VISION] Failed to signal sensor: ${err.message}`);
  }
  // Force-kill if the sensor (e.g. blocked on stdin) does not exit promptly
  const forceTimer = setTimeout(() => {
    const stillAlive = owned
      ? sensorProcess && sensorProcess.exitCode === null
      : findSensorPid() === pid;
    if (stillAlive) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (_e) {
        // Process already gone
      }
    }
  }, 2000);
  if (forceTimer.unref) {
    forceTimer.unref();
  }
  return { stopped: true };
}

let latestFrameBuffer = null;
let latestSensorTelemetry = {
  activeGesture: null,
  gestureMessage: null,
  confidence: 0,
  handedness: null,
  engine: 'mediapipe',
  skinCount: 0,
  baseline: 0,
  delta: 0,
  fps: 0,
  timestamp: Date.now(),
};

// Recent room-presence events, surfaced on the dashboard log
const roomEvents = [];

function recordRoomEvent(payload) {
  if (!payload || typeof payload.type !== 'string' || !payload.type.startsWith('person_')) {
    return;
  }
  roomEvents.push({
    type: payload.type,
    count: payload.payload?.personCount ?? payload.payload?.count ?? null,
    previousCount: payload.payload?.previousCount ?? null,
    source: payload.source || 'webcam',
    message: payload.message || '',
    timestamp: payload.timestamp || Date.now(),
  });
  if (roomEvents.length > 20) {
    roomEvents.shift();
  }
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const url = req.url || '/';

  // Health check
  if (url === '/health' || url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'LivingFrame-Laptop-Test-Server',
      connectedClients: wss.clients.size,
      hasCameraFeed: latestFrameBuffer !== null,
      visionRunning: isSensorRunning(),
      telemetry: latestSensorTelemetry,
      timestamp: Date.now(),
    }));
    return;
  }

  // Vision sensor lifecycle control (starts/stops the real webcam + MediaPipe pipeline)
  if (url.startsWith('/vision/')) {
    if (url === '/vision/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ action: 'status', running: isSensorRunning(), timestamp: Date.now() }));
      return;
    }
    let action;
    if (url === '/vision/start') {
      action = 'start';
      startSensor();
    } else if (url === '/vision/stop') {
      action = 'stop';
      stopSensor();
    } else if (url === '/vision/toggle') {
      action = 'toggle';
      if (isSensorRunning()) {
        stopSensor();
      } else {
        startSensor();
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown vision endpoint' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ action, running: isSensorRunning(), timestamp: Date.now() }));
    return;
  }

  // App telemetry debug logger
  if (url === '/telemetry/log') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log(`[VEGA APP] ${body}`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ status: 'logged' }));
    });
    return;
  }

  // Camera preview endpoints
  if (url === '/camera/frame') {
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        latestFrameBuffer = Buffer.concat(chunks);
        latestSensorTelemetry = {
          activeGesture: req.headers['x-gesture'] || null,
          gestureMessage: req.headers['x-message'] || null,
          confidence: parseFloat(req.headers['x-confidence']) || 0,
          handedness: req.headers['x-handedness'] || null,
          engine: req.headers['x-engine'] || 'mediapipe',
          skinCount: parseInt(req.headers['x-skin-count'], 10) || 0,
          baseline: parseInt(req.headers['x-baseline'], 10) || 0,
          delta: parseInt(req.headers['x-delta'], 10) || 0,
          fps: parseFloat(req.headers['x-fps']) || 0,
          personCount: parseInt(req.headers['x-person-count'], 10) || 0,
          timestamp: Date.now(),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'frame_received' }));
      });
      return;
    }

    if (latestFrameBuffer) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(latestFrameBuffer);
    } else {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  if (url === '/camera/telemetry') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(latestSensorTelemetry));
    return;
  }

  // Live Camera HTML Preview Page
  if (url === '/camera' || url === '/preview') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LivingFrame Vision Sensor — Live Camera Feed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0B0F19;
      color: #E2E8F0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 24px;
    }
    .header {
      width: 100%;
      max-width: 960px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .title-row { display: flex; align-items: center; gap: 12px; }
    .badge {
      background: rgba(0, 229, 255, 0.15);
      border: 1.5px solid #00E5FF;
      color: #00E5FF;
      font-size: 20px;
      font-weight: 800;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .badge-diamond {
      width: 13px;
      height: 13px;
      border: 2px solid #00E5FF;
      border-radius: 2px;
      transform: rotate(45deg);
    }
    h1 { font-size: 18px; font-weight: 800; letter-spacing: 1px; color: #FFFFFF; }
    h1 span { color: #00E5FF; }
    .subtitle { font-size: 11px; color: #94A3B8; letter-spacing: 0.5px; }
    .live-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #10B981;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
    }
    .dot { width: 8px; height: 8px; background: #10B981; border-radius: 50%; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }
    .camera-card {
      position: relative;
      width: 100%;
      max-width: 960px;
      background: #0F172A;
      border: 2px solid rgba(0, 229, 255, 0.3);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
    }
    .video-viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      background: #050810;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #camera-feed {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .detection-zone {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 35%;
      border-bottom: 2px dashed rgba(255, 193, 7, 0.6);
      background: rgba(255, 193, 7, 0.05);
      pointer-events: none;
      display: flex;
      align-items: flex-start;
      padding: 10px 14px;
    }
    .zone-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: #FFC107;
      background: rgba(15, 23, 42, 0.85);
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid rgba(255, 193, 7, 0.4);
    }
    .alert-banner {
      display: none;
      position: absolute;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 107, 53, 0.95);
      color: #FFFFFF;
      padding: 10px 20px;
      border-radius: 24px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1px;
      box-shadow: 0 4px 16px rgba(255, 107, 53, 0.5);
      animation: bounce 0.4s ease;
      z-index: 10;
    }
    @keyframes bounce { 0% { transform: translate(-50%, -10px); } 100% { transform: translate(-50%, 0); } }
    .metrics-bar {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      padding: 14px 20px;
      background: rgba(15, 23, 42, 0.9);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      gap: 12px;
    }
    .metric { display: flex; flex-direction: column; }
    .metric-label { font-size: 9.5px; font-weight: 700; color: #64748B; letter-spacing: 0.5px; margin-bottom: 2px; }
    .metric-val { font-size: 14px; font-weight: 800; color: #F8FAFC; }
    .metric-val.green { color: #10B981; }
    .metric-val.cyan { color: #00E5FF; }
    .metric-val.gold { color: #FFC107; }
    .footer {
      width: 100%;
      max-width: 960px;
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #64748B;
    }
    .btn-manual {
      background: #00E5FF;
      color: #000;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .btn-manual:active { transform: scale(0.96); }
    .room-log {
      width: 100%;
      max-width: 960px;
      margin-top: 16px;
      background: #0F172A;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 14px 18px;
    }
    .room-log-title {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #64748B;
      margin-bottom: 8px;
    }
    .room-log-list { font-size: 12px; color: #CBD5E1; line-height: 18px; }
    .room-log-list .evt-enter { color: #34D399; font-weight: 700; }
    .room-log-list .evt-left { color: #FBBF24; font-weight: 700; }
    .room-log-list .evt-src { color: #64748B; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <div class="badge"><span class="badge-diamond"></span></div>
      <div>
        <h1>LIVING<span>FRAME</span></h1>
        <div class="subtitle">ROOM SENSOR — MEDIAPIPE GESTURE RECOGNIZER</div>
      </div>
    </div>
    <div class="live-tag">
      <div class="dot"></div>
      <span id="engine-tag">ML INFERENCE ACTIVE</span>
    </div>
  </div>

  <div class="camera-card">
    <div class="video-viewport">
      <img id="camera-feed" src="/camera/frame" alt="Webcam Feed Loading..." onerror="this.style.opacity='0.5'" onload="this.style.opacity='1'" />
      <div class="detection-zone">
        <span id="zone-label" class="zone-label">MEDIAPIPE ML ACTIVE (FULL FRAME HAND TRACKING)</span>
      </div>
      <div id="alert-banner" class="alert-banner">
        GESTURE DETECTED • SENT TO VEGA TV
      </div>
    </div>

    <div class="metrics-bar">
      <div class="metric">
        <span class="metric-label">INFERENCE ENGINE</span>
        <span id="metric-engine" class="metric-val green">MediaPipe ML</span>
      </div>
      <div class="metric">
        <span class="metric-label">DETECTED GESTURE</span>
        <span id="metric-gesture" class="metric-val cyan">None</span>
      </div>
      <div class="metric">
        <span class="metric-label">ML CONFIDENCE</span>
        <span id="metric-conf" class="metric-val gold">-- %</span>
      </div>
      <div class="metric">
        <span class="metric-label">CAMERA FPS</span>
        <span id="metric-fps" class="metric-val">-- fps</span>
      </div>
      <div class="metric">
        <span class="metric-label">PEOPLE IN VIEW</span>
        <span id="metric-people" class="metric-val cyan">0</span>
      </div>
    </div>
  </div>

  <div class="room-log">
    <div class="room-log-title">ROOM EVENTS (person_entered / person_left)</div>
    <div id="room-log-list" class="room-log-list">No room events yet.</div>
  </div>

  <div class="footer">
    <span>Privacy Mode: 100% Local Inference (Zero cloud streaming)</span>
    <div style="display: flex; gap: 8px;">
      <button class="btn-manual" onclick="fetch('/gesture/hand_raised').then(r=>r.json()).then(d=>console.log(d))">Hand Raised</button>
      <button class="btn-manual" onclick="fetch('/gesture/swipe_left').then(r=>r.json()).then(d=>console.log(d))">Swipe Left</button>
      <button class="btn-manual" onclick="fetch('/gesture/swipe_right').then(r=>r.json()).then(d=>console.log(d))">Swipe Right</button>
      <button class="btn-manual" onclick="fetch('/gesture/thumbs_up').then(r=>r.json()).then(d=>console.log(d))">Thumbs Up</button>
      <button class="btn-manual" onclick="fetch('/gesture/closed_fist').then(r=>r.json()).then(d=>console.log(d))">Closed Fist</button>
      <button class="btn-manual" onclick="fetch('/room/person_entered').then(r=>r.json()).then(d=>console.log(d))">Person Entered</button>
      <button class="btn-manual" onclick="fetch('/room/person_left').then(r=>r.json()).then(d=>console.log(d))">Person Left</button>
    </div>
  </div>

  <script>
    const feed = document.getElementById('camera-feed');
    const alertBanner = document.getElementById('alert-banner');
    const metricEngine = document.getElementById('metric-engine');
    const metricGesture = document.getElementById('metric-gesture');
    const metricConf = document.getElementById('metric-conf');
    const metricFps = document.getElementById('metric-fps');
    const metricPeople = document.getElementById('metric-people');
    const roomLogList = document.getElementById('room-log-list');
    let alertTimer = null;

    // Refresh image feed smoothly
    setInterval(() => {
      feed.src = '/camera/frame?t=' + Date.now();
    }, 100);

    // Poll telemetry metrics
    setInterval(async () => {
      try {
        const res = await fetch('/camera/telemetry');
        if (!res.ok) return;
        const data = await res.json();
        metricEngine.innerText = (data.engine === 'mediapipe' ? 'MediaPipe ML' : 'Heuristic');
        metricFps.innerText = (data.fps || 10).toFixed(1) + ' fps';
        metricPeople.innerText = String(data.personCount || 0);

        if (data.activeGesture && data.activeGesture !== 'None') {
          const label = data.activeGesture.replace(/_/g, ' ').toUpperCase();
          metricGesture.innerText = label;
          metricConf.innerText = data.confidence ? (data.confidence * 100).toFixed(1) + '%' : '--';

          alertBanner.innerText = label + ' DETECTED • SENT TO VEGA TV';
          alertBanner.style.display = 'block';
          if (alertTimer) clearTimeout(alertTimer);
          alertTimer = setTimeout(() => { alertBanner.style.display = 'none'; }, 2500);
        } else {
          metricGesture.innerText = 'None';
          metricConf.innerText = '--';
        }
      } catch (err) {}
    }, 250);

    // Room-presence event log
    setInterval(async () => {
      try {
        const res = await fetch('/room/events');
        if (!res.ok) return;
        const data = await res.json();
        const events = (data.events || []).slice().reverse();
        if (!events.length) {
          roomLogList.innerHTML = 'No room events yet.';
          return;
        }
        roomLogList.innerHTML = events
          .map(e => {
            const t = new Date(e.timestamp).toLocaleTimeString();
            const cls = e.type === 'person_entered' ? 'evt-enter' : 'evt-left';
            const label = e.type === 'person_entered' ? 'ENTERED' : 'LEFT';
            const src = e.source === 'manual' ? 'manual trigger' : 'webcam';
            return '<div>' + t + ' &middot; <span class="' + cls + '">' + label +
              '</span> &middot; ' + e.count + ' in view <span class="evt-src">(' + src + ')</span></div>';
          })
          .join('');
      } catch (err) {}
    }, 1000);
  </script>
</body>
</html>`);
    return;
  }

  // Room-presence endpoints
  //   GET /room/events            -> recent room events (dashboard log)
  //   GET /room/person_entered    -> manual person-entered event (testing)
  //   GET /room/person_left       -> manual person-left event (testing)
  if (url.startsWith('/room/')) {
    if (url.startsWith('/room/events')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ events: roomEvents }));
      return;
    }

    if (url.startsWith('/room/person_entered') || url.startsWith('/room/person_left')) {
      const entered = url.startsWith('/room/person_entered');
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const rawCount = parseInt(parsedUrl.searchParams.get('count'), 10);
      const currentCount = Number.isFinite(rawCount) ? rawCount : (entered ? 2 : 1);
      const previousCount = entered ? Math.max(0, currentCount - 1) : currentCount + 1;
      const childPresent = parsedUrl.searchParams.get('child') === '1';
      const manualPayload = {
        type: entered ? 'person_entered' : 'person_left',
        source: 'manual',
        message: entered
          ? `Person entered · ${currentCount} in view (manual)`
          : `Person left · ${currentCount} in view (manual)`,
        payload: {
          personCount: currentCount,
          count: currentCount,
          previousCount,
          delta: currentCount - previousCount,
          childCount: childPresent ? 1 : 0,
          childPresent,
        },
        timestamp: Date.now(),
      };
      recordRoomEvent(manualPayload);
      const notified = broadcast(manualPayload);
      console.log(`[ROOM] Manual ${manualPayload.type} (count=${currentCount}) -> ${notified} client(s)`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ status: 'event_dispatched', source: 'manual', clientsNotified: notified, event: manualPayload }));
      return;
    }
  }

  // Handle gesture trigger and manual test endpoints (GET or POST)
  if (url.startsWith('/gesture/') || url.startsWith('/trigger') || url === '/event') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const gestureMatch = url.match(/\/gesture\/([a-zA-Z0-9_]+)/);
          const pathGesture = gestureMatch ? gestureMatch[1] : undefined;
          const gesture = parsed.gesture || pathGesture || (url.includes('hand_raised') ? 'hand_raised' : undefined);
          const payload = {
            type: parsed.type || (gesture ? 'gesture_detected' : 'connectivity_test'),
            gesture: gesture,
            confidence: parsed.confidence,
            handedness: parsed.handedness,
            engine: parsed.engine || 'mediapipe',
            source: parsed.source,
            message: parsed.message || (gesture ? `${gesture.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Detected` : 'Event from Laptop Sensor'),
            itemId: parsed.itemId,
            // Pass the client's structured payload through (personCount, etc.)
            payload: {...(parsed.payload || {}), itemId: parsed.itemId},
            timestamp: parsed.timestamp || Date.now(),
          };
          recordRoomEvent(payload);
          const count = broadcast(payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'event_dispatched', clientsNotified: count, event: payload }));
        } catch (_err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    // GET request with query params
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const gestureMatch = url.match(/\/gesture\/([a-zA-Z0-9_]+)/);
    const pathGesture = gestureMatch ? gestureMatch[1] : undefined;
    const gesture = parsedUrl.searchParams.get('gesture') || pathGesture || (url.includes('hand_raised') ? 'hand_raised' : undefined);
    const type = parsedUrl.searchParams.get('type') || (gesture ? 'gesture_detected' : 'connectivity_test');
    const customMessage = parsedUrl.searchParams.get('message') || (gesture ? `${gesture.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Detected` : 'Triggered Event from Laptop');
    const itemId = parsedUrl.searchParams.get('itemId') || undefined;

    const payload = {
      type: type,
      gesture: gesture,
      confidence: parseFloat(parsedUrl.searchParams.get('confidence')) || 0.95,
      engine: parsedUrl.searchParams.get('engine') || 'mediapipe',
      message: customMessage,
      itemId: itemId,
      payload: { itemId: itemId },
      timestamp: Date.now(),
    };
    const count = broadcast(payload);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'event_dispatched',
      clientsNotified: count,
      event: payload,
    }));
    return;
  }

// In-memory cache for fast video streaming without disk I/O
const videoBufferCache = new Map();
function getCachedVideoBuffer(filePath) {
  let buf = videoBufferCache.get(filePath);
  if (!buf) {
    buf = fs.readFileSync(filePath);
    videoBufferCache.set(filePath, buf);
  }
  return buf;
}

  // Video streaming endpoint with Range request support (HTTP 206) & in-memory caching
  if (url.startsWith('/videos/')) {
    const rawName = url.split('?')[0].replace('/videos/', '');
    const safeName = path.basename(rawName);
    const filePath = path.join(__dirname, '../public/videos', safeName);

    if (!fs.existsSync(filePath)) {
      console.warn(`[HTTP Video 404] ${safeName} not found`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Video Not Found: ' + safeName);
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    console.log(`[HTTP Video Stream] ${req.method} ${safeName} range=${range || 'none'} size=${fileSize}`);

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.end();
      return;
    }

    const buf = getCachedVideoBuffer(filePath);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      };
      res.writeHead(206, head);
      res.end(buf.subarray(start, end + 1));
    } else {
      const head = {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      };
      res.writeHead(200, head);
      res.end(buf);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

function broadcast(payload, excludeWs = null) {
  const messageStr = JSON.stringify(payload);
  let count = 0;
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
      count++;
    }
  }
  console.log(`[SERVER BROADCAST] Dispatched '${payload.type}' (gesture: ${payload.gesture || 'none'}) to ${count} client(s): ${payload.message}`);
  return count;
}

wss.on('connection', (ws, req) => {
  const remoteAddress = req.socket.remoteAddress;
  const remotePort = req.socket.remotePort;
  console.log(`\n[CLIENT CONNECTED] From ${remoteAddress}:${remotePort} at ${new Date().toISOString()}`);

  // Send initial connectivity_test event to newly connected client
  const welcomePayload = {
    type: 'connectivity_test',
    message: 'Hello LivingFrame from Laptop',
    timestamp: Date.now(),
  };

  ws.send(JSON.stringify(welcomePayload));
  console.log(`[SERVER SEND] Welcome event sent to client at ${remoteAddress}:${remotePort}`);

  // Inform the freshly connected client of the current vision-control state
  ws.send(JSON.stringify({
    type: 'vision_status',
    enabled: isSensorRunning(),
    timestamp: Date.now(),
  }));

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      console.log(`[CLIENT MESSAGE] Received from ${remoteAddress}:`, parsed);

      // TV app toggling gesture control -> start/stop the real vision pipeline
      if (parsed.type === 'vision_control') {
        console.log(`[VISION] Command from TV client: enabled=${!!parsed.enabled}`);
        if (parsed.enabled) {
          startSensor();
        } else {
          stopSensor();
        }
        ws.send(JSON.stringify({
          type: 'vision_status',
          enabled: isSensorRunning(),
          timestamp: Date.now(),
        }));
        return;
      }

      // Rebroadcast sensor gestures / room events to other connected clients (TV app)
      if (parsed.type && parsed.type !== 'app_connected') {
        if (!parsed.timestamp) parsed.timestamp = Date.now();
        broadcast(parsed, ws);
      }
    } catch (_err) {
      console.log(`[CLIENT MESSAGE] Received raw text from ${remoteAddress}:`, data.toString());
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[CLIENT DISCONNECTED] Client ${remoteAddress}:${remotePort} disconnected. Code: ${code}, Reason: ${reason || 'none'}`);
  });

  ws.on('error', (err) => {
    console.error(`[CLIENT ERROR] Error from ${remoteAddress}:${remotePort}:`, err.message);
  });
});

server.listen(PORT, HOST, () => {
  console.log('========================================================');
  console.log('   LivingFrame Laptop Connectivity Test Server');
  console.log('========================================================');
  console.log(`[STATUS] Listening on: http://${HOST}:${PORT} and ws://${HOST}:${PORT}`);
  console.log('[NETWORK] Reachable addresses for Vega Virtual Device:');
  console.log(`  - QEMU Host Gateway: ws://10.0.2.2:${PORT}`);
  const lans = getLanAddresses();
  lans.forEach((lan) => {
    console.log(`  - LAN (${lan.interface}): ws://${lan.address}:${PORT}`);
  });
  console.log('--------------------------------------------------------');
  console.log('To trigger a test message manually:');
  console.log(`  curl http://localhost:${PORT}/trigger?message=CustomMessage`);
  console.log('To trigger a hand-raised gesture event:');
  console.log(`  curl http://localhost:${PORT}/gesture/hand_raised`);
  console.log('To toggle the webcam AI vision sensor (gesture control):');
  console.log(`  curl http://localhost:${PORT}/vision/start   # start`);
  console.log(`  curl http://localhost:${PORT}/vision/stop    # stop`);
  console.log('========================================================\n');
});

// Ensure the spawned vision sensor is not orphaned when the server stops
function shutdownServer() {
  if (isSensorRunning()) {
    stopSensor();
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2500);
}

process.on('SIGINT', shutdownServer);
process.on('SIGTERM', shutdownServer);
