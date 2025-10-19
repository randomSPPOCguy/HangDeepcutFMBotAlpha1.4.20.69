/* socket/SocketClient.js */
'use strict';

const EventEmitter = require('events');
let WebSocket;
try { WebSocket = require('ws'); } catch { WebSocket = null; }

class SocketClient extends EventEmitter {
  constructor({ url, headers } = {}) {
    super();
    this.url = url || '';
    this.headers = headers || {};
    this.ws = null;
    this._connected = false;
    this._intentionalClose = false;
  }

  isConnected() {
    return this._connected && this.ws && this.ws.readyState === 1;
  }

  async connect() {
    if (!this.url || !WebSocket) {
      // Mocked connection if no URL or no ws lib
      this._connected = false;
      this.emit('connected', { mock: true });
      return;
    }

    this._intentionalClose = false;

    await new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url, { headers: this.headers });
      } catch (e) {
        return reject(e);
      }

      this.ws.on('open', () => {
        this._connected = true;
        this.emit('connected', { mock: false });
        resolve();
      });

      this.ws.on('message', (data) => {
        let payload = data;
        try {
          // Try parse JSON; if fails pass raw
          if (typeof data === 'string') {
            payload = JSON.parse(data);
          }
        } catch { /* keep raw */ }
        this.emit('message', payload);
      });

      this.ws.on('error', (err) => {
        this._connected = false;
        this.emit('error', err);
      });

      this.ws.on('close', () => {
        this._connected = false;
        this.emit('disconnected');
        if (!this._intentionalClose) {
          // Let the bot decide about reconnects; do not auto-loop here.
        }
      });
    });
  }

  send(message) {
    if (!this.isConnected()) return false;
    try {
      const out = typeof message === 'string' ? message : JSON.stringify(message);
      this.ws.send(out);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this._intentionalClose = true;
    try { this.ws && this.ws.close(); } catch {}
    this._connected = false;
  }
}

function createSocketClient(opts) {
  return new SocketClient(opts);
}

module.exports = { createSocketClient, SocketClient };



