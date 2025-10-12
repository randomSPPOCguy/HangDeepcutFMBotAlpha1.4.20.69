"use strict";

/**
 * Helpers - common utilities used across modules.
 * Only includes safe, deterministic helpers that do not touch IO.
 */

/**
 * Resolve username for a given userId from a provided state structure.
 * Falls back to supplied defaults.
 * @param {string|number} userId
 * @param {object} state - expected shape { users: [{ id|userId, username|name }] }
 * @param {string|number} [botUserId]
 * @returns {string|null}
 */
function getUsernameById(userId, state, botUserId) {
  if (!userId) return null;
  const uid = String(userId);
  const users = (state && (state.users || state.userList)) || [];
  for (const u of users) {
    const id = String(u.id ?? u.userId ?? "");
    if (id === uid) {
      const name = u.username ?? u.name ?? null;
      if (name && botUserId && String(botUserId) === uid) return name; // allow explicit BOT name
      return name;
    }
  }
  return null;
}

/**
 * Heuristic bot detection, preserving hard exclusions.
 * @param {string|number} userId
 * @param {string} username
 * @param {string|number} [botUserId]
 * @param {string} [botName]
 * @param {Array<string|number>} [excludeIds]
 * @param {Array<string>} [excludeNames]
 * @returns {boolean}
 */
function isBotUser(userId, username, botUserId, botName, excludeIds = [], excludeNames = []) {
  const uid = String(userId ?? "");
  const uname = String(username ?? "").toLowerCase();
  if (!uid && !uname) return false;

  // explicit exclusions
  if (botUserId && String(botUserId) === uid) return true;
  if (botName && uname === String(botName).toLowerCase()) return true;
  if (excludeIds.map(String).includes(uid)) return true;
  if (excludeNames.map(x => String(x).toLowerCase()).includes(uname)) return true;

  // common heuristics
  if (/\bbot\b/i.test(uname)) return true;
  if (/\bhang[-_ ]?fm\b/i.test(uname)) return true;
  return false;
}

/**
 * Normalize/clean artist names: strip features, extra punctuation, bracketed info.
 * @param {string} name
 * @returns {string}
 */
function cleanArtistName(name) {
  if (!name) return "";
  let s = String(name);
  // Remove bracketed/parenthetical segments like (Remix) [Live]
  s = s.replace(/\s*[\(\[][\s\S]*?[\)\]]\s*/g, " ");
  // Remove featuring info
  s = s.replace(/\s+(feat\.|featuring|ft\.)\s+[^\-–,]+/ig, " ");
  // Collapse whitespace and punctuation noise
  s = s.replace(/[\u2013\u2014]/g, "-"); // en/em dashes -> hyphen
  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/^[-–\s]+|[-–\s]+$/g, "");
  return s.trim();
}

/** Sanitize text for safe display (very light). */
function sanitizeText(t) {
  return String(t ?? "").replace(/[\r\n\t]+/g, " ").trim();
}

/** Truncate with ellipsis. */
function truncate(str, maxLen = 140) {
  const s = String(str ?? "");
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}

/** Format ms -> mm:ss. */
function formatDuration(ms) {
  const n = Math.max(0, Math.floor((+ms || 0) / 1000));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

module.exports = {
  getUsernameById,
  isBotUser,
  cleanArtistName,
  sanitizeText,
  truncate,
  formatDuration,
};


