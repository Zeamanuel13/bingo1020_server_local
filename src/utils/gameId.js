const Game = require('../models/Game');

// gameId is a 4-digit string, unique per shop forever ("never reuse" - see backend spec §2).
// Generated as (count of games ever created for this shop) + 1, padded to 4 digits, with a
// small retry loop against the unique index in case of a race between two create requests.
async function generateGameId(shopId) {
  const count = await Game.countDocuments({ shopId });
  if (count >= 8000) {
    console.warn(`[gameId] shop ${shopId} has used ${count} of 10000 possible game IDs (>80%)`);
  }
  if (count >= 10000) {
    throw new Error('Game ID space exhausted for this shop (10000 lifetime games) - needs a rollover plan');
  }

  let next = count + 1;
  for (let attempt = 0; attempt < 50 && next <= 9999; attempt += 1, next += 1) {
    const candidate = String(next).padStart(4, '0');
    // eslint-disable-next-line no-await-in-loop
    const exists = await Game.exists({ shopId, gameId: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Could not allocate a unique gameId after 50 attempts');
}

module.exports = { generateGameId };
