// scripts/preflight.mjs
import fs from 'node:fs/promises';

const REQUIRED = ['BOT_USER_TOKEN', 'HANGOUT_ID'];
const missing = REQUIRED.filter(k => !process.env[k] || !String(process.env[k]).trim());
if (missing.length) {
  console.error('⛔ Missing required environment variables:\n  - ' + missing.join('\n  - '));
  console.error('\nFix: copy .env.example to .env and fill the values, e.g.:\n  cp .env.example .env\n  # then edit .env\n');
  process.exit(1);
}

const major = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(major) || major < 18) {
  console.error(`⛔ Node.js 18+ required. You are on ${process.version}`);
  process.exit(1);
}

// Ensure a writable state directory exists (docker & local)
const defPath = process.env.STATE_FILE || './bot-state.json';
const idx = defPath.lastIndexOf('/');
const dir = idx >= 0 ? defPath.slice(0, idx) : '.';

try {
  await fs.mkdir(dir, { recursive: true });
} catch (e) {
  console.error('⚠️ Could not create state directory:', dir, e?.message || e);
}
console.log('✅ Preflight OK. Starting bot…');
