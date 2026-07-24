const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const SyncRun = require('../models/SyncRun');
const Game = require('../models/Game');
const GameCard = require('../models/GameCard');
const CashierSubmission = require('../models/CashierSubmission');
const DailySummary = require('../models/DailySummary');
const User = require('../models/User');
const { CLOUD_SYNC_URL, CLOUD_SYNC_API_KEY, SHOP_ID } = require('../config/env');

const router = express.Router();

router.use(requireAuth(['admin']));

const SYNCABLE = [
  { name: 'games', Model: Game },
  { name: 'game_cards', Model: GameCard },
  { name: 'cashier_submissions', Model: CashierSubmission },
  { name: 'daily_summaries', Model: DailySummary },
  {
    name: 'users',
    Model: User,
    // Never sync password hashes to the cloud - see backend spec §5.
    project: (u) => ({
      id: String(u._id),
      shopId: u.shopId,
      name: u.name,
      username: u.username,
      role: u.role,
      status: u.status,
    }),
  },
];

// Best-effort push of every unsynced document across the relevant collections to the
// cloud's /api/sync/ingest. Never blocks or is required for local operation - if
// CLOUD_SYNC_URL is unset or unreachable, this simply records a failed/partial run and
// returns normally (architecture §6).
async function runSyncPush(shopId) {
  if (!CLOUD_SYNC_URL) {
    return SyncRun.create({
      startedAt: new Date(),
      status: 'failed',
      error: 'CLOUD_SYNC_URL is not configured',
      finishedAt: new Date(),
      detail: {},
    });
  }

  const query = { shopId, $or: [{ syncedToCloudAt: null }, { $expr: { $gt: ['$updatedAt', '$syncedToCloudAt'] } }] };

  // Check first, before creating any SyncRun record, so a no-op sync (everything
  // already synced) doesn't clutter the Admin app's sync history.
  const counts = await Promise.all(SYNCABLE.map(({ Model }) => Model.countDocuments(query)));
  if (counts.every((c) => c === 0)) {
    return { nothingToSync: true };
  }

  const run = await SyncRun.create({ startedAt: new Date(), status: 'running', detail: {} });
  const detail = {};
  let overall = 'success';

  // eslint-disable-next-line no-restricted-syntax
  for (const { name, Model, project } of SYNCABLE) {
    // eslint-disable-next-line no-await-in-loop
    const docs = await Model.find(query);
    if (!docs.length) {
      detail[name] = { sent: 0, failed: 0 };
      // eslint-disable-next-line no-continue
      continue;
    }

    const payload = docs.map((d) => (project ? project(d) : d.toObject()));
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`${CLOUD_SYNC_URL}/api/sync/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-shop-id': shopId, 'x-api-key': CLOUD_SYNC_API_KEY },
        body: JSON.stringify({ shopId, collection: name, docs: payload }),
      });
      if (response.ok) {
        const now = new Date();
        // eslint-disable-next-line no-await-in-loop
        await Model.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { $set: { syncedToCloudAt: now } });
        detail[name] = { sent: docs.length, failed: 0 };
      } else {
        detail[name] = { sent: 0, failed: docs.length };
        overall = 'partial';
      }
    } catch (err) {
      detail[name] = { sent: 0, failed: docs.length, error: err.message };
      overall = 'partial';
    }
  }

  run.status = overall;
  run.detail = detail;
  run.finishedAt = new Date();
  await run.save();
  return run;
}

// POST /api/sync/push (admin, local mode only)
router.post('/push', asyncHandler(async (req, res) => {
  const run = await runSyncPush(req.user.shopId);

  if (run.nothingToSync) {
    return res.json({ nothingToSync: true });
  }

  return res.status(201).json(run);
}));

// GET /api/sync/runs - sync history for the Admin app's Sync screen (most recent 10).
router.get('/runs', asyncHandler(async (req, res) => {
  const runs = await SyncRun.find().sort({ startedAt: -1 }).limit(10);
  res.json(runs);
}));

module.exports = router;
module.exports.runSyncPush = runSyncPush;
