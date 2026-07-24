const express = require('express');
const { z } = require('zod');
const { requireShopApiKey } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const Game = require('../models/Game');
const GameCard = require('../models/GameCard');
const CashierSubmission = require('../models/CashierSubmission');
const DailySummary = require('../models/DailySummary');
const User = require('../models/User');

const router = express.Router();

const MODEL_BY_COLLECTION = {
  games: Game,
  game_cards: GameCard,
  cashier_submissions: CashierSubmission,
  daily_summaries: DailySummary,
  users: User,
};

const ingestSchema = z.object({
  shopId: z.string().min(1),
  collection: z.enum(['games', 'game_cards', 'cashier_submissions', 'daily_summaries', 'users']),
  docs: z.array(z.record(z.string(), z.any())),
});

// POST /api/sync/ingest - called by a shop's local server (architecture §6, backend
// spec §5). Authenticated via the per-shop API key, not a JWT - the local server has
// no super_admin session. Upserts by _id so re-sending the same batch is a no-op.
router.post('/ingest', requireShopApiKey, asyncHandler(async (req, res) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { collection, docs } = parsed.data;

  const Model = MODEL_BY_COLLECTION[collection];
  let upserted = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (const doc of docs) {
    const { id, _id, ...rest } = doc;
    const docId = _id || id; // the `users` projection sends `id`, everything else sends `_id`
    if (!docId) continue; // eslint-disable-line no-continue

    // Cloud never accepts password hashes from local - see backend spec §5.
    delete rest.passwordHash;

    try {
      // eslint-disable-next-line no-await-in-loop
      await Model.updateOne({ _id: docId }, { $set: rest }, { upsert: true });
    } catch (err) {
      if (err.code !== 11000 || !err.keyValue) throw err;
      // A different local _id can represent the same shop-scoped record after a local
      // reseed/recreation (e.g. same username, or same daily-summary date) - converge
      // onto the cloud doc that already owns that unique key instead of failing the
      // whole ingest batch (and leaving this doc permanently un-syncable).
      // eslint-disable-next-line no-await-in-loop
      await Model.updateOne(err.keyValue, { $set: rest }, { upsert: true });
    }
    upserted += 1;
  }

  req.shop.lastSyncAt = new Date();
  await req.shop.save();

  res.json({ ok: true, collection, upserted });
}));

// GET /api/sync/admins - a shop's local server pulls its own admin records (new
// accounts and status changes made in the Super Admin dashboard) on startup and
// periodically (src/utils/adminSync.js). Same per-shop API key auth as /ingest.
// Includes passwordHash ONLY for admins that still have mustChangePassword set - once
// an admin changes their password locally that first time, the cloud copy is never
// consulted for credentials again (local becomes authoritative from then on).
router.get('/admins', requireShopApiKey, asyncHandler(async (req, res) => {
  const admins = await User.find({ shopId: String(req.shop._id), role: 'admin' });
  res.json(admins.map((a) => ({
    id: String(a._id),
    name: a.name,
    username: a.username,
    status: a.status,
    mustChangePassword: a.mustChangePassword,
    passwordHash: a.mustChangePassword ? a.passwordHash : undefined,
  })));
}));

module.exports = router;
