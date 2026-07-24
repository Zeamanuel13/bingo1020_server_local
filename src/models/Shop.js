const { Schema, model } = require('mongoose');

// Cloud DB only: one document per physical bingo house.
const shopSchema = new Schema(
  {
    name: { type: String, required: true },
    location: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    localIp: { type: String, default: '' },
    localPort: { type: Number, default: 6000 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    syncApiKey: { type: String, required: true }, // issued on creation, used by that shop's local server
    lastSyncAt: { type: Date, default: null }, // stamped on every accepted /api/sync/ingest call
    licenseKey: { type: String, default: '' }, // last-generated signed license key for this shop's local install (see utils/license.js)
  },
  { timestamps: true }
);

module.exports = model('Shop', shopSchema);
