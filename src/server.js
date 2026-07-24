const app = require('./app');
const { connectDb } = require('./config/db');
const { PORT, DEPLOY_MODE, SHOP_ID, LICENSE_KEY } = require('./config/env');
const { initLicense } = require('./utils/license');
const { getLanIp } = require('./utils/network');

// Last-resort safety net: this server must stay up through an entire shift even if some
// unexpected error slips past asyncHandler (e.g. from a timer or driver callback outside
// a request). Logging and continuing is far preferable to taking the whole shop's system
// down mid-game over one bad request.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// Local mode only: a daily mongodump from day one (06_ADDITIONAL_FEATURES §3) - this
// machine is the only copy of this shop's history until/unless cloud sync catches up.
// A failed backup must never take the server down; it just logs and tries again
// tomorrow. Runs at most once per real 24h period - restarting the server (common
// during setup/testing, or just a shop PC rebooting) must not trigger a fresh dump
// every time.
function scheduleDailyBackups() {
  if (DEPLOY_MODE !== 'local') return;
  const { runBackup, pruneOldBackups, getLastBackupTime } = require('../scripts/backup');
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const runSafely = () => {
    runBackup()
      .then(pruneOldBackups)
      .catch((err) => console.error('[backup] scheduled backup failed', err.message));
  };

  const lastBackupAt = getLastBackupTime();
  const dueInMs = lastBackupAt ? Math.max(0, ONE_DAY_MS - (Date.now() - lastBackupAt)) : 0;

  setTimeout(() => {
    runSafely();
    setInterval(runSafely, ONE_DAY_MS);
  }, dueInMs);
}

// Local mode only: verifies this install's license key and machine binding once at
// startup (see utils/license.js). Deliberately never blocks app.listen or refuses to
// start - an invalid/missing license is surfaced as a warning banner in the Admin app
// via /api/health instead, so a shop is never locked out of its own system over this.
function checkLicense() {
  if (DEPLOY_MODE !== 'local') return;
  const status = initLicense(SHOP_ID, LICENSE_KEY);
  if (!status.licensed) {
    console.warn(`[license] ${status.message}`);
  }
}

// Local mode only, best-effort: pulls admin-record changes (new accounts, disables)
// from the cloud once at startup only. Runs after the server is already listening,
// never before - a shop with no internet at boot must never have its startup delayed
// or blocked by this (architecture §6's non-negotiable ground rule applies here too,
// even though this one deliberate exception pulls FROM the cloud).
function scheduleAdminSync() {
  if (DEPLOY_MODE !== 'local') return;
  const { pullAdminChanges } = require('./utils/adminSync');
  pullAdminChanges().catch((err) => console.error('[adminSync] pull failed', err.message));
}

async function main() {
  await connectDb();
  checkLicense();
  app.listen(PORT, () => {
    console.log(`[server] bingo1020_server listening on :${PORT} (mode=${DEPLOY_MODE}${SHOP_ID ? `, shop=${SHOP_ID}` : ''})`);
    if (DEPLOY_MODE === 'local') {
      const lanIp = getLanIp();
      console.log(lanIp ? `[server] LAN address: http://${lanIp}:${PORT}` : '[server] could not determine a LAN IP for this machine');
    }
    scheduleDailyBackups();
    scheduleAdminSync();
  });
}

main().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
