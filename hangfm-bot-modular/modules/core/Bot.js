// modules/core/Bot.js
// Safe, drop-in Bot core with defensive guards around timers and a no-crash `say()`.
//
// This file is intentionally dependency-light and resilient to partial configs.
// If your environment provides richer transports (chat/socket), the bot will
// detect and use them. Otherwise it will still start cleanly.

const { EventEmitter } = require('events');

/** Minimal logger fallback */
function createDefaultLogger(prefix = 'BOT') {
  const tag = (lvl) => `[${lvl}] ${prefix}`;
  return {
    debug: (...a) => console.debug(tag('DEBUG'), ...a),
    info:  (...a) => console.info(tag('INFO '), ...a),
    warn:  (...a) => console.warn(tag('WARN '), ...a),
    error: (...a) => console.error(tag('ERROR'), ...a),
  };
}

/**
 * Bot – core orchestrator.
 *
 * Expected (optional) options in the constructor:
 *   - logger: {debug,info,warn,error}
 *   - chat:   adapter with .onMessage(cb) or .on('message', cb) and optionally .sendMessage(roomId, text) or .say(roomId, text)
 *   - socket: adapter with .on(event, cb) / .emit(event, payload)
 *   - config: arbitrary settings (e.g., room ids)
 *   - glue, discoveryWhileGlued, discoveryPeriodMs: optional booleans / numbers
 */
class Bot extends EventEmitter {
  constructor(opts = {}) {
    super();

    this.logger = opts.logger || createDefaultLogger('BOT');
    this.chat   = opts.chat   || null;
    this.socket = opts.socket || null;
    this.config = opts.config || {};

    // Operational flags / cadence
    this.glue = typeof opts.glue === 'boolean' ? opts.glue : true;
    this.discoveryWhileGlued = typeof opts.discoveryWhileGlued === 'boolean'
      ? opts.discoveryWhileGlued
      : true;

    this.discoveryPeriodMs = Number.isFinite(opts.discoveryPeriodMs)
      ? Math.max(1_000, opts.discoveryPeriodMs)
      : 25_000;

    // Intervals/timers
    this._timers = {
      discovery: null,
      stageMgmt: null,
    };

    this.logger.debug('constructed', {
      glue: this.glue,
      discoveryWhileGlued: this.discoveryWhileGlued,
      discoveryPeriodMs: this.discoveryPeriodMs,
    });
  }

  /**
   * Safe .say() – will never throw even if no transport exists.
   * Attempts, in order:
   *   1) chat.sendMessage(roomId, text)
   *   2) chat.say(roomId, text)
   *   3) socket.emit('serverMessage' | 'speak', payload)
   * Falls back to just logging if none are available.
   */
  async say(roomId, text) {
    try {
      if (!text) return;

      // Chat adapters
      if (this.chat) {
        if (typeof this.chat.sendMessage === 'function') {
          this.logger.debug('say() via chat.sendMessage', { roomId, text });
          await this.chat.sendMessage(roomId, text);
          return;
        }
        if (typeof this.chat.say === 'function') {
          this.logger.debug('say() via chat.say', { roomId, text });
          await this.chat.say(roomId, text);
          return;
        }
      }

      // Socket fallbacks (common event names used by many adapters)
      if (this.socket && typeof this.socket.emit === 'function') {
        const payload = roomId ? { roomId, text } : { text };
        if (this._hasSocketListener('serverMessage')) {
          this.logger.debug('say() via socket.emit("serverMessage")', payload);
          this.socket.emit('serverMessage', payload);
          return;
        }
        if (this._hasSocketListener('speak')) {
          this.logger.debug('say() via socket.emit("speak")', payload);
          this.socket.emit('speak', payload);
          return;
        }
      }

      // If we reach here, we don’t have a transport — log so at least nothing crashes.
      this.logger.warn('say() had no available transport; logging instead:', { roomId, text });
    } catch (err) {
      this.logger.error('say() failed (swallowed to avoid crash):', err);
    }
  }

  /** Helper: check if socket has a listener for event name */
  _hasSocketListener(eventName) {
    try {
      if (!this.socket || typeof this.socket.listeners !== 'function') return false;
      return (this.socket.listeners(eventName) || []).length > 0;
    } catch {
      return false;
    }
  }

  /** Start the bot */
  async start() {
    this.logger.info('starting…');

    // Wire inputs defensively (only if present)
    this._wireChat();
    this._wireSocket();

    // Boot greeting is now safe — `this.say` always exists.
    const bootRoom = this.config?.roomId || this.config?.defaultRoomId || null;
    const gluedTxt = this.glue ? '🧲 Glue is ON — bot will stay on the floor.' : '🧲 Glue is OFF — free roaming.';
    await this.say(bootRoom, `✅ **BOT online**\n${gluedTxt}`);

    // Discovery loop (guarded)
    if (this.discoveryWhileGlued || !this.glue) {
      this._startDiscoveryLoop();
    } else {
      this.logger.debug('discovery loop disabled due to glue settings');
    }

    // Stage management loop (guarded)
    this._startStageManagementLoop();

    this.logger.info('started.');
    return this;
  }

  /** Stop all timers and detach if needed */
  async stop() {
    this.logger.info('stopping…');

    // Clear timers safely
    for (const key of Object.keys(this._timers)) {
      if (this._timers[key]) {
        clearInterval(this._timers[key]);
        this._timers[key] = null;
      }
    }

    this.logger.info('stopped.');
  }

  /** Wire chat adapter defensively */
  _wireChat() {
    if (!this.chat) {
      this.logger.debug('[wire] no chat adapter present');
      return;
    }

    let wired = false;

    // Preferred: adapter exposes onMessage(cb)
    if (typeof this.chat.onMessage === 'function') {
      this.chat.onMessage((msg) => this._onIncomingChatMessage(msg));
      this.logger.debug('[wire] chat.onMessage registered.');
      wired = true;
    }

    // Fallback: raw EventEmitter interface
    if (typeof this.chat.on === 'function') {
      this.chat.on('message', (msg) => this._onIncomingChatMessage(msg));
      this.logger.debug("[wire] bound 'message' on chat emitter.");
      wired = true;

      // A few common aliases we bind defensively (harmless if they never fire)
      this.chat.on('chatMessage', (msg) => this._onIncomingChatMessage(msg));
      this.logger.debug("[wire] bound 'chatMessage' on chat emitter.");
      this.chat.on('roomMessage', (msg) => this._onIncomingChatMessage(msg));
      this.logger.debug("[wire] bound 'roomMessage' on chat emitter.");
      this.chat.on('textMessage', (msg) => this._onIncomingChatMessage(msg));
      this.logger.debug("[wire] bound 'textMessage' on chat emitter.");
      this.chat.on('userSpoke', (msg) => this._onIncomingChatMessage(msg));
      this.logger.debug("[wire] bound 'userSpoke' on chat emitter.");
    }

    if (!wired) {
      this.logger.warn('[wire] chat adapter present but no known interface to subscribe to messages.');
    }
  }

  /** Wire socket adapter defensively */
  _wireSocket() {
    if (!this.socket || typeof this.socket.on !== 'function') {
      this.logger.debug('[wire] no socket adapter present');
      return;
    }

    // We bind common events to funnel into a single handler
    const funnel = (evtName) => (payload) => {
      this.logger.debug(`[wire] socket → funnel (${evtName})`, payload && payload.type ? { type: payload.type } : undefined);
      this._onIncomingSocketMessage(evtName, payload);
    };

    const commonEvents = [
      'serverMessage',
      'statefulMessage',
      'transientMessage',
      'roomMessage',
      'message',
      'speak',
    ];

    for (const ev of commonEvents) {
      this.socket.on(ev, funnel(ev));
      this.logger.debug(`[wire] bound ttfm-socket ${ev} → funnel`);
    }
  }

  /** Handle incoming chat messages (normalized) */
  _onIncomingChatMessage(msg) {
    try {
      // Normalize minimally
      const text   = msg?.text ?? msg?.message ?? msg?.data?.text ?? '';
      const sender = msg?.sender || msg?.user || msg?.from || null;
      const roomId = msg?.roomId || msg?.room || msg?.channel || this.config?.roomId || null;

      this.logger.debug('incoming chat message', { preview: String(text).slice(0, 80) });

      // Re-emit normalized events other parts of the app might already listen to
      this.emit('messageReceived', { text, sender, roomId, raw: msg });
      this.emit('textMessage',     { text, sender, roomId, raw: msg });
      this.emit('userMessage',     { text, sender, roomId, raw: msg });

      // Simple built-in slash-command passthrough (non-opinionated)
      if (typeof text === 'string' && text.trim().startsWith('/')) {
        this.emit('slashCommand', { command: text.trim(), sender, roomId, raw: msg });
      }
    } catch (err) {
      this.logger.error('error while handling incoming chat message:', err);
    }
  }

  /** Handle incoming socket messages (if any) */
  _onIncomingSocketMessage(eventName, payload) {
    try {
      // Forward as a normalized event for consumers.
      this.emit('socketEvent', { eventName, payload });
    } catch (err) {
      this.logger.error('error while handling incoming socket event:', err);
    }
  }

  /** Discovery tick — only runs if a discoveryTick function exists */
  _startDiscoveryLoop() {
    // If an implementation exists on the instance, use it; otherwise skip.
    const hasTick = typeof this.discoveryTick === 'function';
    if (!hasTick) {
      this.logger.debug('discovery loop: no discoveryTick() implementation — skipping');
      return;
    }

    // Run once immediately, then on interval (guarded try/catch inside)
    const runner = async () => {
      try {
        await this.discoveryTick();
      } catch (err) {
        this.logger.error('discoveryTick() failed (continuing):', err);
      }
    };

    runner(); // fire-and-forget; errors are logged

    if (this._timers.discovery) clearInterval(this._timers.discovery);
    this._timers.discovery = setInterval(runner, this.discoveryPeriodMs);
    this.logger.debug('discovery loop: started', { periodMs: this.discoveryPeriodMs });
  }

  /** Stage management tick — only runs if a checkAutoStageManagement function exists */
  _startStageManagementLoop() {
    const hasCheck = typeof this.checkAutoStageManagement === 'function';
    if (!hasCheck) {
      this.logger.debug('stage mgmt loop: no checkAutoStageManagement() — skipping');
      return;
    }

    const periodMs = 15_000; // conservative default; adjust if your env expects different
    const runner = async () => {
      try {
        await this.checkAutoStageManagement();
      } catch (err) {
        this.logger.error('checkAutoStageManagement() failed (continuing):', err);
      }
    };

    runner();

    if (this._timers.stageMgmt) clearInterval(this._timers.stageMgmt);
    this._timers.stageMgmt = setInterval(runner, periodMs);
    this.logger.debug('stage mgmt loop: started', { periodMs });
  }
}

module.exports = Bot;







