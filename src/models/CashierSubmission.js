const { Schema, model } = require('mongoose');

const rejectedCardSchema = new Schema(
  { cardNo: Number, reason: String },
  { _id: false }
);

const cashierSubmissionSchema = new Schema(
  {
    shopId: { type: String, required: true, index: true },
    gameId: { type: String, required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cashierName: { type: String, required: true },
    cards: { type: [Number], default: [] }, // as submitted, pre-merge
    unitPrice: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'merged', 'partially_merged'],
      default: 'pending',
    },
    acceptedCards: { type: [Number], default: [] },
    rejectedCards: { type: [rejectedCardSchema], default: [] },
    submittedAt: { type: Date, default: Date.now },
    mergedAt: { type: Date, default: null },
    mergedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cashConfirmed: { type: Boolean, default: false }, // cash reconciliation nudge
    syncedToCloudAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = model('CashierSubmission', cashierSubmissionSchema);
