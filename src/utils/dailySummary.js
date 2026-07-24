const Game = require('../models/Game');
const GameCard = require('../models/GameCard');
const DailySummary = require('../models/DailySummary');

// These shops operate in East Africa Time (UTC+3) - "today" for a daily report must
// mean today in EAT, not today in UTC, or games finishing between roughly midnight
// and 3am EAT would get attributed to the previous day. Hardcoded rather than reading
// the deployment machine's OS timezone, so this stays correct regardless of how the
// server happens to be configured/hosted.
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function dateStrFromDate(d) {
  return new Date(d.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

// Recomputed from source data (games + game_cards) rather than incrementally maintained,
// so voided games never pollute the numbers and a re-run always self-heals.
async function computeDailySummary(shopId, dateStr) {
  // dateStr is an EAT calendar date - convert its EAT midnight-to-midnight boundaries
  // into the equivalent UTC instants (stored timestamps are always UTC) by
  // subtracting the offset.
  const start = new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() - EAT_OFFSET_MS);
  const end = new Date(new Date(`${dateStr}T23:59:59.999Z`).getTime() - EAT_OFFSET_MS);

  const finishedGames = await Game.find({
    shopId,
    status: 'finished',
    finishedAt: { $gte: start, $lte: end },
  });

  const gameIds = finishedGames.map((g) => g.gameId);
  const gamesPlayed = finishedGames.length;
  const totalRevenue = finishedGames.reduce((sum, g) => sum + g.totalAmount, 0);
  // Falls back to the old single-winner field for any game finished before this
  // changed to support multiple winners, so historical summaries stay correct.
  const totalPrizePaid = finishedGames.reduce((sum, g) => {
    const winners = (g.winners && g.winners.length) ? g.winners : (g.winner ? [g.winner] : []);
    return sum + winners.reduce((s, w) => s + w.prizeAmount, 0);
  }, 0);

  let cardsSold = 0;
  let perCashier = [];
  if (gameIds.length) {
    const cards = await GameCard.find({ shopId, gameId: { $in: gameIds } });
    cardsSold = cards.length;
    const byCashier = new Map();
    cards.forEach((c) => {
      const key = String(c.cashierId);
      if (!byCashier.has(key)) {
        byCashier.set(key, { cashierId: key, cashierName: c.cashierName, cardsSold: 0, revenue: 0 });
      }
      const entry = byCashier.get(key);
      entry.cardsSold += 1;
      entry.revenue += c.unitPrice;
    });
    perCashier = Array.from(byCashier.values());
  }

  const summary = await DailySummary.findOneAndUpdate(
    { shopId, date: dateStr },
    { shopId, date: dateStr, gamesPlayed, cardsSold, totalRevenue, totalPrizePaid, perCashier },
    { upsert: true, new: true }
  );
  return summary;
}

async function touchDailySummaryForFinishedGame(game) {
  const d = game.finishedAt || new Date();
  await computeDailySummary(game.shopId, dateStrFromDate(d));
}

module.exports = { computeDailySummary, touchDailySummaryForFinishedGame, dateStrFromDate };
