const { Schema, model } = require('mongoose');

// Local DB only: history of local -> cloud sync attempts.
const syncRunSchema = new Schema(
  {
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    status: { type: String, enum: ['running', 'success', 'partial', 'failed'], default: 'running' },
    detail: { type: Schema.Types.Mixed, default: {} },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = model('SyncRun', syncRunSchema);
