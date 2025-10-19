// chat/CometChatAdapter.js
// Robust CometChat adapter with safe config handling.
// - Uses WebSocket when COMETCHAT_APP_ID and COMETCHAT_REGION are set.
// - Only uses HTTP polling if COMETCHAT_HTTP_BASE and COMETCHAT_API_KEY are set.
// - If config is incomplete, it disables itself gracefully (no noisy "fetch failed" spam).

const EventEmitter = require('events');

function createCometChatAdapter(opts = {}) {
  const bus = new EventEmitter();

  // ---- ENV / CONFIG ----
  const appId   = (process.env.COMETCHAT_APP_ID   || '').trim();
  const region  = (process.env.COMETCHAT_REGION   || '').trim(); // e.g., "us", "eu"
  const apiKey  = (process.env.COMETCHAT_API_KEY  || '').trim(); // REST key (if you want HTTP)
  const groupId = (process.env.COMETCHAT_GROUP_ID || '').trim();
  const wsEnabled = ((process.env.COMETCHAT_WS_ENABLED || 'true').toLowerCase() === 'true');

  // If you want HTTP polling, provide the full base (e.g., https://us.cometchat.io/v3)
  const httpBase = (process.env.COMETCHAT_HTTP_BASE || '').trim();

  const logger = mkLogger('CHAT');

  // Derived WS URL (only valid when appId + region are present)
  const wsHost = (appId && region) ? `${appId}.websocket-${region}.cometchat.io` : '';
  const wsUrl  = (wsEnabled && wsHost) ? `wss://${wsHost}/v3.0/` : '';

  // Transport availability
  const canWS   = Boolean(wsUrl && groupId);
  const canHTTP = Boolean(httpBase && apiKey && groupId);

  // State
  let state = 'idle';          // 'idle' | 'connecting' | 'connected' | 'polling' | 'disabled'
  let ws = null;
  let pollTimer = null;
  let lastMessageTs = 0;       // for simple "since" logic in polling (if you wire in real endpoints)

  // ---- Lifecycle ----
  async function connect() {
    if (!canWS && !canHTTP) {
      state = 'disabled';
      logger.warn('CometChat disabled: missing config. (No WS/HTTP chat transport configured)');
      debugConfig();
      return { ok: false, disabled: true };
    }

    if (canWS) {
      try {
        await openWebSocket();
        state = 'connected';
        return { ok: true, via: 'ws' };
      } catch (err) {
        logger.warn(`⚠️  CometChat WebSocket error ${err?.message || err}`);
        // Fall back to HTTP polling if available
        if (canHTTP) {
          startPolling();
          return { ok: true, via: 'http_poll' };
        }
        state = 'disabled';
        return { ok: false, disabled: true };
      }
    }

    // No WS, but HTTP available
    if (canHTTP) {
      startPolling();
      return { ok: true, via: 'http_poll' };
    }

    // Should not reach here
    state = 'disabled';
    return { ok: false, disabled: true };
  }

  async function disconnect() {
    stopPolling();
    if (ws && ws.readyState === 1) {
      try { ws.close(1000, 'client_disconnect'); } catch { /* ignore */ }
    }
    state = 'idle';
  }

  // ---- WS path ----
  function openWebSocket() {
    return new Promise((resolve, reject) => {
      if (!canWS) return reject(new Error('WS transport not configured'));

      const WebSocket = require('ws');
      logger.info(`💬 Connecting to CometChat...`);
      logger.info(`🔗 CometChat URL: ${wsUrl}`);

      state = 'connecting';
      ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        logger.info('✅ CometChat WebSocket opened');
        // Minimal "join group" ping to let your app know we are up
        bus.emit('connected', { type: 'ws', url: wsUrl, groupId, at: Date.now() });
        // If you have a real protocol, send auth/join here.
        resolve();
      });

      ws.on('message', (data) => {
        let payload = null;
        try { payload = JSON.parse(String(data)); } catch { payload = { type: 'raw', data: String(data) }; }
        bus.emit('message', payload);
      });

      ws.on('close', (code, reason) => {
        logger.warn(`WS closed (${code}) ${String(reason || '')}`);
        bus.emit('disconnected', { code, reason: String(reason || '') });
        // Try to fallback to polling if possible
        if (canHTTP) startPolling();
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  }

  // ---- HTTP polling path (no-ops unless you wire real endpoints) ----
  function startPolling() {
    if (!canHTTP) {
      logger.warn('HTTP polling disabled (missing COMETCHAT_HTTP_BASE / COMETCHAT_API_KEY / COMETCHAT_GROUP_ID).');
      state = 'disabled';
      return;
    }

    logger.info('🔄 Starting CometChat HTTP polling for messages...');
    state = 'polling';

    // Stubbed poller so we don’t spam network or throw errors.
    // Replace this with real CometChat REST calls if/when you’re ready.
    stopPolling();
    pollTimer = setInterval(() => {
      // Example: fetch(`${httpBase}/messages?group=${groupId}&after=${lastMessageTs}`, { headers: { apikey: apiKey } })
      //   .then(...)
      // For now we keep it quiet to avoid "fetch failed" noise while you finalize config.
    }, 2500);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // ---- Sending ----
  async function sendMessage(text) {
    // Prefer WS if connected
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ type: 'text', groupId, text }));
        return { ok: true, via: 'ws' };
      } catch (e) {
        logger.warn(`WS send error: ${e?.message || e}`);
      }
    }

    // If you’ve wired a real REST endpoint, place it here.
    if (canHTTP) {
      logger.warn('HTTP send skipped: REST endpoint not wired in this adapter. (Provide a concrete endpoint if needed.)');
      return { ok: false, via: 'http', skipped: true };
    }

    logger.warn('say() had no available chat transport; not sent.');
    return { ok: false };
  }

  // ---- Event API ----
  const on  = (...a) => bus.on(...a);
  const off = (...a) => bus.off(...a);
  const once= (...a) => bus.once(...a);
  const emit= (...a) => bus.emit(...a);

  // ---- Helpers ----
  function debugConfig() {
    const redactedKey = apiKey ? `${apiKey.slice(0, 4)}…` : '';
    logger.debug('Config check → ' + JSON.stringify({
      appId: !!appId, region: !!region, groupId: !!groupId,
      wsEnabled, wsUrl: wsUrl || '(n/a)',
      httpBase: httpBase || '(n/a)', apiKey: redactedKey || '(n/a)'
    }));
  }

  return {
    connect,
    disconnect,
    sendMessage,
    startPolling,
    stopPolling,
    on, off, once, emit,
    get state() { return state; },
    get isConnected() { return state === 'connected' || state === 'polling'; },
  };
}

/* ---------------- tiny logger ---------------- */
function mkLogger(tag = 'LOG') {
  const ts = () => {
    const d = new Date();
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `[${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,'0')}]`;
  };
  const pad = (s) => (s + '     ').slice(0, 5);
  return {
    info:  (m) => console.log(`${ts()} ${pad('INFO ')} [${tag}] ${m}`),
    debug: (m) => console.log(`${ts()} ${pad('DEBUG')} [${tag}] ${m}`),
    warn:  (m) => console.warn(`${ts()} ${pad('WARN ')} [${tag}] ${m}`),
  };
}

module.exports = { createCometChatAdapter };
