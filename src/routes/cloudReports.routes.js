const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { computeDailySummary, dateStrFromDate } = require('../utils/dailySummary');
const Shop = require('../models/Shop');

const router = express.Router();

router.use(requireAuth(['super_admin']));

// GET /api/reports/overview?from=&to= - total revenue/cards/prize across all shops for
// a date range, with a per-shop breakdown (Super Admin spec §5).
router.get('/overview', asyncHandler(async (req, res) => {
  const from = req.query.from || dateStrFromDate(new Date());
  const to = req.query.to || dateStrFromDate(new Date());

  const days = [];
  let cursor = new Date(`${from}T00:00:00.000Z`);
  const endDate = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= endDate) {
    days.push(dateStrFromDate(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  const shops = await Shop.find().sort({ name: 1 });
  const perShop = [];
  const totals = { gamesPlayed: 0, cardsSold: 0, totalRevenue: 0, totalPrizePaid: 0 };

  // eslint-disable-next-line no-restricted-syntax
  for (const shop of shops) {
    const shopId = String(shop._id);
    const shopTotals = { gamesPlayed: 0, cardsSold: 0, totalRevenue: 0, totalPrizePaid: 0 };
    // eslint-disable-next-line no-restricted-syntax
    for (const dateStr of days) {
      // eslint-disable-next-line no-await-in-loop
      const summary = await computeDailySummary(shopId, dateStr);
      shopTotals.gamesPlayed += summary.gamesPlayed;
      shopTotals.cardsSold += summary.cardsSold;
      shopTotals.totalRevenue += summary.totalRevenue;
      shopTotals.totalPrizePaid += summary.totalPrizePaid;
    }
    perShop.push({
      shopId,
      shopName: shop.name,
      lastSyncAt: shop.lastSyncAt,
      status: shop.status,
      ...shopTotals,
    });
    totals.gamesPlayed += shopTotals.gamesPlayed;
    totals.cardsSold += shopTotals.cardsSold;
    totals.totalRevenue += shopTotals.totalRevenue;
    totals.totalPrizePaid += shopTotals.totalPrizePaid;
  }

  res.json({ from, to, totals, perShop });
}));

module.exports = router;
