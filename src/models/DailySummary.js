const { Schema, model } = require('mongoose');

const perCashierSchema = new Schema(
  { cashierId: Schema.Types.ObjectId, cashierName: String, cardsSold: Number, revenue: Number },
  { _id: false }
);

const dailySummarySchema = new Schema(
  {
    shopId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    gamesPlayed: { type: Number, default: 0 },
    cardsSold: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalPrizePaid: { type: Number, default: 0 },
    perCashier: { type: [perCashierSchema], default: [] },
    syncedToCloudAt: { type: Date, default: null },
  },
  { timestamps: true }
);

dailySummarySchema.index({ shopId: 1, date: 1 }, { unique: true });

module.exports = model('DailySummary', dailySummarySchema);
