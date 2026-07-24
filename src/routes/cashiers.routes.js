const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { isValidObjectId } = require('mongoose');

const router = express.Router();

router.use(requireAuth(['admin']));

// GET /api/cashiers?status=active|disabled
router.get('/', asyncHandler(async (req, res) => {
  const filter = { shopId: req.user.shopId, role: 'cashier' };
  if (req.query.status) filter.status = req.query.status;
  const cashiers = await User.find(filter).sort({ createdAt: -1 });
  res.json(cashiers.map(toPublic));
}));

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().default(''),
  username: z.string().min(3),
  password: z.string().min(4),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { name, phone, username, password } = parsed.data;

  const existing = await User.findOne({ shopId: req.user.shopId, username });
  if (existing) return res.status(409).json({ error: 'Username already in use' });

  const passwordHash = await bcrypt.hash(password, 10);
  const cashier = await User.create({
    shopId: req.user.shopId,
    name,
    phone,
    username,
    passwordHash,
    role: 'cashier',
    status: 'active',
  });

  res.status(201).json(toPublic(cashier));
}));

const editSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  username: z.string().min(3).optional(),
  password: z.string().min(4).optional(),
});

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Cashier not found' });
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const cashier = await User.findOne({ _id: req.params.id, shopId: req.user.shopId, role: 'cashier' });
  if (!cashier) return res.status(404).json({ error: 'Cashier not found' });

  const { name, phone, username, password } = parsed.data;
  if (username && username !== cashier.username) {
    const clash = await User.findOne({ shopId: req.user.shopId, username });
    if (clash) return res.status(409).json({ error: 'Username already in use' });
    cashier.username = username;
  }
  if (name !== undefined) cashier.name = name;
  if (phone !== undefined) cashier.phone = phone;
  if (password) cashier.passwordHash = await bcrypt.hash(password, 10);
  await cashier.save();

  res.json(toPublic(cashier));
}));

const statusSchema = z.object({ status: z.enum(['active', 'disabled']) });

router.patch('/:id/status', asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Cashier not found' });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'status must be active or disabled' });

  const cashier = await User.findOne({ _id: req.params.id, shopId: req.user.shopId, role: 'cashier' });
  if (!cashier) return res.status(404).json({ error: 'Cashier not found' });

  cashier.status = parsed.data.status;
  await cashier.save();

  res.json(toPublic(cashier));
}));

function toPublic(user) {
  return {
    id: String(user._id),
    name: user.name,
    phone: user.phone,
    username: user.username,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

module.exports = router;
