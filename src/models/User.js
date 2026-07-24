const { Schema, model } = require('mongoose');

// Local DB: scoped to one shop, role in {admin, cashier}.
// Cloud DB: super_admins + a mirror of each shop's admins (read-only visibility, never
// used for local auth - see architecture overview §6).
const userSchema = new Schema(
  {
    shopId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    username: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'cashier', 'super_admin'], required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    lastLoginAt: { type: Date, default: null },
    syncedToCloudAt: { type: Date, default: null },
    // Set true for an admin record created by a super admin in the cloud dashboard
    // with an initial password - forces a change-password step on that admin's first
    // local login. Never touched again once cleared (see auth/change-password).
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.index({ shopId: 1, username: 1 }, { unique: true });

module.exports = model('User', userSchema);
