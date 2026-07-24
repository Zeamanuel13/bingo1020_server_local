const { Schema, model } = require('mongoose');

const winnerSchema = new Schema(
  {
    cardNo: { type: Number, required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    prizeAmount: { type: Number, required: true },
    declaredAt: { type: Date, default: Date.now },
    declaredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const gameSchema = new Schema(
  {
    shopId: { type: String, required: true, index: true },
    gameId: { type: String, required: true }, // 4-digit, unique per shop, never reused
    name: { type: String, default: '' },
    unitPrice: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['open', 'closed_registration', 'finished', 'voided'],
      default: 'open',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    totalCards: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    winners: { type: [winnerSchema], default: [] }, // a game can have multiple simultaneous BINGO winners
    winner: { type: winnerSchema, default: null }, // deprecated, kept only so any not-yet-migrated document still parses
    voidReason: { type: String, default: '' },
    unverified: { type: Boolean, default: false }, // created offline by a cashier's fallback path
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    syncedToCloudAt: { type: Date, default: null },
  },
  { timestamps: true }
);

gameSchema.index({ shopId: 1, gameId: 1 }, { unique: true });
gameSchema.index({ shopId: 1, createdAt: -1 });

module.exports = model('Game', gameSchema);
