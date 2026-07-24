const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const Game = require('../models/Game');
const GameCard = require('../models/GameCard');
const CashierSubmission = require('../models/CashierSubmission');
const Cartela = require('../models/Cartela');
const { requireAuth } = require('../middleware/auth');
const { generateGameId } = require('../utils/gameId');
const { touchDailySummaryForFinishedGame } = require('../utils/dailySummary');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(requireAuth(['admin', 'cashier']));

function toGamePublic(game) {
  return {
    id: String(game._id),
    gameId: game.gameId,
    name: game.name,
    unitPrice: game.unitPrice,
    status: game.status,
    totalCards: game.totalCards,
    totalAmount: game.totalAmount,
    // A game can have multiple simultaneous BINGO winners. Falls back to the old
    // single-winner field for any game recorded before this changed, so historical
    // records already saved that way don't lose their winner in the UI.
    winners: (game.winners && game.winners.length) ? game.winners : (game.winner ? [game.winner] : []),
    voidReason: game.voidReason,
    unverified: game.unverified,
    createdAt: game.createdAt,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
  };
}

// POST /api/games (admin) - {name?, unitPrice, gameId?} -> server generates gameId
// unless one is supplied (Admin app offline-first reconciliation: a game created
// entirely locally while the local server was unreachable already announced its
// locally-picked gameId to cashiers and merged their submissions against it, so on
// sync it must keep that exact id rather than get a different one - safe because
// there is exactly one local server per shop, so nothing else could have claimed
// that id while it was unreachable).
const createGameSchema = z.object({
  name: z.string().optional().default(''),
  unitPrice: z.number().int().positive().default(10),
  gameId: z.string().regex(/^\d{4}$/).optional(),
});

router.post('/', requireAuth(['admin']), asyncHandler(async (req, res) => {
  const parsed = createGameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  let gameId = parsed.data.gameId;
  if (gameId) {
    const taken = await Game.exists({ shopId: req.user.shopId, gameId });
    if (taken) {
      return res.status(409).json({ error: `Game ${gameId} already exists for this shop - cannot reconcile with that id` });
    }
  } else {
    gameId = await generateGameId(req.user.shopId);
  }

  const game = await Game.create({
    shopId: req.user.shopId,
    gameId,
    name: parsed.data.name,
    unitPrice: parsed.data.unitPrice,
    status: 'open',
    createdBy: req.user.id,
  });

  res.status(201).json(toGamePublic(game));
}));

// GET /api/games/open - convenience endpoint for the cashier app's "select active game" list.
router.get('/open', asyncHandler(async (req, res) => {
  const games = await Game.find({ shopId: req.user.shopId, status: 'open' }).sort({ createdAt: -1 });
  res.json(games.map(toGamePublic));
}));

// GET /api/games?status=&limit=&before= - sorted by createdAt descending.
router.get('/', asyncHandler(async (req, res) => {
  const filter = { shopId: req.user.shopId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const games = await Game.find(filter).sort({ createdAt: -1 }).limit(limit);
  res.json(games.map(toGamePublic));
}));

// GET /api/games/:gameId - detail incl. denormalized totals.
router.get('/:gameId', asyncHandler(async (req, res) => {
  const game = await Game.findOne({ shopId: req.user.shopId, gameId: req.params.gameId });
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(toGamePublic(game));
}));

// PATCH /api/games/:gameId/status (admin) - open -> closed_registration -> finished, or
// open|closed_registration -> voided.
const statusSchema = z.object({
  status: z.enum(['closed_registration', 'finished', 'voided']),
  voidReason: z.string().optional(),
});

const ALLOWED_TRANSITIONS = {
  open: ['closed_registration', 'voided', 'finished'],
  closed_registration: ['finished', 'voided'],
};

router.patch('/:gameId/status', requireAuth(['admin']), asyncHandler(async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const game = await Game.findOne({ shopId: req.user.shopId, gameId: req.params.gameId });
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const allowed = ALLOWED_TRANSITIONS[game.status] || [];
  if (!allowed.includes(parsed.data.status)) {
    return res.status(400).json({ error: `Cannot transition game from ${game.status} to ${parsed.data.status}` });
  }
  if (parsed.data.status === 'voided' && !parsed.data.voidReason) {
    return res.status(400).json({ error: 'voidReason is required to void a game' });
  }
  if (parsed.data.status === 'finished' && !(game.winners?.length || game.winner)) {
    return res.status(400).json({ error: 'Declare at least one winner before finishing the game' });
  }

  game.status = parsed.data.status;
  if (parsed.data.status === 'voided') game.voidReason = parsed.data.voidReason;
  if (parsed.data.status === 'finished') game.finishedAt = new Date();
  await game.save();

  if (parsed.data.status === 'finished' || parsed.data.status === 'voided') {
    await touchDailySummaryForFinishedGame(game);
  }

  res.json(toGamePublic(game));
}));

// GET /api/games/:gameId/cards?search= - list registered cards for a game.
router.get('/:gameId/cards', asyncHandler(async (req, res) => {
  const game = await Game.findOne({ shopId: req.user.shopId, gameId: req.params.gameId });
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const filter = { shopId: req.user.shopId, gameId: req.params.gameId };
  if (req.query.search) {
    const search = String(req.query.search).trim();
    if (/^\d+$/.test(search)) {
      filter.cardNo = Number(search);
    } else {
      return res.json({ cards: [] });
    }
  }

  const cards = await GameCard.find(filter).sort({ registeredAt: 1 });
  const cartelaByNo = new Map();
  if (cards.length) {
    const cartelas = await Cartela.find({ cartelaNo: { $in: cards.map((c) => c.cardNo) } });
    cartelas.forEach((c) => cartelaByNo.set(c.cartelaNo, c.bingoNumbers));
  }

  res.json({
    cards: cards.map((c) => ({
      cardNo: c.cardNo,
      cashierId: String(c.cashierId),
      cashierName: c.cashierName,
      unitPrice: c.unitPrice,
      registeredAt: c.registeredAt,
      bingoNumbers: cartelaByNo.get(c.cardNo) || null,
    })),
  });
}));

// GET /api/games/:gameId/cashier-breakdown - per-cashier registered-card totals for the
// Admin app's game detail screen, aggregated straight off game_cards (the source of
// truth for what's actually accepted) rather than cashier_submissions (which can include
// rejected/duplicate cards from a re-scanned batch).
router.get('/:gameId/cashier-breakdown', asyncHandler(async (req, res) => {
  const game = await Game.findOne({ shopId: req.user.shopId, gameId: req.params.gameId });
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const breakdown = await GameCard.aggregate([
    { $match: { shopId: req.user.shopId, gameId: req.params.gameId } },
    { $group: { _id: '$cashierId', cashierName: { $first: '$cashierName' }, cardsReceived: { $sum: 1 }, totalAmount: { $sum: '$unitPrice' } } },
    { $sort: { cardsReceived: -1 } },
  ]);

  res.json(breakdown.map((b) => ({
    cashierId: String(b._id),
    cashierName: b.cashierName,
    cardsReceived: b.cardsReceived,
    totalAmount: b.totalAmount,
  })));
}));

// POST /api/games/:gameId/winner (admin) - {cardNo, prizeAmount}. Adds one winner to
// the game - a bingo game can have several simultaneous winners, so this deliberately
// does NOT finish the game; the admin finishes explicitly via PATCH /:gameId/status
// once they're done declaring winners.
const declareWinnerSchema = z.object({
  cardNo: z.number().int().nonnegative(),
  prizeAmount: z.number().positive(),
});

router.post('/:gameId/winner', requireAuth(['admin']), asyncHandler(async (req, res) => {
  const parsed = declareWinnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const game = await Game.findOne({ shopId: req.user.shopId, gameId: req.params.gameId });
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'voided' || game.status === 'finished') {
    return res.status(400).json({ error: `Game is already ${game.status}` });
  }

  const card = await GameCard.findOne({
    shopId: req.user.shopId,
    gameId: req.params.gameId,
    cardNo: parsed.data.cardNo,
  });
  if (!card) {
    return res.status(404).json({ error: 'Card is not registered for this game' });
  }
  if (game.winners.some((w) => w.cardNo === parsed.data.cardNo)) {
    return res.status(409).json({ error: `Card ${parsed.data.cardNo} has already been declared a winner` });
  }

  game.winners.push({
    cardNo: parsed.data.cardNo,
    cashierId: card.cashierId,
    prizeAmount: parsed.data.prizeAmount,
    declaredAt: new Date(),
    declaredBy: req.user.id,
  });
  await game.save();

  res.json(toGamePublic(game));
}));

// ---- Cashier submissions (the QR merge step) ----

const cardNoSchema = z.number().int().min(0).max(25999);

const createSubmissionSchema = z.object({
  submissionId: z.string().optional(),
  cards: z.array(cardNoSchema).min(1),
  unitPrice: z.number().positive(),
  totalAmount: z.number().nonnegative(),
});

// POST /api/games/:gameId/submissions (cashier) - the cashier's own "Done" batch.
router.post('/:gameId/submissions', requireAuth(['cashier']), asyncHandler(async (req, res) => {
  const parsed = createSubmissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const game = await Game.findOne({ shopId: req.user.shopId, gameId: req.params.gameId });
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const dupWithinBatch = findDuplicateInBatch(parsed.data.cards);
  if (dupWithinBatch !== null) {
    return res.status(400).json({ error: `You listed card ${dupWithinBatch} twice` });
  }

  const submission = await CashierSubmission.create({
    _id: parsed.data.submissionId && mongoose.isValidObjectId(parsed.data.submissionId)
      ? parsed.data.submissionId
      : undefined,
    shopId: req.user.shopId,
    gameId: req.params.gameId,
    cashierId: req.user.id,
    cashierName: req.user.name,
    cards: parsed.data.cards,
    unitPrice: parsed.data.unitPrice,
    totalAmount: parsed.data.totalAmount,
    status: 'pending',
  });

  res.status(201).json(toSubmissionPublic(submission));
}));

// GET /api/games/:gameId/submissions/:id - poll for merge confirmation.
router.get('/:gameId/submissions/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Submission not found' });
  const submission = await CashierSubmission.findOne({
    _id: req.params.id,
    shopId: req.user.shopId,
    gameId: req.params.gameId,
  });
  if (!submission) return res.status(404).json({ error: 'Submission not found' });
  res.json(toSubmissionPublic(submission));
}));

// GET /api/games/:gameId/submissions?status=pending - admin lookup-by-list fallback (no camera).
router.get('/:gameId/submissions', requireAuth(['admin']), asyncHandler(async (req, res) => {
  const filter = { shopId: req.user.shopId, gameId: req.params.gameId };
  if (req.query.status) filter.status = req.query.status;
  const submissions = await CashierSubmission.find(filter).sort({ submittedAt: -1 });
  res.json(submissions.map(toSubmissionPublic));
}));

const mergeSchema = z.object({
  submissionId: z.string().optional(),
  // Full inline payload, used when the QR itself is the only copy of the data.
  cashierId: z.string().optional(),
  cashierName: z.string().optional(),
  cards: z.array(cardNoSchema).optional(),
  unitPrice: z.number().positive().optional(),
  totalAmount: z.number().nonnegative().optional(),
});

// POST /api/games/:gameId/submissions/merge (admin)
router.post('/:gameId/submissions/merge', requireAuth(['admin']), asyncHandler(async (req, res) => {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const game = await Game.findOne({ shopId: req.user.shopId, gameId: req.params.gameId });
  if (!game) return res.status(404).json({ error: 'Game not found for this shop' });
  if (game.status !== 'open') {
    return res.status(400).json({ error: `Game ${game.gameId} is not open for registration (status: ${game.status})` });
  }

  let submission;
  if (parsed.data.submissionId && mongoose.isValidObjectId(parsed.data.submissionId)) {
    submission = await CashierSubmission.findOne({
      _id: parsed.data.submissionId,
      shopId: req.user.shopId,
      gameId: req.params.gameId,
    });
  }

  if (!submission) {
    // Full inline payload from a scanned QR - the cashier device never reached the server.
    if (!parsed.data.cards || !parsed.data.cashierName || !parsed.data.unitPrice) {
      return res.status(404).json({ error: 'Submission not found and no inline payload provided' });
    }
    const dupWithinBatch = findDuplicateInBatch(parsed.data.cards);
    if (dupWithinBatch !== null) {
      return res.status(400).json({ error: `You listed card ${dupWithinBatch} twice` });
    }
    submission = await CashierSubmission.create({
      _id: parsed.data.submissionId && mongoose.isValidObjectId(parsed.data.submissionId)
        ? parsed.data.submissionId
        : undefined,
      shopId: req.user.shopId,
      gameId: req.params.gameId,
      cashierId: mongoose.isValidObjectId(parsed.data.cashierId) ? parsed.data.cashierId : req.user.id,
      cashierName: parsed.data.cashierName,
      cards: parsed.data.cards,
      unitPrice: parsed.data.unitPrice,
      totalAmount: parsed.data.totalAmount ?? parsed.data.cards.length * parsed.data.unitPrice,
      status: 'pending',
    });
  }

  if (submission.status !== 'pending') {
    return res.status(200).json(toSubmissionPublic(submission)); // already merged, idempotent re-scan
  }

  const accepted = [];
  const rejected = [];

  // Sequential inserts so the unique index is the source of truth for conflicts.
  // eslint-disable-next-line no-restricted-syntax
  for (const cardNo of submission.cards) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await GameCard.create({
        shopId: req.user.shopId,
        gameId: req.params.gameId,
        cardNo,
        cashierId: submission.cashierId,
        cashierName: submission.cashierName,
        submissionId: submission._id,
        unitPrice: submission.unitPrice,
      });
      accepted.push(cardNo);
    } catch (err) {
      if (err.code === 11000) {
        // eslint-disable-next-line no-await-in-loop
        const holder = await GameCard.findOne({ shopId: req.user.shopId, gameId: req.params.gameId, cardNo });
        rejected.push({
          cardNo,
          reason: `already registered by ${holder ? holder.cashierName : 'another cashier'}`,
        });
      } else {
        throw err;
      }
    }
  }

  submission.acceptedCards = accepted;
  submission.rejectedCards = rejected;
  submission.status = rejected.length === 0 ? 'merged' : accepted.length === 0 ? 'partially_merged' : 'partially_merged';
  submission.mergedAt = new Date();
  submission.mergedBy = req.user.id;
  await submission.save();

  const acceptedAmount = accepted.length * submission.unitPrice;
  game.totalCards += accepted.length;
  game.totalAmount += acceptedAmount;
  await game.save();

  res.json(toSubmissionPublic(submission));
}));

// PATCH /api/games/:gameId/submissions/:id/cash-confirmed (admin) - cash reconciliation nudge.
router.patch('/:gameId/submissions/:id/cash-confirmed', requireAuth(['admin']), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Submission not found' });
  const submission = await CashierSubmission.findOne({
    _id: req.params.id,
    shopId: req.user.shopId,
    gameId: req.params.gameId,
  });
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  submission.cashConfirmed = true;
  await submission.save();

  res.json(toSubmissionPublic(submission));
}));

function findDuplicateInBatch(cards) {
  const seen = new Set();
  for (const c of cards) {
    if (seen.has(c)) return c;
    seen.add(c);
  }
  return null;
}

function toSubmissionPublic(s) {
  return {
    id: String(s._id),
    gameId: s.gameId,
    cashierId: String(s.cashierId),
    cashierName: s.cashierName,
    cards: s.cards,
    unitPrice: s.unitPrice,
    totalAmount: s.totalAmount,
    status: s.status,
    acceptedCards: s.acceptedCards,
    rejectedCards: s.rejectedCards,
    submittedAt: s.submittedAt,
    mergedAt: s.mergedAt,
    cashConfirmed: s.cashConfirmed,
  };
}

module.exports = router;
