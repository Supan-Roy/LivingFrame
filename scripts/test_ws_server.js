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

let latestFrameBuffer = null;
let latestSensorTelemetry = {
  activeGesture: null,
  gestureMessage: null,
  skinCount: 0,
  baseline: 0,
  delta: 0,
  fps: 0,
  timestamp: Date.now(),
};

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
      timestamp: Date.now(),
    }));
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
          skinCount: parseInt(req.headers['x-skin-count'], 10) || 0,
          baseline: parseInt(req.headers['x-baseline'], 10) || 0,
          delta: parseInt(req.headers['x-delta'], 10) || 0,
          fps: parseFloat(req.headers['x-fps']) || 0,
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
      max-width: 680px;
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
      max-width: 680px;
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
      grid-template-columns: repeat(4, 1fr);
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
      max-width: 680px;
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
  </style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <div class="badge">❖</div>
      <div>
        <h1>LIVING<span>FRAME</span></h1>
        <div class="subtitle">LAPTOP ROOM SENSOR — LIVE WEBCAM FEED</div>
      </div>
    </div>
    <div class="live-tag">
      <div class="dot"></div>
      CAMERA ACTIVE
    </div>
  </div>

  <div class="camera-card">
    <div class="video-viewport">
      <img id="camera-feed" src="/camera/frame" alt="Webcam Feed Loading..." onerror="this.style.opacity='0.5'" onload="this.style.opacity='1'" />
      <div class="detection-zone">
        <span class="zone-label">✋ GESTURE ZONE (UPPER 35%)</span>
      </div>
      <div id="alert-banner" class="alert-banner">
        ✋ HAND-RAISE DETECTED • SENT TO VEGA TV
      </div>
    </div>

    <div class="metrics-bar">
      <div class="metric">
        <span class="metric-label">CAMERA FPS</span>
        <span id="metric-fps" class="metric-val cyan">-- fps</span>
      </div>
      <div class="metric">
        <span class="metric-label">UPPER SKIN PIXELS</span>
        <span id="metric-skin" class="metric-val gold">-- px</span>
      </div>
      <div class="metric">
        <span class="metric-label">DELTA OVER BASELINE</span>
        <span id="metric-delta" class="metric-val">-- px</span>
      </div>
      <div class="metric">
        <span class="metric-label">TV APP STATUS</span>
        <span id="metric-tv" class="metric-val green">CONNECTED</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>Privacy Mode: 100% Local Inference (Zero cloud streaming)</span>
    <button class="btn-manual" onclick="fetch('/gesture/hand_raised').then(r=>r.json()).then(d=>console.log(d))">⚡ Test Hand Raise Event</button>
  </div>

  <script>
    const feed = document.getElementById('camera-feed');
    const alertBanner = document.getElementById('alert-banner');
    const metricFps = document.getElementById('metric-fps');
    const metricSkin = document.getElementById('metric-skin');
    const metricDelta = document.getElementById('metric-delta');
    let alertTimer = null;

    // Refresh image feed smoothly
    setInterval(() => {
      feed.src = '/camera/frame?t=' + Date.now();
    }, 120);

    // Poll telemetry metrics
    setInterval(async () => {
      try {
        const res = await fetch('/camera/telemetry');
        if (!res.ok) return;
        const data = await res.json();
        metricFps.innerText = (data.fps || 10).toFixed(1) + ' fps';
        metricSkin.innerText = (data.skinCount || 0) + ' px';
        metricDelta.innerText = (data.delta >= 0 ? '+' : '') + (data.delta || 0) + ' px';
        
        if (data.activeGesture === 'hand_raised') {
          alertBanner.style.display = 'block';
          if (alertTimer) clearTimeout(alertTimer);
          alertTimer = setTimeout(() => { alertBanner.style.display = 'none'; }, 3000);
        }
      } catch (err) {}
    }, 300);
  </script>
</body>
</html>`);
    return;
  }

  // Handle gesture trigger and manual test endpoints (GET or POST)
  if (url.startsWith('/gesture/') || url.startsWith('/trigger') || url === '/event') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const payload = {
            type: parsed.type || (url.includes('hand_raised') ? 'gesture_detected' : 'connectivity_test'),
            gesture: parsed.gesture || (url.includes('hand_raised') ? 'hand_raised' : undefined),
            message: parsed.message || (parsed.gesture === 'hand_raised' ? 'Hand Raised Detected' : 'Event from Laptop Sensor'),
            timestamp: parsed.timestamp || Date.now(),
          };
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
    const isHandRaised = url.includes('/hand_raised') || parsedUrl.searchParams.get('gesture') === 'hand_raised' || parsedUrl.searchParams.get('type') === 'hand_raised';
    const type = parsedUrl.searchParams.get('type') || (isHandRaised ? 'gesture_detected' : 'connectivity_test');
    const gesture = parsedUrl.searchParams.get('gesture') || (isHandRaised ? 'hand_raised' : undefined);
    const customMessage = parsedUrl.searchParams.get('message') || (isHandRaised ? 'Hand Raised Detected' : 'Triggered Event from Laptop');

    const payload = {
      type: type,
      gesture: gesture,
      message: customMessage,
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

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      console.log(`[CLIENT MESSAGE] Received from ${remoteAddress}:`, parsed);

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
  console.log('========================================================\n');
});
