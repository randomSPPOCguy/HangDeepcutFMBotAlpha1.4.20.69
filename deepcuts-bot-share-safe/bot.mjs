// bot.mjs (share‑safe)
import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

// ──────────── Config (.env) ────────────
const SAFE_MODE = String(process.env.SAFE_MODE ?? 'true').toLowerCase() === 'true';

const GATEWAY_BASE = (process.env.TTFM_GATEWAY_BASE_URL || 'https://gateway.prod.tt.fm').replace(/\/+$/,'');
const COMET_BASE   = (process.env.COMET_BASE_URL || (process.env.COMETCHAT_API_KEY ? ('https://' + process.env.COMETCHAT_API_KEY + '.apiclient-us.cometchat.io') : '')).replace(/\/+$/,'');
const BOT_USER_TOKEN = process.env.BOT_USER_TOKEN;
const HANGOUT_ID     = process.env.HANGOUT_ID;

if (!BOT_USER_TOKEN) throw new Error('BOT_USER_TOKEN missing');
if (!HANGOUT_ID)     throw new Error('HANGOUT_ID missing');
if (!COMET_BASE)     throw new Error('COMET_BASE_URL or COMETCHAT_API_KEY missing');

function assertTrustedUrl(u, varName){
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') throw new Error('must be https');
    if (!SAFE_MODE) return;
    const ok = url.host === 'gateway.prod.tt.fm' || /(^|\.)apiclient-(us|eu|in)\.cometchat\.io$/i.test(url.host);
    if (!ok) throw new Error('host not allowed in SAFE_MODE');
  } catch (e){
    throw new Error(`${varName} invalid: ${e.message}`);
  }
}
assertTrustedUrl(GATEWAY_BASE, 'TTFM_GATEWAY_BASE_URL');
assertTrustedUrl(COMET_BASE, 'COMET_BASE_URL');

const LOG_LEVEL      = process.env.LOG_LEVEL || 'info';
const POLL_MS        = Number(process.env.POLL_MS || 600);
const MSG_LIMIT      = Math.max(1, Number(process.env.MSG_LIMIT || 100));

// Greeter knobs
const GREET_POLL_MS       = Number(process.env.GREET_POLL_MS ?? process.env.MEMBER_POLL_MS ?? 4000);
const GREET_COOLDOWN_MS   = Number(process.env.GREET_COOLDOWN_MS || 10*60*1000);
const GREET_ENABLED       = String(process.env.GREET_ENABLED ?? 'true').toLowerCase() === 'true';
const GREET_MESSAGE       = process.env.GREET_MESSAGE || '👋 Welcome to Alternative HipHop/Rock/Metal, {name}! Type /commands to see what I can do.';
const GREET_ON_MSG_FALLBK = String(process.env.GREET_ON_MESSAGE_FALLBACK ?? 'false').toLowerCase() === 'true';
const GREET_EVENT_DRIVEN  = String(process.env.GREET_EVENT_DRIVEN ?? 'true').toLowerCase() === 'true';

const SEND_MODE      = (process.env.COMET_SEND_MODE || 'custom').toLowerCase(); // custom|text|both
let   STATE_FILE     = process.env.STATE_FILE || './bot-state.json';
const COMMAND_PREFIX = process.env.CMD_PREFIX || '/';
const ADMIN_UIDS     = (process.env.ADMIN_UIDS || '').split(',').map(s=>s.trim()).filter(Boolean);
const SELF_UID_ENV   = (process.env.BOT_UID || '').trim() || null;

// Confine state file path when SAFE_MODE
if (SAFE_MODE){
  const cwd = process.cwd();
  const resolved = path.resolve(STATE_FILE);
  if (!resolved.startsWith(path.resolve(cwd)) || resolved.includes('..')){
    STATE_FILE = path.join(cwd, 'bot-state.json');
  }
}

// Assets
const YOINK_GIFS  = (process.env.YOINK_GIFS || '').split(',').map(s=>s.trim()).filter(Boolean);
const YOINK_LINES = (process.env.YOINK_LINES || 'YOINK!|Got it!|Mine now!|Snatched!').split('|').map(s=>s.trim()).filter(Boolean);

// Weather / AI
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';
const OPENAI_API_KEY      = process.env.OPENAI_API_KEY || '';
const AI_DEFAULT_ON       = String(process.env.AI_ENABLED ?? 'true').toLowerCase() === 'true';

// ── Reaction endpoints (your .env + extras) ──
function parseEndpointList(v) {
  if (!v) return [];
  // support both ";" and "," separators
  return v.split(/[;,]/).map(s=>s.trim()).filter(Boolean);
}
const REACTION_ENDPOINTS = parseEndpointList(
  process.env.REACTION_ENDPOINTS
)?.map(p => p.replace(/\/+$/,''));
const EXTRA_VOTE_ENDPOINTS = parseEndpointList(process.env.VOTE_ENDPOINTS)?.map(p => p.replace(/\/+$/,''));
const ALL_REACTION_ENDPOINTS = Array.from(new Set([
  ...(REACTION_ENDPOINTS?.length ? REACTION_ENDPOINTS : [
    '/api/hangouts/{id}/snag',
    '/api/hangouts/{id}/stars',
    '/api/hangouts/{id}/reactions',
    '/api/hangouts/{id}/votes',
    '/api/hangouts/reactions',
    '/api/hangouts/votes',
    '/api/reactions',
    '/api/votes'
  ]),
  ...EXTRA_VOTE_ENDPOINTS
]));
const REACTION_TIMEOUT_MS = Number(process.env.REACTION_TIMEOUT_MS || 3500);

// Vote keywords (system text only; no emoji parsing)
function parseKeys(envVal, fallback) {
  const arr = (envVal || fallback).split(',').map(s=>s.trim()).filter(Boolean);
  return Array.from(new Set(arr.map(s=>s.toLowerCase())));
}
const VOTE_UP_KEYS   = parseKeys(process.env.VOTE_UP_KEYS,
  'voted up,upvote,upvoted,thumbsup,thumbs up,liked,like'
);
const VOTE_DOWN_KEYS = parseKeys(process.env.VOTE_DOWN_KEYS,
  'voted down,downvote,downvoted,thumbsdown,thumbs down,dislike,disliked'
);
const VOTE_STAR_KEYS = parseKeys(process.env.VOTE_STAR_KEYS,
  'gave a star,star,starred,snag,snagged,favorite,favorited,favourite,favourited,bookmark,bookmarked,⭐'
);

// Optional raw system log
const RAW_SYSTEM_LOG      = String(process.env.RAW_SYSTEM_LOG ?? 'false').toLowerCase() === 'true';
const RAW_SYSTEM_LOG_FILE = process.env.RAW_SYSTEM_LOG_FILE || 'system-events.log';

// Wiki fetch timeout
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 4500);

// Poker/Slots config
const POKER_START_BANKROLL = (() => {
  const v = process.env.POKER_START_BANKROLL ?? process.env.START_BANK ?? 1000;
  return Number(v) || 1000;
})();
const POKER_MAX_BANK_PCT = (() => {
  if (process.env.POKER_MAX_BANK_PCT != null && process.env.POKER_MAX_BANK_PCT !== '')
    return Number(process.env.POKER_MAX_BANK_PCT) || 10;
  if (process.env.BET_MAX_FRAC != null && process.env.BET_MAX_FRAC !== '')
    return Math.round(Number(process.env.BET_MAX_FRAC) * 100) || 10;
  return 10;
})();
const POKER_BET_WINDOW_MS = (() => {
  if (process.env.POKER_BET_WINDOW_MS != null && process.env.POKER_BET_WINDOW_MS !== '')
    return Number(process.env.POKER_BET_WINDOW_MS) || 15000;
  if (process.env.BET_WINDOW_SEC != null && process.env.BET_WINDOW_SEC !== '')
    return (Number(process.env.BET_WINDOW_SEC) * 1000) || 15000;
  return 15000;
})();
const POKER_DEALER_DELAY_MS = (() => {
  if (process.env.POKER_DEALER_DELAY_MS != null && process.env.POKER_DEALER_DELAY_MS !== '')
    return Number(process.env.POKER_DEALER_DELAY_MS) || 5000;
  if (process.env.DEALER_REVEAL_SEC != null && process.env.DEALER_REVEAL_SEC !== '')
    return (Number(process.env.DEALER_REVEAL_SEC) * 1000) || 5000;
  return 5000;
})();
const SLOTS_DAILY_SPINS = 10; // hard cap

// ──────────── Logger ────────────
const levels = { debug:10, info:20, warn:30, error:40 };
const lvl = levels[LOG_LEVEL] ?? 20;
function redact(v){
  const s = String(v ?? '');
  return s
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer ****')            // Bearer tokens
    .replace(/[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, '***.***.***') // JWTs
    .replace(/[A-Fa-f0-9]{24,}/g, (m)=> m.slice(0,4)+'…'+m.slice(-4)); // long hex
}
const log = {
  debug: (...a)=>{ if (lvl<=10) console.log('[debug]', ...a.map(redact)); },
  info:  (...a)=>{ if (lvl<=20) console.log('[info ]', ...a.map(redact)); },
  warn:  (...a)=>{ if (lvl<=30) console.log('[warn ]', ...a.map(redact)); },
  error: (...a)=>{ if (lvl<=40) console.log('[error]', ...a.map(redact)); },
};
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

// ──────────── State ────────────
const defaultUser = (name='Unknown') => ({
  name, bankroll:POKER_START_BANKROLL, wins:0, losses:0, up:0, down:0, star:0,
  slotsToday: { date: null, spins: 0 }
});
const defaultState = () => ({
  users: {},
  songs: {},
  lastTrack: null,
  poker: null,
  greeter: { lastGreet: {}, present: {} },
  membersSeen: {},
  lastVote: { kind:null, at:0, djUid:null, djName:null, why:'' },
  ai: { enabled: AI_DEFAULT_ON },
  rowGame: { uids: [] },
  suppress: { starUntil: 0 },
  bootAt: Date.now()
});
let state = defaultState();

async function loadState(){
  try {
    state = JSON.parse(await fs.readFile(STATE_FILE,'utf8'));
  } catch {
    state = defaultState();
    await saveState();
  }
  migrateState();
  log.info('📦 state ready:', STATE_FILE);
}
function migrateState(){
  state.users = state.users || {};
  state.songs = state.songs || {};
  state.greeter = state.greeter || { lastGreet: {}, present: {} };
  state.greeter.lastGreet = state.greeter.lastGreet || {};
  state.greeter.present   = state.greeter.present   || {};
  state.membersSeen = state.membersSeen || {};
  state.lastVote = state.lastVote || { kind:null, at:0, djUid:null, djName:null, why:'' };
  state.ai = state.ai || { enabled: AI_DEFAULT_ON };
  state.rowGame = state.rowGame || { uids: [] };
  state.suppress = state.suppress || { starUntil:0 };
  state.bootAt = state.bootAt || Date.now();

  for (const [uid,u] of Object.entries(state.users)){
    const cleaned = { ...defaultUser(), ...u };
    cleaned.name = cleanName(cleaned.name);
    cleaned.bankroll = isFinite(cleaned.bankroll) ? Math.max(0, Math.floor(cleaned.bankroll)) : POKER_START_BANKROLL;
    for (const k of ['wins','losses','up','down','star']){
      cleaned[k] = isFinite(cleaned[k]) ? Math.max(0, Math.floor(cleaned[k])) : 0;
    }
    if (!cleaned.slotsToday || typeof cleaned.slotsToday !== 'object'){
      cleaned.slotsToday = { date:null, spins:0 };
    }
    state.users[uid] = cleaned;
  }
}
async function saveState(){
  try {
    const tmp = STATE_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(state,null,2), { mode: 0o600 });
    await fs.rename(tmp, STATE_FILE);
  } catch(e){ log.warn('state save failed:', e.message||e); }
}

function cleanName(n){ return String(n||'').replace(/\*/g,'').trim() || 'Unknown'; }
function ensureUser(uid, name='Unknown'){
  const nm = cleanName(name);
  const existing = state.users[uid];
  if (!existing){
    state.users[uid] = defaultUser(nm);
  } else {
    const merged = { ...defaultUser(nm), ...existing };
    merged.name = nm;
    for (const k of ['bankroll','wins','losses','up','down','star']){
      const v = merged[k];
      merged[k] = isFinite(v) ? Math.max(0, Math.floor(v)) : (k==='bankroll'?POKER_START_BANKROLL:0);
    }
    if (!merged.slotsToday || typeof merged.slotsToday !== 'object'){
      merged.slotsToday = { date:null, spins:0 };
    }
    state.users[uid] = merged;
  }
  return state.users[uid];
}
function isAdmin(uid){ return ADMIN_UIDS.includes(uid); }

// ──────────── Auth / HTTP ────────────
let cometAuthToken = null;
let selfUid = SELF_UID_ENV;

async function fetchCometAuthToken(){
  const r = await fetch(`${GATEWAY_BASE}/api/user-service/comet-chat/user-token`, {
    headers: { Authorization: `Bearer ${BOT_USER_TOKEN}` }
  });
  if (!r.ok) throw new Error(`Gateway ${r.status} ${await r.text()}`);
  const data = await r.json();
  cometAuthToken = data?.cometAuthToken;
  if (!cometAuthToken) throw new Error('no cometAuthToken');
  return cometAuthToken;
}
function withCometHeaders(extra={}){
  return {
    accept:'application/json',
    authToken: cometAuthToken,
    Authorization:`Bearer ${cometAuthToken}`,
    ...extra
  };
}
async function comet(path, opts={}, _retry=true){
  if (!cometAuthToken) await fetchCometAuthToken();
  const r = await fetch(`${COMET_BASE}${path}`, { ...opts, headers: withCometHeaders(opts.headers||{}) });
  if (r.status===401 && _retry){
    await fetchCometAuthToken();
    return await fetch(`${COMET_BASE}${path}`, { ...opts, headers: withCometHeaders(opts.headers||{}) });
  }
  return r;
}
async function listGroupMessages(groupId, {limit=MSG_LIMIT}={}){
  const r = await comet(`/v3.0/groups/${encodeURIComponent(groupId)}/messages?limit=${limit}`);
  const t = await r.text();
  if (!r.ok) throw new Error(`list ${r.status} ${t}`);
  return JSON.parse(t);
}
async function listGroupMembers(groupId, {limit=200}={}){
  const r = await comet(`/v3.0/groups/${encodeURIComponent(groupId)}/members?limit=${limit}`);
  const t = await r.text();
  if (!r.ok) throw new Error(`members ${r.status} ${t}`);
  return JSON.parse(t);
}

// Senders
async function sendRaw(body){
  const r = await comet('/v3.0/messages', {
    method:'POST',
    headers: withCometHeaders({'content-type':'application/json'}),
    body: JSON.stringify(body)
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`send ${r.status} ${t}`);
  let res; try { res = JSON.parse(t); } catch {}
  const maybeUid = res?.data?.data?.entities?.sender?.entity?.uid;
  if (maybeUid) selfUid = selfUid || maybeUid;
  return res;
}
function makeCustomData(message){
  return {
    avatarId:'dj-femalezombie-1',
    color:'#9E4ADF',
    badges:['BOT'],
    id:-1,
    message,
    type:'user',
    userName:'BOT',
    userUuid:selfUid||'unknown',
    uuid: crypto.randomUUID(),
  };
}
async function sendText(groupId, text){
  try{
    await sendRaw({ receiverType:'group', receiver:groupId, category:'message', type:'text', data:{ text } });
  }catch(e){
    if (String(e?.message||'').includes('ERR_GROUP_NOT_JOINED')) {
      await ensureGroupMembership();
      await sendRaw({ receiverType:'group', receiver:groupId, category:'message', type:'text', data:{ text } });
    } else throw e;
  }
}
async function sendCustom(groupId, message){
  try{
    await sendRaw({
      receiverType:'group',
      receiver:groupId,
      category:'custom',
      type:'ChatMessage',
      data:{ customData: makeCustomData(message), metadata:{ incrementUnreadCount:true } }
    });
  }catch(e){
    if (String(e?.message||'').includes('ERR_GROUP_NOT_JOINED')) {
      await ensureGroupMembership();
      await sendRaw({
        receiverType:'group',
        receiver:groupId,
        category:'custom',
        type:'ChatMessage',
        data:{ customData: makeCustomData(message), metadata:{ incrementUnreadCount:true } }
      });
    } else throw e;
  }
}
async function send(groupId, text){
  if (SEND_MODE==='custom') return sendCustom(groupId, text);
  if (SEND_MODE==='text')   return sendText(groupId, text);
  await sendText(groupId, text);
  await sendCustom(groupId, text);
}

// ──────────── Auto-join helpers ────────────
async function getSelfUid() {
  if (selfUid) return selfUid;
  const r = await comet('/v3.0/me');
  const t = await r.text();
  if (!r.ok) throw new Error(`me ${r.status} ${t}`);
  const j = JSON.parse(t);
  selfUid = j?.data?.uid || j?.data?.user?.uid || selfUid;
  if (!selfUid) throw new Error('could not resolve self uid');
  log.info('👤 self uid:', selfUid);
  return selfUid;
}
async function tryJoinGroup(guid) {
  try {
    const uid = await getSelfUid();
    const body = { participants: [{ uid, scope: 'participant' }] };
    const r = await comet(`/v3.0/groups/${encodeURIComponent(guid)}/members`, {
      method: 'POST',
      headers: withCometHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const txt = await r.text().catch(()=>'');

    if (r.ok) { log.info('✅ joined group', guid); return true; }
    if (r.status === 409 || /already|exists/i.test(txt)) {
      log.info('ℹ️ already in group', guid);
      return true;
    }

    const r2 = await comet(`/v3.0/groups/${encodeURIComponent(guid)}/join`, {
      method: 'POST',
      headers: withCometHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({}),
    });
    if (r2.ok) { log.info('✅ joined group via /join', guid); return true; }

    const txt2 = await r2.text().catch(()=> '');
    log.warn('join failed:', r.status, txt, '| alt:', r2.status, txt2);
    return false;
  } catch (e) {
    log.warn('join error:', e.message || e);
    return false;
  }
}
async function ensureGroupMembership() {
  const ok = await tryJoinGroup(HANGOUT_ID);
  if (!ok) {
    log.warn('⚠️ bot may not be in the group — invite this UID or add via dashboard:', selfUid || '(unknown yet)');
  }
}

// ──────────── Watermark (anti-spam) ────────────
let lastSeenSentAt = 0;
let lastSeenId = 0;
function advanceWM(m){
  const sAt = m?.sentAt ?? 0, mid = Number(m?.id)||0;
  if (sAt > lastSeenSentAt || (sAt===lastSeenSentAt && mid>lastSeenId)){
    lastSeenSentAt = sAt; lastSeenId = mid;
  }
}
async function seedWatermark(){
  try{
    const res = await listGroupMessages(HANGOUT_ID, {limit: 50});
    const items = Array.isArray(res?.data)? res.data : [];
    if (!items.length) return;
    const newest = items.reduce((a,b)=>{
      const as=a?.sentAt||0, bs=b?.sentAt||0;
      if (bs>as) return b;
      if (bs<as) return a;
      const ai=Number(a?.id)||0, bi=Number(b?.id)||0;
      return (bi>ai)? b : a;
    });
    advanceWM(newest);
  } catch(e){}
}

// ──────────── Votes + Now Playing (SYSTEM EVENTS ONLY) ────────────
function parseSongFromSystem(m){
  const song = m?.data?.metadata?.chatMessage?.songs?.[0]?.song;
  if (!song) return null;
  const artist = song.artistName || 'Unknown Artist';
  const title  = song.trackName  || 'Unknown Title';
  const songKey = String(song.songId || song.crateSongUuid || `${artist} — ${title}`);
  return { artist, title, songKey };
}
function flatten(any, out){
  if (any==null) return;
  if (Array.isArray(any)){ for (const v of any) flatten(v,out); return; }
  if (typeof any==='object'){ for (const k in any) flatten(any[k],out); return; }
  out.push(String(any));
}
function containsAny(haystack, keys){
  const t = haystack.toLowerCase();
  return keys.some(k => k && t.includes(k));
}
function detectSystemVote(m){
  const all = [];
  flatten(m?.data?.metadata, all);
  flatten(m?.data?.message, all);
  flatten(m?.data?.text, all);
  flatten(m?.text, all);
  const blob = all.join(' ').toLowerCase();

  if (containsAny(blob, VOTE_STAR_KEYS)) return { kind:'star',  why:'matched STAR keyword' };
  if (containsAny(blob, VOTE_UP_KEYS))   return { kind:'up',    why:'matched UP keyword' };
  if (containsAny(blob, VOTE_DOWN_KEYS)) return { kind:'down',  why:'matched DOWN keyword' };

  if (/voted\s+up/.test(blob))           return { kind:'up',   why:'regex voted up' };
  if (/voted\s+down/.test(blob))         return { kind:'down', why:'regex voted down' };
  if (/gave\s+a?\s*star/.test(blob))     return { kind:'star', why:'regex gave a star' };
  if (/snagged/.test(blob))              return { kind:'star', why:'regex snagged' };

  return null;
}
async function countVote(kind){
  if (kind==='star' && Date.now() < (state.suppress.starUntil||0)) return; // ignore admin /.star window
  if (!state.lastTrack?.djUid) return;
  const u = ensureUser(state.lastTrack.djUid, state.lastTrack.djName);
  u[kind] = (u[kind]||0) + 1;
  state.lastVote = { kind, at: Date.now(), djUid: state.lastTrack.djUid, djName: state.lastTrack.djName, why: state.lastVote.why || '' };
  await saveState();
  log.info(`✅ counted ${kind} for ${u.name} — 👍 ${u.up||0} 👎 ${u.down||0} ⭐ ${u.star||0}`);
}

// ── Reaction sender (UP/DOWN/STAR) — ONLY area changed ──
async function sendRoomVote(kind, { affectStats = true } = {}) {
  const alias = {
    star: ['star','snag','favorite','favourite'],
    up:   ['up','upvote','like','thumbsup','UP'],
    down: ['down','downvote','dislike','thumbsdown','DOWN'],
  }[kind] || [kind];

  const endpoints = ALL_REACTION_ENDPOINTS.map(p => p.replace('{id}', HANGOUT_ID));

  const includesHangoutInPath = (p) => /\/hangouts\/[^/]+(?:\/|$)/.test(p);
  const songIdMaybe = (state.lastTrack?.songKey && /^[0-9a-f-]{6,}$/i.test(state.lastTrack.songKey))
    ? state.lastTrack.songKey : null;

  // Try a bunch of payload shapes, including an empty body POST.
  const keyFields = ['kind','reaction','vote','type','action'];
  const payloadVariants = [];
  for (const a of alias) {
    for (const f of keyFields) {
      payloadVariants.push({ [f]: a });
      payloadVariants.push({ [f]: a.toUpperCase() });
    }
  }
  // Explicit canonical forms
  payloadVariants.push({ vote:'UP' });
  payloadVariants.push({ vote:'DOWN' });
  payloadVariants.push({ vote:'STAR' });
  payloadVariants.push({}); // empty body variant

  for (const ep of endpoints) {
    for (const bodyBase of payloadVariants) {
      const body = { ...bodyBase };
      if (!includesHangoutInPath(ep)) body.hangoutId = HANGOUT_ID;
      if (songIdMaybe) body.songId = songIdMaybe;

      try {
        const ctl = new AbortController();
        const to  = setTimeout(() => ctl.abort(), REACTION_TIMEOUT_MS);
        const r = await fetch(`${GATEWAY_BASE}${ep}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${BOT_USER_TOKEN}` },
          body: JSON.stringify(body),
          signal: ctl.signal
        });
        clearTimeout(to);

        if (r.ok) {
          log.info('🗳️ server reaction OK:', kind, '→', ep, 'payload:', body);
          return true;
        } else {
          const s = r.status;
          if (s>=500) {
            const t = await r.text().catch(()=> '');
            log.warn('server reaction 5xx:', s, ep, t || '(no body)');
          }
        }
      } catch (e) {
        log.warn('server reaction error:', ep, e.message || e);
      }
    }
  }

  if (affectStats) {
    await countVote(kind); // keep stats consistent for games (/roll)
    log.info('server reaction unavailable; counted locally:', kind);
  } else {
    log.info('server reaction unavailable; skipping local count for admin action:', kind);
  }
  return false;
}

// ──────────── Instant Join Greeting (event-driven) ────────────
function detectJoinEvent(m){
  if (!GREET_EVENT_DRIVEN) return null;
  const isSystem = (m?.data?.entities?.sender?.entity?.uid === 'app_system') || (m?.sender === 'app_system');
  if (!isSystem) return null;

  const all = [];
  flatten(m?.data?.metadata, all);
  flatten(m?.data?.message, all);
  flatten(m?.data?.text, all);
  flatten(m?.text, all);
  const blob = all.join(' ').toLowerCase();

  const looksLikeJoin = /\b(joined|has joined|entered|entered the room|joined the room|joined hangout)\b/.test(blob);
  if (!looksLikeJoin) return null;

  const mentionUid = Object.keys(m?.data?.mentions || {})[0] || null;
  const mention    = mentionUid ? m?.data?.mentions?.[mentionUid] : null;
  const mdUserUid  = m?.data?.metadata?.user?.uid || m?.data?.user?.uid || null;
  const mdUserName = m?.data?.metadata?.user?.name || m?.data?.user?.name || null;

  const uid  = mentionUid || mdUserUid;
  const name = cleanName(mention?.name || mdUserName || uid);

  if (!uid) return null;
  return { uid, name };
}

// ──────────── Poker helpers ────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VAL = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));
function newDeck(){ const d=[]; for (const s of SUITS) for (const r of RANKS) d.push({r,s}); return d; }
function draw(deck,n=1){ const out=[]; for(let i=0;i<n;i++){ const k=Math.floor(Math.random()*deck.length); out.push(deck.splice(k,1)[0]); } return out; }
function fmtCards(cs){ return cs.map(c=>`${c.r}${c.s}`).join(' '); }
function eval3(cs){
  const ranks = cs.map(c=>RANK_VAL[c.r]).sort((a,b)=>a-b);
  const suits = cs.map(c=>c.s);
  const flush = new Set(suits).size===1;
  const uniq  = Array.from(new Set(ranks));
  const trips = uniq.length===1;
  const pair  = uniq.length===2;
  const straight = (ranks[2]-ranks[1]===1 && ranks[1]-ranks[0]===1) || (ranks[0]===2 && ranks[1]===3 && ranks[2]===14);
  if (flush && straight) return {name:'Straight Flush', score:600, idx:5};
  if (trips)             return {name:'Three of a Kind', score:500, idx:4};
  if (straight)          return {name:'Straight',        score:400, idx:3};
  if (flush)             return {name:'Flush',           score:300, idx:3};
  if (pair)              return {name:'Pair',            score:200, idx:2};
  return {name:'High Card', score:100, idx:1};
}
const PAYOUT_MULT = { 1:1, 2:2, 3:3, 4:4, 5:5 };

// ──────────── Command text (compact two columns) ────────────
const leftCol  = ['📚 /wiki', '🃏 /p', '🎰 /s'];
const rightCol = ['📊 /stats', '📈 /songstats', '🌦️ /w'];
const COMMANDS_TEXT = [
  '🗒️ Commands',
  leftCol.map((l,i)=> `${l.padEnd(14)}  ${rightCol[i]||''}`).join('\n')
].join('\n');
const HIDDEN_TEXT = [
  '🤫 Hidden',
  '/.commands',
  '/.ai on|off  or  /ai on|off',
  '/.star',
  '/.uptime',
  '/ro',
  // /yoink is hidden but callable
].join('\n');

// ──────────── AI helpers ────────────
async function aiReply(prompt){
  if (!OPENAI_API_KEY) return null;
  try{
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'content-type':'application/json', Authorization:`Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.6,
        messages: [
          { role:'system', content:
            "You are a helpful, concise music-room assistant. Keep replies brief and friendly. Prefer info about the current artist/track when relevant. Use plain text (no markdown asterisks)." },
          { role:'user', content: prompt }
        ]
      })
    });
    if (!r.ok) throw new Error(`openai ${r.status}`);
    const j = await r.json();
    return j?.choices?.[0]?.message?.content?.trim() || null;
  }catch(e){
    log.warn('AI error:', e.message||e);
    return null;
  }
}
function hasBotCallout(text){ return /\b@?bot\b/i.test(text || ''); }

// ──────────── Weather (text) ────────────
function toF(c){ return Math.round((c*9)/5 + 32); }
function cFromK(k){ return Math.round(k - 273.15); }
async function weatherText(arg){
  if (!OPENWEATHER_API_KEY){ return '⚠️ Weather not configured. Add OPENWEATHER_API_KEY to .env'; }
  const q = (arg||'').trim();
  if (!q){ return '🌦️ Usage: /w area code or /w place  (e.g., /w 14207 or /w buffalo)'; }
  try{
    let place, lat, lon;
    const looksZipUS = /^\d{5}$/.test(q);
    const qParam = encodeURIComponent(q);
    let geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${qParam}&limit=1&appid=${OPENWEATHER_API_KEY}`);
    let geo = await geoRes.json();
    if ((!Array.isArray(geo) || !geo.length) && looksZipUS){
      const zipRes = await fetch(`https://api.openweathermap.org/geo/1.0/zip?zip=${q},US&appid=${OPENWEATHER_API_KEY}`);
      const z = await zipRes.json();
      if (z && z.lat != null && z.lon != null){
        lat = z.lat; lon = z.lon; place = `${z.name || 'USA'} ${q}`;
      }
    }
    if (!place){
      if (!Array.isArray(geo) || !geo.length) throw new Error('geo');
      const g = geo[0]; lat = g.lat; lon = g.lon; place = [g.name, g.state, g.country].filter(Boolean).join(', ');
    }
    const cur = await (await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`)).json();
    const fc  = await (await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`)).json();
    const cNow = cFromK(cur.main.temp);
    const fNow = toF(cNow);

    const byDay = {};
    for (const it of fc.list){
      const d = new Date(it.dt*1000);
      const key = d.toISOString().slice(0,10);
      const tc = cFromK(it.main.temp_max);
      byDay[key] = Math.max(byDay[key]||-999, tc);
    }
    const days = Object.keys(byDay).sort().slice(0,5);
    const highs = days.map(k=>byDay[k]).filter(v=>Number.isFinite(v));
    const highsLine = highs.map((c,i)=>`D${i+1}:${toF(c)}°F/${c}°C`).join('  ');
    const desc = (cur.weather?.[0]?.description || '').replace(/\b\w/g,s=>s.toUpperCase());

    return [
      `🌦️ ${place}`,
      `• Now: ${fNow}°F / ${cNow}°C — ${desc}`,
      `• Next 5 days highs: ${highsLine}`
    ].join('\n');
  } catch {
    return `⚠️ Weather lookup failed for \`${q}\``;
  }
}

// ──────────── Pretty msg ────────────
function prettyMsg(m){
  const fromUid = m?.data?.entities?.sender?.entity?.uid ?? m?.sender ?? null;
  const fromName = m?.data?.entities?.sender?.entity?.name ?? (fromUid==='app_system'?'System':fromUid) ?? 'unknown';
  const text = m?.data?.text ?? m?.text ?? m?.data?.message?.customData?.message ?? m?.data?.customData?.message ?? '';
  return { id: String(m?.id ?? ''), fromUid, from: cleanName(fromName), text: String(text) };
}

// ──────────── Handler ────────────
async function handleMessage(m){
  const { fromUid, from, text } = prettyMsg(m);
  const isSystem = (fromUid==='app_system' || from==='System');

  // System: now-playing, votes, instant join greets
  if (isSystem){
    if (RAW_SYSTEM_LOG) { try {
      const clone = JSON.parse(JSON.stringify(m));
      if (clone?.data?.metadata?.authToken) clone.data.metadata.authToken = '****';
      await fs.appendFile(RAW_SYSTEM_LOG_FILE, JSON.stringify(clone)+'\n');
    } catch {} }

    // Instant greet
    const join = detectJoinEvent(m);
    if (join && GREET_ENABLED){
      const prevPresent = !!state.greeter.present[join.uid];
      const last = state.greeter.lastGreet[join.uid] || 0;
      const now = Date.now();
      if (!prevPresent && (now - last >= GREET_COOLDOWN_MS)){
        state.greeter.present[join.uid] = true;
        state.greeter.lastGreet[join.uid] = now;
        await saveState();
        await send(HANGOUT_ID, GREET_MESSAGE.replace('{name}', join.name));
      } else {
        state.greeter.present[join.uid] = true;
      }
    }

    // Track now playing
    const s = parseSongFromSystem(m);
    if (s){
      const mentionUid = Object.keys(m?.data?.mentions || {})[0] || null;
      const mention    = mentionUid ? m?.data?.mentions?.[mentionUid] : null;
      const mdUserUid  = m?.data?.metadata?.user?.uid || m?.data?.user?.uid || null;
      const djUid      = mentionUid || mdUserUid || null;
      const djName     = djUid ? cleanName(mention?.name || m?.data?.metadata?.user?.name || djUid) : 'Unknown DJ';

      state.lastTrack = { songKey:s.songKey, artist:s.artist, title:s.title, djUid, djName };

      if (!state.songs[s.songKey]){
        state.songs[s.songKey] = { artist:s.artist, title:s.title, firstDjUid:djUid, firstDjName:djName, plays:1 };
      } else {
        state.songs[s.songKey].plays++;
      }
      if (djUid) ensureUser(djUid, djName);
      await saveState();
    }

    // Count votes (system only)
    const det = detectSystemVote(m);
    if (det){
      if (!(det.kind==='star' && Date.now() < (state.suppress.starUntil||0))){
        state.lastVote.why = det.why;
        await countVote(det.kind);
      }
    }
    return;
  }

  // Ignore our own echoes
  if (selfUid && fromUid === selfUid) return;

  // Optional greet on first user message
  if (GREET_ENABLED && GREET_ON_MSG_FALLBK && fromUid){
    const prevPresent = !!state.greeter.present[fromUid];
    if (!prevPresent){
      const now = Date.now();
      const last = state.greeter.lastGreet[fromUid] || 0;
      state.greeter.present[fromUid] = true;
      if (now - last >= GREET_COOLDOWN_MS){
        state.greeter.lastGreet[fromUid] = now;
        await saveState();
        await send(HANGOUT_ID, GREET_MESSAGE.replace('{name}', from));
      } else {
        await saveState();
      }
    }
  }

  const trimmed = (text||'').trim();

  // AI callout (instant)
  if (!trimmed.startsWith(COMMAND_PREFIX) && state.ai.enabled && hasBotCallout(trimmed)){
    const reply = await aiReply(`User "${from}" says: ${trimmed}`);
    if (reply) await send(HANGOUT_ID, reply);
    return;
  }

  // Commands
  if (!trimmed.startsWith(COMMAND_PREFIX)) return;
  const parts = trimmed.slice(COMMAND_PREFIX.length).split(/\s+/);
  const cmd = (parts.shift()||'').toLowerCase();
  const arg = parts.join(' ').trim();

  if (cmd === 'commands'){ await send(HANGOUT_ID, COMMANDS_TEXT); return; }
  if (cmd === '.commands'){ if (isAdmin(fromUid)) await send(HANGOUT_ID, HIDDEN_TEXT); return; }

  if (cmd === '.ai' || cmd === 'ai'){
    if (!isAdmin(fromUid)) return;
    const on = arg.toLowerCase()==='on';
    const off = arg.toLowerCase()==='off';
    if (on || off){
      state.ai.enabled = on;
      await saveState();
      await send(HANGOUT_ID, on ? '🧠 AI: ON' : '🧠 AI: OFF');
    } else {
      await send(HANGOUT_ID, `🧠 AI is ${state.ai.enabled?'ON':'OFF'}. Use "/ai on" or "/ai off".`);
    }
    return;
  }

  if (cmd === '.uptime'){
    if (!isAdmin(fromUid)) return;
    const ms = Date.now() - (state.bootAt || Date.now());
    const s = Math.floor(ms/1000)%60, m = Math.floor(ms/60000)%60, h = Math.floor(ms/3600000);
    await send(HANGOUT_ID, `⏱️ Uptime: ${h}h ${m}m ${s}s`);
    return;
  }

  if (cmd === 'ty'){
    await send(HANGOUT_ID, '🙏 Thank you Jodrell and Kai the Husky');
    return;
  }

  // 🔧 YOINK: send link + line
  if (cmd === 'yoink'){
    const gif = YOINK_GIFS.length ? YOINK_GIFS[Math.floor(Math.random()*YOINK_GIFS.length)] : null;
    const line = YOINK_LINES.length ? YOINK_LINES[Math.floor(Math.random()*YOINK_LINES.length)] : 'YOINK!';
    if (gif){
      await send(HANGOUT_ID, `${gif}\n🪝 ${line}`);
    } else {
      await send(HANGOUT_ID, `🪝 ${line}`);
    }
    return;
  }

  // Wiki behavior
  if (cmd === 'wiki'){
    const hasArgs = !!arg;
    const term = hasArgs ? arg : (state.lastTrack?.artist || '');
    if (!term){
      await send(HANGOUT_ID, 'ℹ️ Try /wiki when a song is playing, or use "/wiki Artist".');
      return;
    }
    try{
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}?redirect=false`;
      const ctl = new AbortController();
      const to  = setTimeout(()=>ctl.abort(), FETCH_TIMEOUT_MS);
      const r = await fetch(url, { headers:{accept:'application/json'}, signal: ctl.signal });
      clearTimeout(to);

      let delivered = false;
      if (r.ok){
        const data = await r.json();
        const extract = (data?.extract || '').trim();
        const title   = data?.title || term;
        const disambig = data?.type === 'disambiguation';
        const link = data?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

        if (hasArgs) {
          if (!disambig && extract){
            const short = extract.length>900 ? extract.slice(0,900)+'…' : extract;
            await send(HANGOUT_ID, `📚 ${title}\n${short}\n${link}`);
            delivered = true;
          }
        } else {
          const looksMusic = /\b(band|musician|singer|rapper|hip hop|rock|metal|artist)\b/i.test(extract);
          if (!disambig && extract && looksMusic){
            const short = extract.length>900 ? extract.slice(0,900)+'…' : extract;
            await send(HANGOUT_ID, `📚 ${title}\n${short}\n${link}`);
            delivered = true;
          }
        }
      }

      if (!delivered){
        if (OPENAI_API_KEY && state.lastTrack?.artist){
          const prompt = `Write a detailed paragraph about the artist "${state.lastTrack.artist}" and the current song "${state.lastTrack.title}". Plain text.`;
          const ai = await aiReply(prompt);
          await send(HANGOUT_ID, ai || `ℹ️ No Wikipedia summary found for ${term}.`);
        } else {
          await send(HANGOUT_ID, `ℹ️ No Wikipedia summary found for ${term}.`);
        }
      }
    } catch {
      if (OPENAI_API_KEY && state.lastTrack?.artist){
        const prompt = `Write a detailed paragraph about the artist "${state.lastTrack.artist}" and the current song "${state.lastTrack.title}". Plain text.`;
        const ai = await aiReply(prompt);
        await send(HANGOUT_ID, ai || `⚠️ Wikipedia lookup failed for ${term}`);
      } else {
        await send(HANGOUT_ID, `⚠️ Wikipedia lookup failed for ${term}`);
      }
    }
    return;
  }

  // Stats
  if (cmd === 'stats'){
    let targetUid = fromUid;
    let label = state.users[fromUid]?.name || from;

    if (arg === 'dj' && state.lastTrack?.djUid){
      targetUid = state.lastTrack.djUid;
      label = state.lastTrack.djName || targetUid;
    } else if (arg && arg !== 'debug'){
      const needle = arg.toLowerCase();
      const found = Object.entries(state.users).find(([_,u]) => (u.name||'').toLowerCase()===needle);
      if (found){ targetUid = found[0]; label = state.users[targetUid]?.name || label; }
    }
    const u = ensureUser(targetUid, label);

    const msg = [
      `📊 Stats for ${u.name}`,
      `• Bankroll: ${u.bankroll} chips`,
      `• Poker: ${u.wins} wins / ${u.losses} losses`,
      `• Reactions: 👍 ${u.up||0} 👎 ${u.down||0} ⭐ ${u.star||0}`
    ].join('\n');

    await saveState();
    await send(HANGOUT_ID, msg);
    return;
  }

  // Song stats
  if (cmd === 'songstats'){
    const lt = state.lastTrack;
    if (!lt){ await send(HANGOUT_ID, '🎧 No track info yet.'); return; }
    const s = state.songs[lt.songKey];
    if (!s){
      await send(HANGOUT_ID, `🎧 ${lt.artist} — ${lt.title}\nFRESH TRACK! 🔥🔥🔥`);
      return;
    }
    const msg = [
      `🎧 ${s.artist} — ${s.title}`,
      `• Total plays: ${s.plays}`,
      `• First played by: ${cleanName(s.firstDjName || s.firstDjUid || 'Unknown')}`
    ].join('\n');
    await send(HANGOUT_ID, msg);
    return;
  }

  // Dice game /roll — only current DJ; 4–6 upvote, 1 downvote
  if (cmd === 'roll'){
    if (!state.lastTrack?.djUid){ await send(HANGOUT_ID, '🎲 No song playing.'); return; }
    if (fromUid !== state.lastTrack.djUid){ await send(HANGOUT_ID, '🎲 Only the current DJ can /roll.'); return; }
    const n = 1 + Math.floor(Math.random()*6);
    if (n >= 4){
      await sendRoomVote('up');
      await send(HANGOUT_ID, `🎲 You rolled a ${n} — 👍 Upvoted!`);
    } else if (n === 1){
      await sendRoomVote('down');
      await send(HANGOUT_ID, `🎲 You rolled a 1 — 👎 Downvoted. Tough crowd.`);
    } else {
      await send(HANGOUT_ID, `🎲 You rolled a ${n} — no vote.`);
    }
    return;
  }

  // Owner-only: star current song (no stats credit)
  if (cmd === '.star'){
    if (!isAdmin(fromUid) || !state.lastTrack?.djUid) return;
    state.suppress.starUntil = Date.now() + 8000; // ignore star counts briefly
    await saveState();
    const ok = await sendRoomVote('star', { affectStats:false });
    if (ok) {
      await send(HANGOUT_ID, `⭐ Star sent for ${state.lastTrack.artist} — ${state.lastTrack.title}`);
    } else {
      await send(HANGOUT_ID, `⭐ Tried to star, but the server reaction endpoint isn't available.`);
    }
    return;
  }

  // Weather (text)
  if (cmd === 'w'){
    const reply = await weatherText(arg);
    await send(HANGOUT_ID, reply);
    return;
  }

  // Cooperative /ro — user1: "ro", user2: "ro ro", user3: "row row row 🚤"
  if (cmd === 'ro'){
    const arr = state.rowGame.uids.filter(Boolean);
    if (!arr.includes(fromUid)) arr.push(fromUid);
    if (arr.length === 1){
      await send(HANGOUT_ID, 'ro');
    } else if (arr.length === 2){
      await send(HANGOUT_ID, 'ro ro');
    } else {
      await send(HANGOUT_ID, 'row row row 🚤');
      state.rowGame.uids = []; // reset
      await saveState();
      return;
    }
    state.rowGame.uids = arr;
    await saveState();
    return;
  }

  // 🃏 jirf poker
  if (cmd === 'p' || cmd === 'poker'){
    if (state.poker){ await send(HANGOUT_ID, '🃏 jirf poker — Round already running. Use `/bet <amount>`'); return; }
    state.poker = { startedAt:Date.now(), bets:{}, bettors:{}, phase:'betting', bankCaps:{} };
    for (const [uid,u] of Object.entries(state.users)){
      state.poker.bankCaps[uid] = Math.max(1, Math.floor((u.bankroll||0)*(POKER_MAX_BANK_PCT/100)));
    }
    await saveState();
    await send(HANGOUT_ID, `🃏 jirf poker — ${Math.floor(POKER_BET_WINDOW_MS/1000)}s to place bets. Type \`/bet <amount>\` (max ${POKER_MAX_BANK_PCT}% bankroll).`);

    setTimeout(async ()=>{
      try{
        if (!state.poker || state.poker.phase!=='betting') return;
        const participants = Object.keys(state.poker.bets);
        if (!participants.length){
          await send(HANGOUT_ID, '⏱️ No bets placed. Round cancelled.');
          state.poker = null; await saveState(); return;
        }
        state.poker.phase='dealing';
        const deck = newDeck();
        const player = draw(deck,3);
        const pEval = eval3(player);
        state.poker.playerHand = player;
        await send(HANGOUT_ID, `🂠 Player: ${fmtCards(player)} — ${pEval.name}\n🤫 Dealer reveals in ${Math.floor(POKER_DEALER_DELAY_MS/1000)}s…`);
        await saveState();

        setTimeout(async ()=>{
          try{
            if (!state.poker) return;
            const dealer = draw(deck,3);
            const dEval = eval3(dealer);
            await send(HANGOUT_ID, `🏦 Dealer: ${fmtCards(dealer)} — ${dEval.name}`);
            const playerWins = pEval.score > dEval.score;
            const tie = pEval.score === dEval.score;
            const mult = PAYOUT_MULT[pEval.idx] || 1;
            let summary = '';
            if (tie) summary = '🟰 Push! Bets returned.';
            else if (playerWins) summary = `✅ Player wins! Payout x${mult}`;
            else summary = '❌ Dealer wins. Bets lost.';
            for (const uid of Object.keys(state.poker.bets)){
              const bet = state.poker.bets[uid];
              const u = ensureUser(uid, state.poker.bettors[uid]);
              if (tie){
                // no change
              } else if (playerWins){
                u.bankroll += bet * mult;
                u.wins = (u.wins||0)+1;
              } else {
                u.bankroll -= bet;
                if (u.bankroll<0) u.bankroll=0;
                u.losses = (u.losses||0)+1;
              }
            }
            await send(HANGOUT_ID, summary);
            state.poker = null; await saveState();
          }catch(e){ log.warn('dealer reveal err:', e.message||e); state.poker=null; await saveState(); }
        }, POKER_DEALER_DELAY_MS);
      }catch(e){ log.warn('deal err:', e.message||e); state.poker=null; await saveState(); }
    }, POKER_BET_WINDOW_MS);
    return;
  }

  if (cmd === 'bet'){
    if (!state.poker || state.poker.phase!=='betting'){ await send(HANGOUT_ID, '⛔ No betting open. Start with `/p`'); return; }
    const amt = Math.floor(Number(arg));
    if (!Number.isFinite(amt) || amt<=0){ await send(HANGOUT_ID, 'Usage: `/bet <amount>`'); return; }
    const u = ensureUser(fromUid, from);
    const cap = Math.max(1, Math.floor((u.bankroll||0)*(POKER_MAX_BANK_PCT/100)));
    if (amt>cap){ await send(HANGOUT_ID, `⚠️ Max bet is ${POKER_MAX_BANK_PCT}% of bankroll (${cap}).`); return; }
    state.poker.bets[fromUid]=amt;
    state.poker.bettors[fromUid]=u.name;
    await saveState();
    await send(HANGOUT_ID, `💰 Bet accepted for ${u.name}: ${amt} chips`);
    return;
  }

  // Slots: /s <amount> (cap 10% bankroll); 10 spins/day per user
  if (cmd === 's'){
    const amt = Math.floor(Number(arg));
    const u = ensureUser(fromUid, from);
    if (!Number.isFinite(amt) || amt<=0){
      await send(HANGOUT_ID, `🎰 Karen's Club Casino — Slots\nUsage: /s <amount>  (max ${POKER_MAX_BANK_PCT}% of bankroll)\nDaily spins: ${u.slotsToday?.spins||0}/${SLOTS_DAILY_SPINS}`);
      return;
    }
    const cap = Math.max(1, Math.floor((u.bankroll||0)*(POKER_MAX_BANK_PCT/100)));
    if (amt>cap){ await send(HANGOUT_ID, `⚠️ Max bet is ${POKER_MAX_BANK_PCT}% of bankroll (${cap}).`); return; }
    const today = new Date().toISOString().slice(0,10);
    if (u.slotsToday.date !== today){ u.slotsToday = { date: today, spins: 0 }; }
    if (u.slotsToday.spins >= SLOTS_DAILY_SPINS){
      await send(HANGOUT_ID, `⛔ Daily limit reached (${SLOTS_DAILY_SPINS} spins). Try tomorrow.`);
      return;
    }
    // Spin RNG
    u.slotsToday.spins++;
    const symbols = ['🍒','🍋','🔔','⭐','7️⃣'];
    const weights = [40, 30, 15, 10, 5];
    function pick(){
      let r = Math.random()*100, acc=0;
      for (let i=0;i<symbols.length;i++){ acc+=weights[i]; if (r<acc) return symbols[i]; }
      return symbols[0];
    }
    const r1=pick(), r2=pick(), r3=pick();
    let payoutMult = 0;
    if (r1===r2 && r2===r3){
      if (r1==='7️⃣') payoutMult = 20;
      else if (r1==='⭐') payoutMult = 10;
      else if (r1==='🔔') payoutMult = 6;
      else if (r1==='🍋') payoutMult = 4;
      else payoutMult = 3; // 🍒
    } else if (r1===r2 || r2===r3 || r1===r3){
      payoutMult = 1.5;
    } else {
      payoutMult = 0;
    }

    if (payoutMult>0){
      const win = Math.floor(amt * payoutMult);
      u.bankroll += win;
      await send(HANGOUT_ID, `🎰 [${r1} | ${r2} | ${r3}] — WIN +${win} chips (x${payoutMult})  •  Spins: ${u.slotsToday.spins}/${SLOTS_DAILY_SPINS}`);
    } else {
      u.bankroll -= amt;
      if (u.bankroll<0) u.bankroll=0;
      await send(HANGOUT_ID, `🎰 [${r1} | ${r2} | ${r3}] — lost ${amt} chips  •  Spins: ${u.slotsToday.spins}/${SLOTS_DAILY_SPINS}`);
    }
    await saveState();
    return;
  }
}

// ──────────── Greeter poll ────────────
let lastGreetPoll = 0;
async function pollMembersAndGreet(){
  const now = Date.now();
  if (now - lastGreetPoll < GREET_POLL_MS) return;
  lastGreetPoll = now;
  if (!GREET_ENABLED) return;

  let res;
  try{
    res = await listGroupMembers(HANGOUT_ID, {limit:200});
  } catch{ return; }
  const members = Array.isArray(res?.data)? res.data : [];
  const currentSet = new Set();

  for (const m of members){
    const uid = m?.uid || m?.user?.uid || m?.user;
    const name = cleanName(m?.name || m?.user?.name || uid);
    if (!uid || uid === selfUid) continue;
    currentSet.add(uid);

    const prevPresent = !!state.greeter.present[uid];
    const last = state.greeter.lastGreet[uid] || 0;

    if (!prevPresent){
      if (now - last >= GREET_COOLDOWN_MS){
        state.greeter.lastGreet[uid] = now;
        await send(HANGOUT_ID, GREET_MESSAGE.replace('{name}', name));
      }
      state.greeter.present[uid] = true;
    }
  }

  // Mark leavers
  for (const uid of Object.keys(state.greeter.present)){
    if (uid !== selfUid && !currentSet.has(uid)){
      state.greeter.present[uid] = false;
    }
  }
  await saveState();
}

// Avoid boot spam: mark current members present
async function primeMembersSeen(){
  try{
    const res = await listGroupMembers(HANGOUT_ID, {limit:200});
    const members = Array.isArray(res?.data)? res.data : [];
    for (const m of members){
      const uid = m?.uid || m?.user?.uid || m?.user;
      if (uid && uid !== selfUid){
        state.greeter.present[uid] = true; // present now; no greet on boot
      }
    }
    await saveState();
  }catch{}
}

// ──────────── Main loop ────────────
async function main(){
  await loadState();
  await fetchCometAuthToken();
  await ensureGroupMembership(); // auto-join group on boot
  await seedWatermark();
  await primeMembersSeen();

  if (SAFE_MODE) {
    log.info('🔐 SAFE_MODE is ON — restricting hosts, redacting logs, and confining state file location.');
  } else {
    log.warn('SAFE_MODE is OFF — be careful when running from untrusted env values.');
  }

  while (true){
    try {
      const res = await listGroupMessages(HANGOUT_ID, {limit:MSG_LIMIT});
      const items = Array.isArray(res?.data)? res.data : [];
      items.sort((a,b)=>{
        const as=a?.sentAt||0, bs=b?.sentAt||0;
        if (as!==bs) return as-bs;
        const ai=Number(a?.id)||0, bi=Number(b?.id)||0;
        return ai-bi;
      });
      for (const m of items){
        const sAt = m?.sentAt||0, mid = Number(m?.id)||0;
        if (sAt < lastSeenSentAt || (sAt===lastSeenSentAt && mid<=lastSeenId)) continue;
        lastSeenSentAt = sAt; lastSeenId = mid;
        await handleMessage(m);
      }
    } catch(e){
      const msg = String(e?.message || e);
      if (msg.includes('ERR_GROUP_NOT_JOINED')) {
        log.warn('not in group; attempting auto-join…');
        await ensureGroupMembership();
      } else {
        log.warn('poll error:', msg);
      }
    }

    try { await pollMembersAndGreet(); } catch(e){}

    await sleep(POLL_MS);
  }
}
main().catch(()=>process.exit(1));
