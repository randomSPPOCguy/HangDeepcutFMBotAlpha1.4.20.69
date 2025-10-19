/* core/Bot.js */
'use strict';

const { setInterval, clearInterval } = require('timers');

const ts = () => {
  const d = new Date();
  const pad = (n, s = 2) => String(n).padStart(s, '0');
  return `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}]`;
};
const log = {
  debug: (...a) => console.log(`${ts()} DEBUG`, ...a),
  info:  (...a) => console.log(`${ts()} INFO `, ...a),
  warn:  (...a) => console.warn(`${ts()} WARN `, ...a),
  error: (...a) => console.error(`${ts()} ERROR`, ...a),
  line:  (...a) => console.log(`${ts()} LOG  `, ...a),
};

class Bot {
  constructor({ socketClient, config, http }) {
    this.socket = socketClient;
    this.cfg = config || {};
    this.http = http || { baseUrl: '', token: '' };

    this._heartbeatTimer = null;
    this._pollTimer = null;
    this._discoveryTimer = null;
    this._stageTimer = null;

    log.debug('BOT constructed', JSON.stringify({
      glue: true,
      discoveryWhileGlued: true,
      discoveryPeriodMs: 25000,
    }));

    // Wire socket listeners
    if (this.socket) {
      this.socket.on('message', (msg) => this._onSocketMessage(msg));
      this.socket.on('connected', () => this._onSocketConnected());
      this.socket.on('disconnected', () => this._onSocketDisconnected());
      this.socket.on('error', (e) => this._onSocketError(e));
      log.debug('BOT [wire] socket adapter attached');
    } else {
      log.warn('No socket adapter provided.');
    }
  }

  async start() {
    // discovery + stage loops (placeholders to match your logs)
    this._discoveryTimer = setInterval(() => {
      log.debug('BOT discovery loop: no discoveryTick() implementation — skipping');
    }, 25000);

    this._stageTimer = setInterval(() => {
      log.debug('BOT stage mgmt loop: no checkAutoStageManagement() — skipping');
    }, 25000);

    // Heartbeat over WebSocket (if enabled & connected)
    if (this.cfg.sendHeartbeat) {
      this._setupHeartbeat();
    }

    // HTTP polling fallback if socket is not connected and API base exists
    if (!this.socket?.isConnected() && this.http.baseUrl) {
      this._startPolling();
    }

    // Auto join room + greet
    if (this.cfg.autoJoinRoom && this.cfg.roomId) {
      await this.joinRoom(this.cfg.roomId);
    }
    if (this.cfg.bootGreet && this.cfg.roomId) {
      await this.sendText(this.cfg.roomId, this.cfg.bootGreetMessage || 'BOT Online 🦾🤖');
    }

    log.info('BOT started.');
  }

  async stop() {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    if (this._discoveryTimer) { clearInterval(this._discoveryTimer); this._discoveryTimer = null; }
    if (this._stageTimer) { clearInterval(this._stageTimer); this._stageTimer = null; }
  }

  // ---- socket events ----
  _onSocketConnected() {
    log.info('WebSocket connected.');
    // When socket comes online, stop HTTP polling
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }
  _onSocketDisconnected() {
    log.warn('WebSocket disconnected.');
    // If HTTP base is available, start polling as fallback
    if (this.http.baseUrl && !this._pollTimer) {
      this._startPolling();
    }
  }
  _onSocketError(err) {
    log.warn('WebSocket error', err && err.message ? err.message : err);
    if (this.http.baseUrl && !this._pollTimer) {
      log.warn('Starting HTTP polling due to socket error');
      this._startPolling();
    }
  }
  _onSocketMessage(msg) {
    try {
      if (typeof msg === 'string') {
        // raw text message
        this._handleIncoming({ type: 'raw', data: msg });
      } else if (msg && typeof msg === 'object') {
        this._handleIncoming(msg);
      } else {
        log.debug('Received unknown socket payload');
      }
    } catch (e) {
      log.error('Failed to handle socket message', e);
    }
  }

  // ---- behavior ----
  _setupHeartbeat() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    if (!this.cfg.heartbeatInterval || this.cfg.heartbeatInterval < 1000) return;

    this._heartbeatTimer = setInterval(() => {
      if (this.socket?.isConnected()) {
        this.socket.send({ type: 'ping', t: Date.now() });
      }
    }, this.cfg.heartbeatInterval);
  }

  _startPolling() {
    if (!this.http.baseUrl) return;
    if (this._pollTimer) clearInterval(this._pollTimer);

    const poll = async () => {
      try {
        const u = new URL(this.http.baseUrl.replace(/\/+$/, '') + '/chat/poll');
        if (this.cfg.roomId) u.searchParams.set('room', this.cfg.roomId);
        const res = await fetch(u, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            ...(this.http.token ? { 'Authorization': `Bearer ${this.http.token}` } : {}),
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => null);
        if (Array.isArray(data)) {
          data.forEach((m) => this._handleIncoming(m));
        }
      } catch (e) {
        log.warn('Polling error', e.message || e);
      }
    };

    // initial + interval
    poll();
    this._pollTimer = setInterval(poll, 2000);
  }

  _handleIncoming(evt) {
    // Very lightweight handler; customize as needed
    if (!evt) return;

    if (evt.type === 'chat.message') {
      const text = evt.text || evt.message || '';
      const from = evt.from || evt.user || 'user';
      log.line(`💬 [IN] ${from}: ${text}`);

      // simple echo/commands (customize your behavior here)
      if (/^\/ping/i.test(text)) {
        this.sendText(this.cfg.roomId, 'pong 🏓');
      } else if (/^\/commands/i.test(text)) {
        this.sendText(this.cfg.roomId, 'Available: /ping, /help');
      } else if (/^\/help/i.test(text)) {
        this.sendText(this.cfg.roomId, 'I am alive. Try /ping.');
      }
      return;
    }

    if (evt.type === 'raw') {
      const s = String(evt.data || '');
      if (s === 'ping') {
        // ignore
      } else {
        log.debug('RAW socket message:', s);
      }
      return;
    }

    // default
    log.debug('Unhandled event:', evt.type || '(no type)');
  }

  // ---- outward actions ----
  async joinRoom(roomId) {
    if (!roomId) return;
    // Try socket first
    if (this.socket?.isConnected()) {
      this.socket.send({ type: 'room.join', roomId });
      return;
    }
    // Fallback HTTP
    if (!this.http.baseUrl) return;
    try {
      const res = await fetch(this.http.baseUrl.replace(/\/+$/, '') + '/rooms/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.http.token ? { 'Authorization': `Bearer ${this.http.token}` } : {}),
        },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      log.warn('joinRoom HTTP error', e.message || e);
    }
  }

  async sendText(roomId, text) {
    if (!text) return;
    // Try socket
    if (this.socket?.isConnected()) {
      this.socket.send({ type: 'chat.send', roomId: roomId || this.cfg.roomId, text });
      log.line(`💬 [OUT] ${this.cfg.botName || 'BOT'}: ${text}`);
      return;
    }
    // Fallback HTTP
    if (!this.http.baseUrl) {
      log.warn('No socket and no API base; cannot send message.');
      return;
    }
    try {
      const res = await fetch(this.http.baseUrl.replace(/\/+$/, '') + '/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.http.token ? { 'Authorization': `Bearer ${this.http.token}` } : {}),
        },
        body: JSON.stringify({ roomId: roomId || this.cfg.roomId, text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log.line(`💬 [OUT] ${this.cfg.botName || 'BOT'}: ${text}`);
    } catch (e) {
      log.warn('HTTP send error', e.message || e);
    }
  }
}

module.exports = Bot;


