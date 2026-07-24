const { Schema, model } = require('mongoose');

// One row per card registered into a game. Unique index is the database-level guarantee
// that a card cannot be registered twice in the same game, independent of app-side checks.
const gameCardSchema = new Schema(
  {
    shopId: { type: String, required: true, index: true },
    gameId: { type: String, required: true },
    cardNo: { type: Number, required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cashierName: { type: String, required: true },
    submissionId: { type: Schema.Types.ObjectId, ref: 'CashierSubmission', default: null },
    unitPrice: { type: Number, required: true }, // snapshot at registration time
    registeredAt: { type: Date, default: Date.now },
    syncedToCloudAt: { type: Date, default: null },
  },
  { timestamps: true }
);

gameCardSchema.index({ shopId: 1, gameId: 1, cardNo: 1 }, { unique: true });

module.exports = model('GameCard', gameCardSchema);
