// relay.js (updated)
// Connect to ttfm-socket and forward events to Python webhook, plus accept outbound sends from Python.

require('dotenv').config({ path: '../.env' });
const express = require('express');
const bodyParser = require('body-parser');
const { SocketClient } = require('ttfm-socket');
const axios = require('axios');

const SOCKET_URL = process.env.TTFM_SOCKET_BASE_URL || 'https://socket.prod.tt.fm';
const TOKEN = process.env.TTFM_API_TOKEN;
const ROOM_UUID = process.env.ROOM_UUID;
const PY_WEBHOOK = process.env.PY_WEBHOOK || 'http://localhost:4000/events';
const RELAY_PORT = parseInt(process.env.RELAY_PORT || '3000', 10);
const RELAY_SECRET = process.env.RELAY_SECRET || ''; // optional HMAC/shared secret

if (!TOKEN || !ROOM_UUID) {
  console.error('❌ TTFM_API_TOKEN and ROOM_UUID are required in .env');
  process.exit(1);
}

const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

// Simple auth middleware (optional shared secret)
function relayAuth(req, res, next) {
  if (!RELAY_SECRET) return next();
  const hdr = req.get('x-relay-secret') || '';
  if (hdr !== RELAY_SECRET) return res.status(403).json({ ok: false, error: 'forbidden' });
  next();
}

// Outbound: Python posts here to ask relay to emit to socket
app.post('/send', relayAuth, async (req, res) => {
  try {
    const { event, payload, expectAck } = req.body || {};
    if (!event) return res.status(400).json({ ok: false, error: 'missing event' });

    if (!socket || !socket.connected) {
      return res.status(503).json({ ok: false, error: 'socket not connected' });
    }

    if (expectAck) {
      // wait for ack with a timeout
      const ackPromise = new Promise((resolve) => {
        socket.emit(event, payload, (ack) => resolve({ ok: true, ack }));
      });
      const result = await Promise.race([
        ackPromise,
        new Promise((r) => setTimeout(() => r({ ok: false, error: 'ack timeout' }), 5000))
      ]);
      return res.json(result);
    } else {
      socket.emit(event, payload);
      return res.json({ ok: true });
    }
  } catch (err) {
    console.error('❌ send error', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// health endpoints
app.get('/health', (req, res) => res.json({ ok: true, socketConnected: !!socket && socket.connected }));
app.get('/ready', (req, res) => res.json({ ok: true }));

const server = app.listen(RELAY_PORT, () => {
  console.log(`✅ Relay HTTP listening on http://127.0.0.1:${RELAY_PORT}`);
});

// ttfm-socket wiring
let socket = null;
async function startSocket() {
  socket = new SocketClient(SOCKET_URL);

  socket.on('connect', () => {
    console.info('✅ ttfm-socket connected');
  });

  socket.on('disconnect', (reason) => {
    console.warn('⚠️  ttfm-socket disconnected', reason);
  });

  socket.on('error', (err) => {
    console.error('❌ ttfm-socket error', err);
  });

  // register and forward events
  const events = ['statefulMessage','statelessMessage','playedSong','roomStateUpdated','addedDj','removedDj','userJoined','userLeft'];
  events.forEach(evt => {
    socket.on(evt, (data) => {
      // best-effort forward
      axios.post(PY_WEBHOOK, { event: evt, payload: data }, { timeout: 5000 }).catch(e => {
        console.warn('⚠️  forward failed', evt, e.message || e);
      });
    });
  });

  // connection and join
  try {
    await socket.joinRoom(TOKEN, { roomUuid: ROOM_UUID });
    console.info('✅ Joined room:', ROOM_UUID);
  } catch (err) {
    console.error('❌ joinRoom failed', err);
    // don't exit: allow relay to attempt reconnects via socket lib
  }
}

// Start socket with basic resilience
(async function init() {
  console.log('🔌 Starting ttfm-socket relay...');
  console.log(`📍 Room: ${ROOM_UUID}`);
  console.log(`🔗 Forwarding to: ${PY_WEBHOOK}`);
  console.log(`🌐 Relay API: http://127.0.0.1:${RELAY_PORT}`);
  
  try {
    await startSocket();
  } catch (e) {
    console.error('💥 Fatal socket start error', e);
  }
})();

// graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Stopping relay...');
  server.close();
  if (socket && typeof socket.disconnect === 'function') socket.disconnect();
  process.exit(0);
});
