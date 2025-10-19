/**
 * CometChatAdapter
 * - Opens WS, falls back to HTTP polling for reads if auth fails
 * - Emits: 'ready' once usable; 'text' for plain messages; 'command' for "/xyz"
 * - Provides: send(roomId, text) to post messages back to the group.
 */

const EventEmitter = require("events");
const WebSocket = require("ws"); // make sure 'ws' is installed

function ts() {
  const d = new Date();
  return d.toISOString().replace("T", " ").replace("Z", "");
}

class CometChatAdapter extends EventEmitter {
  /**
   * @param {{
   *  appId: string,
   *  regionHost: string,  // e.g. websocket-us.cometchat.io
   *  userId: string,      // sender
   *  authToken: string,   // "sender_authToken"
   *  groupGuid: string,
   *  debug?: boolean
   * }} opts
   */
  constructor(opts) {
    super();
    this.opts = opts;
    this.ws = null;
    this.ready = false;
    this.httpPollTimer = null;
    this._seen = new Set();
    this.debug = !!opts.debug;
  }

  log(level, msg, extra) {
    if (!this.debug && level.startsWith("DEBUG")) return;
    if (extra !== undefined) {
      console.log(`[${ts()}] ${level} ${msg}`, extra);
    } else {
      console.log(`[${ts()}] ${level} ${msg}`);
    }
  }

  // ---- Public API ----
  async connect() {
    this.log("LOG  ", "💬 Connecting to CometChat...");
    const url = `wss://${this.opts.appId}.${this.opts.regionHost}/v3.0/`;
    this.log("LOG  ", `🔗 CometChat URL: ${url}`);

    await this._openWebSocket(url);

    // Start HTTP polling as resilient fallback/backlog fetch
    this._startHttpPolling();

    // Mark ready so callers can greet even if WS auth fails (HTTP send may still work)
    if (!this.ready) {
      this.ready = true;
      this.emit("ready");
    }
  }

  isReady() {
    return this.ready;
  }

  /**
   * Send a text message into the CometChat group.
   * Uses WS if available; otherwise attempts HTTP send via built-in fetch.
   */
  async send(_roomId, text) {
    // Prefer WS if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const payload = {
          appId: this.opts.appId,
          type: "message",
          sender: this.opts.userId,
          body: {
            receiver: this.opts.groupGuid,
            receiverType: "group",
            category: "message",
            type: "text",
            data: { text },
          },
        };
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch (e) {
        this.log("WARN ", "WS send failed; falling back to HTTP.", e?.message);
      }
    }

    // HTTP fallback (CometChat REST v3 – path may vary per deployment)
    try {
      const apiBase = `https://${this.opts.appId}.api-${this.opts.regionHost}`;
      const res = await fetch(`${apiBase}/v3/groups/${encodeURIComponent(this.opts.groupGuid)}/messages`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.authToken}`,
        },
        body: JSON.stringify({
          category: "message",
          type: "text",
          receiver: this.opts.groupGuid,
          receiverType: "group",
          data: { text },
          sender: this.opts.userId,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.log("WARN ", `HTTP send failed: ${res.status}`, body);
        return false;
      }
      return true;
    } catch (err) {
      this.log("WARN ", "HTTP send error", err?.message || err);
      return false;
    }
  }

  // ---- Internals ----
  async _openWebSocket(url) {
    return new Promise((resolve) => {
      this.ws = new WebSocket(url);
      let authed = false;

      this.ws.on("open", () => {
        this.log("LOG  ", "✅ CometChat WebSocket opened");
        // auth
        const authMsg = {
          appId: this.opts.appId,
          type: "auth",
          sender: this.opts.userId,
          body: {
            auth: this.opts.authToken,
            deviceId: "WEB",
          },
        };
        this.log("LOG  ", `🔐 Sending CometChat auth for user: ${this.opts.userId}`);
        this.log("DEBUG", `Auth: appId=${this.opts.appId}, sender=${this.opts.userId}`);
        this.log("DEBUG", `Full auth message: ${JSON.stringify(authMsg)}`);
        this.ws.send(JSON.stringify(authMsg));
        this.log("LOG  ", "📤 CometChat auth message sent - waiting for response...");
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg?.type === "onJoinGroup" || msg?.body?.event === "onJoinGroup") {
            authed = true;
            this.ready = true;
            this.log("LOG  ", "✅ Joined CometChat group");
            this.emit("ready");
            resolve();
            return;
          }
        } catch {
          /* ignore non-JSON */
        }
      });

      this.ws.on("error", (err) => {
        this.log("WARN ", "⚠️  CometChat WebSocket error", err?.message || err);
      });

      this.ws.on("close", () => {
        if (!authed) {
          this.log("WARN ", "⚠️  CometChat WebSocket auth failed - starting HTTP polling instead");
          resolve(); // let connect() continue to polling
        }
      });
    });
  }

  _startHttpPolling() {
    if (this.httpPollTimer) clearInterval(this.httpPollTimer);

    this.httpPollTimer = setInterval(async () => {
      try {
        await this._pollOnce();
      } catch (err) {
        this.log("WARN ", "Polling error", err?.message || err);
      }
    }, 2000);
  }

  async _pollOnce() {
    const apiBase = `https://${this.opts.appId}.api-${this.opts.regionHost}`;
    const url = `${apiBase}/v3/groups/${encodeURIComponent(this.opts.groupGuid)}/messages?limit=100`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.opts.authToken}`,
      },
    });

    this.log("DEBUG", `📊 Poll response: status=${res.status}, hasData=${res.ok}`);
    if (!res.ok) return false;

    const payload = await res.json();
    const list = Array.isArray(payload?.data) ? payload.data : [];
    this.log("DEBUG", `📊 Received ${list.length} messages from CometChat API`);

    for (let i = 0; i < list.length; i++) {
      const m = list[i];

      const id = m?.id || m?._id || `${m?.sentAt || ""}:${m?.sender || ""}:${i}`;
      if (this._seen.has(id)) continue;

      const type = m?.category === "message" ? (m?.type || "text") : (m?.category || m?.type || "message");
      const sender = m?.sender || m?.sender?.uid || m?.data?.entities?.sender?.entity?.uid || "unknown";
      const name = m?.sender?.name || sender;
      const text = (m?.data && m?.data?.text) || m?.text || "";

      const sentAt = Number(m?.sentAt || m?.sent_at || Date.now());
      const isRecent = Date.now() - sentAt < 60_000; // 60s window
      const alreadyProcessed = this._seen.has(id);

      this.log("DEBUG", `📰 Message ${i}: type=${type}, sender=${sender}, text=${text || "undefined"}`);
      this.log("DEBUG", `📋 Message check: text="${(text || "").slice(0, 64)}", isRecent=${isRecent}, alreadyProcessed=${alreadyProcessed}`);

      this._seen.add(id);

      if (!isRecent || !text) continue;

      if (text.startsWith("/")) {
        const [cmd, ...args] = text.slice(1).trim().split(/\s+/g);
        const ctx = {
          raw: text,
          cmd: (cmd || "").toLowerCase(),
          args,
          user: { id: sender, name },
          message: m,
        };
        console.log(`[${ts()}] LOG   💬 ${name || sender}: ${text}`);
        this.emit("command", ctx);
      } else {
        this.emit("text", { text, user: { id: sender, name }, message: m });
      }
    }
    return true;
  }
}

module.exports = { CometChatAdapter };

