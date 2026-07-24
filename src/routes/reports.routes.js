const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { computeDailySummary, dateStrFromDate } = require('../utils/dailySummary');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(requireAuth(['admin']));

function toPublic(summary) {
  return {
    date: summary.date,
    gamesPlayed: summary.gamesPlayed,
    cardsSold: summary.cardsSold,
    totalRevenue: summary.totalRevenue,
    totalPrizePaid: summary.totalPrizePaid,
    perCashier: summary.perCashier,
  };
}

// GET /api/reports/daily?date=YYYY-MM-DD (default today)
router.get('/daily', asyncHandler(async (req, res) => {
  const dateStr = req.query.date || dateStrFromDate(new Date());
  const summary = await computeDailySummary(req.user.shopId, dateStr);
  res.json(toPublic(summary));
}));

// GET /api/reports/range?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/range', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });

  const days = [];
  let cursor = new Date(`${from}T00:00:00.000Z`);
  const endDate = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
  }
  if (endDate < cursor) return res.status(400).json({ error: '"to" must be on or after "from"' });

  while (cursor <= endDate) {
    days.push(dateStrFromDate(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  const summaries = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const dateStr of days) {
    // eslint-disable-next-line no-await-in-loop
    summaries.push(await computeDailySummary(req.user.shopId, dateStr));
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      gamesPlayed: acc.gamesPlayed + s.gamesPlayed,
      cardsSold: acc.cardsSold + s.cardsSold,
      totalRevenue: acc.totalRevenue + s.totalRevenue,
      totalPrizePaid: acc.totalPrizePaid + s.totalPrizePaid,
    }),
    { gamesPlayed: 0, cardsSold: 0, totalRevenue: 0, totalPrizePaid: 0 }
  );

  res.json({ from, to, totals, days: summaries.map(toPublic) });
}));

module.exports = router;
