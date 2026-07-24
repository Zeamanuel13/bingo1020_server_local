const User = require('../models/User');
const { CLOUD_SYNC_URL, CLOUD_SYNC_API_KEY, SHOP_ID, DEPLOY_MODE } = require('../config/env');

// Local mode only, best-effort, never blocking: pulls admin records (new accounts and
// status changes) made in the Super Admin dashboard for this shop. This is the one
// deliberate exception to "no cloud->local sync" (architecture §6) - admin
// provisioning has to originate from the cloud somehow, but it's still entirely
// non-authoritative for day-to-day operation: local credentials, once an admin has
// logged in and changed their temporary password, are never overwritten by this again.
async function pullAdminChanges() {
  if (DEPLOY_MODE !== 'local' || !CLOUD_SYNC_URL || !SHOP_ID) return;

  let admins;
  try {
    const response = await fetch(`${CLOUD_SYNC_URL}/api/sync/admins`, {
      headers: { 'x-shop-id': SHOP_ID, 'x-api-key': CLOUD_SYNC_API_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return; // no internet, cloud down, or not configured yet - just skip quietly
    admins = await response.json();
  } catch (_) {
    return; // never let a network hiccup here affect anything else
  }

  for (const remote of admins) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const local = await User.findOne({ shopId: SHOP_ID, username: remote.username, role: 'admin' });

      if (!local) {
        if (!remote.passwordHash) continue; // eslint-disable-line no-continue
        // eslint-disable-next-line no-await-in-loop
        await User.create({
          shopId: SHOP_ID,
          name: remote.name,
          username: remote.username,
          passwordHash: remote.passwordHash,
          role: 'admin',
          status: remote.status || 'active',
          mustChangePassword: true,
        });
        console.log(`[adminSync] created local admin "${remote.username}" from cloud record`);
        continue; // eslint-disable-line no-continue
      }

      local.status = remote.status || local.status;
      // Local becomes authoritative for credentials the moment this admin changes
      // their temporary password - never let a cloud pull clobber it after that.
      if (local.mustChangePassword && remote.passwordHash) {
        local.passwordHash = remote.passwordHash;
      }
      // eslint-disable-next-line no-await-in-loop
      await local.save();
    } catch (err) {
      console.error(`[adminSync] failed to reconcile admin "${remote.username}"`, err.message);
    }
  }
}

module.exports = { pullAdminChanges };
