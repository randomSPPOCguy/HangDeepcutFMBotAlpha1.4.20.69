"use strict";

/**
 * CommandHandler - routes user commands to features (v3 per feedback).
 *
 * Public API:
 *   - constructor(bot, logger)
 *   - processCommand(text, senderId, senderName)
 */
class CommandHandler {
  /** @param {any} bot @param {any} logger */
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger;
    this.roomId = bot?.config?.roomId;
  }

  /**
   * Main entry. Returns true if a command was handled.
   * @param {string} text
   * @param {string} senderId
   * @param {string} senderName
   * @returns {Promise<boolean>}
   */
  async processCommand(text, senderId, senderName) {
    const raw = String(text || "").trim();
    if (!raw.startsWith("/")) return false;

    const [cmd, ...rest] = raw.split(/\s+/);
    const args = rest.join(" ");

    switch (cmd.toLowerCase()) {
      case "/stats":
        await this.handleStats(args, senderId, senderName); return true;
      case "/songstats":
        await this.handleSongStats(args, senderId, senderName); return true;
      case "/leaderboard":
      case "/lb":
        await this.handleLeaderboard(args, senderId, senderName); return true;
      case "/poker":
        await this.handlePoker(args, senderId, senderName); return true;
      case "/weather":
      case "/w":
        await this.handleWeather(args, senderId, senderName); return true;
      case "/artists":
        await this.handleArtists(args, senderId, senderName); return true;
      case "/help":
      case "/?":
      case "/commands":
        await this.handleHelp(); return true;
      case "/gitlink":
      case "/github":
      case "/repo":
        await this.handleGitLink(); return true;
      case "/ty":
      case "/thanks":
      case "/credits":
        await this.handleThanks(); return true;
      default:
        this.logger?.debug?.(`Unknown command: ${cmd}`);
        return false;
    }
  }

  // =============== Handlers ===============

  /** @private */
  async handleHelp() {
    const emoji = this.bot?.decor?.getRandomEmoji?.() || "🎧";
    const msg = [
      `${emoji} **Commands**`,
      "- /stats [@user] — Your stats or a user's stats",
      "- /songstats [limit=5] — Recent top songs",
      "- /leaderboard — Top users",
      "- /poker [amount] — Play a hand vs bot",
      "- /weather <location> — Quick weather",
      "- /artists — Show curated artist samples",
      "- /gitlink — View bot source code on GitHub",
      "- /ty — Credits and thank you",
      "- /help — This help",
    ].join("\n");
    await this.send(msg);
  }

  /** @private */
  async handleGitLink() {
    const emoji = this.bot?.decor?.getRandomEmoji?.() || "🔗";
    const msg = [
      `${emoji} **Bot Source Code**`,
      "📦 GitHub: https://github.com/randomSPPOCguy/HangDeepcutFMBotAlpha1.4.20.69",
      "⚖️ License: Non-Commercial Open Source",
      "✅ Free to use, modify, and share - just don't monetize it!",
    ].join("\n");
    await this.send(msg);
  }

  /** @private */
  async handleThanks() {
    const emoji = this.bot?.decor?.getRandomEmoji?.() || "💙";
    const msg = `${emoji} Thank you to Jodrell, noiz, Kai the Husky, butter, and the music sharing community for inspiring me to build this project`;
    await this.send(msg);
  }

  /** @private */
  async handleStats(args, senderId, senderName) {
    try {
      const mention = this.extractMention(args);
      const targetId = mention?.id || senderId;
      const targetName = mention?.name || senderName || "you";

      const statsMap = this.bot?.stats?.userStats;
      const stats = statsMap instanceof Map ? statsMap.get(String(targetId)) : (statsMap?.[String(targetId)]);

      if (!stats) { await this.send(`No stats found for **${targetName}**.`); return; }

      // Fields per feedback
      const bankroll = Number(stats.bankroll ?? 1000);
      const pokerWins = Number(stats.pokerWins ?? 0);
      const pokerTotal = Number(stats.pokerTotal ?? 0);
      const pokerLosses = Math.max(0, pokerTotal - pokerWins);
      const winRate = pokerTotal > 0 ? Math.round((pokerWins / pokerTotal) * 100) : 0;
      const upvotes = Number(stats.upvotes ?? 0);
      const stars = Number(stats.stars ?? 0);

      // NEW: Top artists from StatsManager
      const topArtists = this.bot?.stats?.getTopArtists?.(String(targetId), 3) || [];
      const artistLines = topArtists.length > 0
        ? topArtists.map((a, i) => `${i+1}. ${a.name} (${a.plays} plays)`).join(", ")
        : "None yet";

      const emoji = this.bot?.decor?.getRandomEmoji?.() || "🎶";
      const lines = [
        `${emoji} **Stats for ${targetName}**`,
        `💰 Bankroll: **${bankroll}** chips`,
        `🃏 Poker: **${pokerWins}W-${pokerLosses}L (${winRate}%)**`,
        `👍 Votes: **${upvotes}** upvotes, **${stars}** stars`,
        `🎵 Top Artists: ${artistLines}`,
      ];
      await this.send(lines.join("\n"));
    } catch (e) { this.logger?.error?.(`handleStats error: ${e.message}`); }
  }

  /** @private */
  async handleSongStats(args, senderId, senderName) {
    try {
      const limit = Math.max(1, Math.min(20, parseInt(args, 10) || 5));
      const map = this.bot?.stats?.songStats;
      const entries = map instanceof Map ? Array.from(map.entries()) : Object.entries(map || {});
      if (!entries.length) { await this.send("No song stats yet."); return; }

      const sorted = entries
        .map(([key, v]) => ({ key, plays: v.plays ?? v.playCount ?? 0, up: v.likes ?? 0, down: v.dislikes ?? 0, stars: v.stars ?? 0 }))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, limit);

      const emoji = this.bot?.decor?.getRandomEmoji?.() || "🎵";
      const lines = [ `${emoji} **Top ${sorted.length} Songs**` ];
      sorted.forEach((s, i) => {
        lines.push(`${i+1}. ${s.key} — plays: **${s.plays}**, ▲ ${s.up} / ▼ ${s.down} / ★ ${s.stars}`);
      });
      await this.send(lines.join("\n"));
    } catch (e) { this.logger?.error?.(`handleSongStats error: ${e.message}`); }
  }

  /** @private */
  async handleLeaderboard(args, senderId, senderName) {
    try {
      const map = this.bot?.stats?.userStats;
      const entries = map instanceof Map ? Array.from(map.entries()) : Object.entries(map || {});
      if (!entries.length) { await this.send("No users in leaderboard yet."); return; }

      const sorted = entries
        .map(([uid, v]) => ({
          uid,
          bankroll: v.bankroll ?? 1000,
          pokerWins: v.pokerWins ?? 0,
          stars: v.stars ?? 0,
        }))
        .sort((a, b) => b.bankroll - a.bankroll)
        .slice(0, 10);

      const nameOf = (uid) => this.safeGetUsername(uid) || `user:${uid}`;
      const emoji = this.bot?.decor?.getRandomEmoji?.() || "🏆";
      const lines = [ `${emoji} **Leaderboard (by bankroll)**` ];
      sorted.forEach((u, i) => lines.push(`${i+1}. ${nameOf(u.uid)} — **${u.bankroll}** chips, ${u.pokerWins}W, ★ ${u.stars}`));
      await this.send(lines.join("\n"));
    } catch (e) { this.logger?.error?.(`handleLeaderboard error: ${e.message}`); }
  }

  /**
   * Poker: single-shot hand vs. bot.
   * Usage: /poker [amount]
   */
  async handlePoker(args, senderId, senderName) {
    try {
      const amount = Math.max(1, Math.min(1000000, parseInt((args||""), 10) || 10));

      // Resolve user stats & bankroll
      const statsMap = this.bot?.stats?.userStats;
      const id = String(senderId);
      let stats = statsMap instanceof Map ? statsMap.get(id) : (statsMap?.[id]);
      if (!stats) {
        stats = { bankroll: 1000, pokerWins: 0, pokerTotal: 0 };
        if (statsMap instanceof Map) statsMap.set(id, stats); else if (statsMap) statsMap[id] = stats;
      }
      if (stats.bankroll < amount) { await this.send(`Not enough chips. Bankroll: **${stats.bankroll}**`); return; }

      // Deal
      const deck = this.makeDeck();
      const player = [ deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop() ];
      const dealer = [ deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop() ];

      const pEval = this.evaluateHand(player);
      const dEval = this.evaluateHand(dealer);

      let outcome = "push"; // win | lose | push
      if (this.compareEval(pEval, dEval) > 0) outcome = "win"; else if (this.compareEval(pEval, dEval) < 0) outcome = "lose";

      // Update stats
      stats.pokerTotal = (stats.pokerTotal ?? 0) + 1;
      if (outcome === "win") { stats.pokerWins = (stats.pokerWins ?? 0) + 1; stats.bankroll = (stats.bankroll ?? 0) + amount; }
      else if (outcome === "lose") { stats.bankroll = Math.max(0, (stats.bankroll ?? 0) - amount); }

      // Persist back
      if (statsMap instanceof Map) statsMap.set(id, stats); else if (statsMap) statsMap[id] = stats;
      this.bot?.stats?.save?.();

      // Build output
      const pStr = this.renderHand(player);
      const dStr = this.renderHand(dealer);
      const resEmoji = outcome === "win" ? "✅" : outcome === "lose" ? "❌" : "➖";
      const delta = outcome === "win" ? `+${amount}` : outcome === "lose" ? `-${amount}` : `±0`;

      const msg = [
        `🃏 **Poker** — bet **${amount}** chips`,
        `You: ${pStr}  —  *${pEval.name}*`,
        `Bot: ${dStr}  —  *${dEval.name}*`,
        `${resEmoji} **${outcome.toUpperCase()}** (${delta}) — Bankroll now **${stats.bankroll}**`,
      ].join("\n");
      await this.send(msg);
    } catch (e) { this.logger?.error?.(`handlePoker error: ${e.message}`); }
  }

  /** @private */
  async handleWeather(args, senderId, senderName) {
    try {
      const q = (args || "").trim();
      if (!q) { await this.send("Usage: /weather <location>"); return; }
      if (!this.bot?.weather?.getWeather) { await this.send("Weather service not configured."); return; }

      const data = await this.bot.weather.getWeather(q);
      const report = this.bot.weather.formatWeatherReport
        ? this.bot.weather.formatWeatherReport(data, () => (this.bot?.decor?.getRandomEmoji?.() || ""))
        : this.formatWeatherDefault(data);
      await this.send(report);
    } catch (e) { this.logger?.error?.(`handleWeather error: ${e.message}`); }
  }

  /** @private */
  async handleArtists(args, senderId, senderName) {
    try {
      const curated = this.bot?.music?.curatedArtists;
      if (!Array.isArray(curated) || curated.length === 0) { await this.send("No curated artists available."); return; }

      const total = curated.length;
      // If we have genre buckets provided elsewhere, use them; otherwise derive simple slices as samples.
      const buckets = this.bot?.music?.genreBuckets || {
        "Underground Hip Hop": curated.slice(0, 200),
        "Alternative Rock": curated.slice(200, 600),
        "Stoner/Doom": curated.slice(600),
      };

      const emoji = this.bot?.decor?.getRandomEmoji?.() || "🎵";
      const lines = [ `${emoji} **Curated Artists (${total} total)**` ];
      for (const [genre, list] of Object.entries(buckets)) {
        const sample = (list || []).slice(0, 10).join(", ") || "(none)";
        lines.push(`${genre}: ${sample}${(list||[]).length > 10 ? "…" : ""}`);
      }
      lines.push("(First 10 from each genre)");
      await this.send(lines.join("\n"));
    } catch (e) { this.logger?.error?.(`handleArtists error: ${e.message}`); }
  }

  // =============== helpers ===============

  /** @private */
  async send(message) {
    const text = String(message ?? "");
    if (!text) return;
    if (this.bot?.filter && this.bot.filter.isAllowed && !this.bot.filter.isAllowed(text)) return;
    await this.bot?.chat?.sendMessage?.(this.roomId, text);
  }

  /** @private */
  extractMention(s) {
    if (!s) return null;
    const at = s.match(/@([A-Za-z0-9_\-\.]+)/);
    if (at) return { id: this.lookupUserIdByName(at[1]) || at[1], name: at[1] };
    const angle = s.match(/<uid:(\w+)>/);
    if (angle) return { id: angle[1], name: this.safeGetUsername(angle[1]) };
    return null;
  }

  /** @private */
  lookupUserIdByName(name) {
    const state = this.bot?.socket?.state || this.bot?.state;
    if (!state) return null;
    const users = state.users || state.userList || [];
    for (const u of users) {
      const uname = (u.username || u.name || "").toLowerCase();
      if (uname === String(name).toLowerCase()) return u.id || u.userId || null;
    }
    return null;
  }

  /** @private */
  safeGetUsername(uid) {
    const state = this.bot?.socket?.state || this.bot?.state;
    const u = (state?.users || []).find?.(x => String(x.id||x.userId) === String(uid));
    return u?.username || u?.name || null;
  }

  /** @private */
  formatWeatherDefault(data) {
    if (!data) return "No weather data.";
    const name = data.name || data.location || "(unknown)";
    const t = data.main?.temp ?? data.temperature ?? "?";
    const desc = data.weather?.[0]?.description || data.description || "";
    return `☁️ Weather for **${name}**: **${t}°** ${desc}`;
  }

  // ===== Poker internals =====

  /** @private */
  makeDeck() {
    const suits = ["♠","♥","♦","♣"]; // order doesn't matter
    const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
    const deck = [];
    for (const s of suits) for (const r of ranks) deck.push(r + s);
    // shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  /** @private */
  renderHand(hand) { return hand.join(" "); }

  /** @private */
  rankValue(r) {
    return { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 }[r] || 0;
  }

  /** @private */
  evaluateHand(hand) {
    // hand: ["AS","KD",...] but we used unicode suits; parse accordingly (rank is first char)
    const vals = hand.map(c => this.rankValue(c[0])).sort((a,b)=>a-b);
    const suits = hand.map(c => c.slice(1));

    const isFlush = suits.every(s => s === suits[0]);

    // Straight detection with wheel (A-2-3-4-5)
    let isStraight = false, highStraight = 0;
    const uniq = [...new Set(vals)];
    if (uniq.length === 5 && vals[4]-vals[0] === 4) { isStraight = true; highStraight = vals[4]; }
    // Wheel
    if (!isStraight && JSON.stringify(vals) === JSON.stringify([2,3,4,5,14])) { isStraight = true; highStraight = 5; }

    // Count occurrences
    const counts = new Map();
    vals.forEach(v => counts.set(v, (counts.get(v)||0)+1));
    const groups = [...counts.entries()].sort((a,b)=> b[1]-a[1] || b[0]-a[0]); // sort by freq desc then value desc

    // Hand ranking: 9 SF, 8 Four, 7 FH, 6 Flush, 5 Straight, 4 Trips, 3 TwoPair, 2 Pair, 1 High
    if (isStraight && isFlush) return { score:[9, highStraight], name: highStraight===14?"Royal Flush":"Straight Flush" };
    if (groups[0][1] === 4) return { score:[8, groups[0][0], groups[1][0]], name:"Four of a Kind" };
    if (groups[0][1] === 3 && groups[1][1] === 2) return { score:[7, groups[0][0], groups[1][0]], name:"Full House" };
    if (isFlush) return { score:[6, ...vals.slice().reverse()], name:"Flush" };
    if (isStraight) return { score:[5, highStraight], name:"Straight" };
    if (groups[0][1] === 3) {
      const kickers = vals.filter(v => v !== groups[0][0]).sort((a,b)=>b-a);
      return { score:[4, groups[0][0], ...kickers], name:"Three of a Kind" };
    }
    if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) {
      const highPair = Math.max(groups[0][0], groups[1][0]);
      const lowPair = Math.min(groups[0][0], groups[1][0]);
      const kicker = vals.find(v => v !== highPair && v !== lowPair) || 0;
      return { score:[3, highPair, lowPair, kicker], name:"Two Pair" };
    }
    if (groups[0][1] === 2) {
      const pairVal = groups[0][0];
      const kickers = vals.filter(v => v !== pairVal).sort((a,b)=>b-a);
      return { score:[2, pairVal, ...kickers], name:"Pair" };
    }
    return { score:[1, ...vals.slice().reverse()], name:"High Card" };
  }

  /** @private */
  compareEval(a, b) {
    const len = Math.max(a.score.length, b.score.length);
    for (let i=0;i<len;i++) {
      const av = a.score[i]||0, bv=b.score[i]||0;
      if (av>bv) return 1; if (av<bv) return -1;
    }
    return 0;
  }
}

module.exports = CommandHandler;

