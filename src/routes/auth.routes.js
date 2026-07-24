const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { SHOP_ID } = require('../config/env');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  // Which app is logging in - the Admin app sends 'admin', the Cashier app sends
  // 'cashier'. Enforced server-side (not just a client-side check the app could skip)
  // so an admin's credentials can't be used to log into the Cashier app or vice versa.
  expectedRole: z.enum(['admin', 'cashier']).optional(),
});

// POST /api/auth/login - Admin/Cashier login against the LOCAL DB only. Never touches
// the cloud server (see architecture §6).
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'username and password are required' });
  const { username, password, expectedRole } = parsed.data;

  const user = await User.findOne({ shopId: SHOP_ID, username, role: { $in: ['admin', 'cashier'] } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Checked only after the password's already confirmed correct, so a wrong-app
  // login attempt with an invalid password still just gets "Invalid username or
  // password" rather than leaking which role the account actually has.
  if (expectedRole && user.role !== expectedRole) {
    return res.status(403).json({
      error: expectedRole === 'cashier'
        ? 'This is an Admin account. Please use the Admin app instead.'
        : 'This is a Cashier account. Please use the Cashier app instead.',
      code: 'WRONG_ROLE',
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: String(user._id),
      name: user.name,
      username: user.username,
      role: user.role,
      shopId: user.shopId,
      mustChangePassword: user.mustChangePassword,
    },
  });
}));

// GET /api/auth/me - the logged-in user's own profile (any role, any deploy mode) -
// backs the Profile screen in every client app.
router.get('/me', requireAuth([]), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: String(user._id),
    name: user.name,
    username: user.username,
    phone: user.phone,
    role: user.role,
    shopId: user.shopId,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  });
}));

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(4),
});

// POST /api/auth/change-password (local mode) - for the forced first-login flow when
// an admin was provisioned from the Super Admin dashboard, but usable by anyone at any
// time. Clears mustChangePassword so a later cloud admin-sync pull never overwrites
// this password again (see src/utils/adminSync.js).
router.post('/change-password', requireAuth([]), asyncHandler(async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const match = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  user.mustChangePassword = false;
  await user.save();

  res.json({ ok: true });
}));

module.exports = router;
