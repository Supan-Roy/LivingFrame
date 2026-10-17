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
      timestamp: Date.now(),
    }));
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
