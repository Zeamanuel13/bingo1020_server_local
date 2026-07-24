// Local MongoDB backup (06_ADDITIONAL_FEATURES §3): all shop history lives on one
// machine with no cloud copy until a manual/periodic sync happens, so daily backups
// matter from day one. Runs `mongodump` into a timestamped folder under ./backups
// (point BACKUP_DIR at an attached external/USB drive in production), and prunes
// dumps older than BACKUP_RETENTION_DAYS (default 30).
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
require('dotenv').config();
const { MONGO_URI } = require('../src/config/env');

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, '../backups');
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS) || 30;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runBackup() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const outDir = path.join(BACKUP_DIR, `dump-${timestamp()}`);

    execFile('mongodump', ['--uri', MONGO_URI, '--out', outDir], (err, stdout, stderr) => {
      if (err) {
        console.error('[backup] mongodump failed - is the MongoDB Database Tools package installed?', err.message);
        return reject(err);
      }
      console.log(`[backup] wrote ${outDir}`);
      if (stderr) console.log(stderr.trim());
      resolve(outDir);
    });
  });
}

// Most recent existing dump's timestamp, or null if there isn't one yet - lets the
// scheduler below tell "just restarted the server" apart from "a day actually passed"
// instead of dumping fresh on every restart.
function getLastBackupTime() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  let latest = null;
  for (const entry of fs.readdirSync(BACKUP_DIR)) {
    const full = path.join(BACKUP_DIR, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && (latest === null || stat.mtimeMs > latest)) latest = stat.mtimeMs;
  }
  return latest;
}

function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(BACKUP_DIR)) {
    const full = path.join(BACKUP_DIR, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && stat.mtimeMs < cutoff) {
      fs.rmSync(full, { recursive: true, force: true });
      console.log(`[backup] pruned old backup ${entry}`);
    }
  }
}

async function main() {
  await runBackup();
  pruneOldBackups();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runBackup, pruneOldBackups, getLastBackupTime };
