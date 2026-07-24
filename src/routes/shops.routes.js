const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { computeDailySummary, dateStrFromDate } = require('../utils/dailySummary');
const { LICENSE_PRIVATE_KEY } = require('../config/env');

const router = express.Router();

router.use(requireAuth(['super_admin']));

// syncApiKey is always included (not just once at creation) - the super admin needs
// to be able to look it up again later from the shop's detail page, e.g. if it was
// lost before being copied into that shop's local .env, or the local machine gets
// replaced. This is an internal, super_admin-only endpoint (see requireAuth above).
function toShopPublic(shop) {
  return {
    id: String(shop._id),
    name: shop.name,
    location: shop.location,
    contactPhone: shop.contactPhone,
    localIp: shop.localIp,
    localPort: shop.localPort,
    status: shop.status,
    lastSyncAt: shop.lastSyncAt,
    createdAt: shop.createdAt,
    syncApiKey: shop.syncApiKey,
    licenseKey: shop.licenseKey,
  };
}

// GET /api/shops - list all shops.
router.get('/', asyncHandler(async (req, res) => {
  const shops = await Shop.find().sort({ createdAt: -1 });
  res.json(shops.map((s) => toShopPublic(s)));
}));

const createSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional().default(''),
  contactPhone: z.string().optional().default(''),
});

// POST /api/shops - creates the shop record + its sync API key.
router.post('/', asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const syncApiKey = crypto.randomBytes(24).toString('hex');
  const shop = await Shop.create({ ...parsed.data, syncApiKey, status: 'active' });

  res.status(201).json({
    ...toShopPublic(shop),
    note: `Use this shop's id ("${shop._id}") as SHOP_ID and the syncApiKey as CLOUD_SYNC_API_KEY in that shop's local .env file.`,
  });
}));

const editSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().optional(),
  contactPhone: z.string().optional(),
  localIp: z.string().optional(),
  localPort: z.number().int().optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

// PATCH /api/shops/:id - edit shop fields, or suspend/reactivate via status.
router.patch('/:id', asyncHandler(async (req, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const shop = await Shop.findById(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  Object.assign(shop, parsed.data);
  await shop.save();

  res.json(toShopPublic(shop));
}));

const licenseSchema = z.object({
  expiresInDays: z.number().int().positive().optional(),
});

// POST /api/shops/:id/license - (re)generates this shop's signed license key, signed
// with the private half of the Ed25519 keypair (LICENSE_PRIVATE_KEY, this deployment's
// env only - see utils/license.js for the public-key verification side that ships with
// every local install). Stored on the shop so it stays viewable, not just shown once.
router.post('/:id/license', asyncHandler(async (req, res) => {
  if (!LICENSE_PRIVATE_KEY) return res.status(500).json({ error: 'LICENSE_PRIVATE_KEY is not configured on this cloud deployment' });

  const parsed = licenseSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const shop = await Shop.findById(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const options = { algorithm: 'RS256' };
  if (parsed.data.expiresInDays) options.expiresIn = `${parsed.data.expiresInDays}d`;
  const licenseKey = jwt.sign({ shopId: String(shop._id) }, LICENSE_PRIVATE_KEY, options);

  shop.licenseKey = licenseKey;
  await shop.save();

  res.json({ licenseKey });
}));

// GET /api/shops/:id/admins - admins assigned to this shop (mirrored from synced users).
router.get('/:id/admins', asyncHandler(async (req, res) => {
  const admins = await User.find({ shopId: req.params.id, role: 'admin' }).sort({ createdAt: -1 });
  res.json(admins.map((a) => ({
    id: String(a._id),
    name: a.name,
    username: a.username,
    status: a.status,
    syncedToCloudAt: a.syncedToCloudAt,
    createdAt: a.createdAt,
  })));
}));

// GET /api/shops/:id/cashiers - read-only view of this shop's cashiers, mirrored via the
// same local->cloud user sync as admins (see sync.routes.js SYNCABLE). No create/edit
// here - cashiers are only ever managed from that shop's own Admin app.
router.get('/:id/cashiers', asyncHandler(async (req, res) => {
  const cashiers = await User.find({ shopId: req.params.id, role: 'cashier' }).sort({ createdAt: -1 });
  res.json(cashiers.map((c) => ({
    id: String(c._id),
    name: c.name,
    username: c.username,
    status: c.status,
    syncedToCloudAt: c.syncedToCloudAt,
    createdAt: c.createdAt,
  })));
}));

const createAdminSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(4),
});

// POST /api/shops/:id/admins - creates an admin record in the cloud DB, with a real
// initial password the super admin sets here. That shop's local server picks this up
// the next time it starts up or reconnects (see src/utils/adminSync.js pullAdminChanges
// - best-effort, never blocks local operation), at which point the admin can log in
// locally with this password and will be prompted to change it on first login.
router.post('/:id/admins', asyncHandler(async (req, res) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const shop = await Shop.findById(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const existing = await User.findOne({ shopId: req.params.id, username: parsed.data.username });
  if (existing) return res.status(409).json({ error: 'Username already in use for this shop' });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const admin = await User.create({
    shopId: req.params.id,
    name: parsed.data.name,
    username: parsed.data.username,
    passwordHash,
    role: 'admin',
    status: 'active',
    mustChangePassword: true,
  });

  res.status(201).json({
    id: String(admin._id),
    name: admin.name,
    username: admin.username,
    status: admin.status,
    note: "This admin can log in locally with the password you just set as soon as this shop's local server next starts up or reconnects to the internet - not necessarily instant.",
  });
}));

const editAdminSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

// PATCH /api/shops/:id/admins/:userId
router.patch('/:id/admins/:userId', asyncHandler(async (req, res) => {
  const parsed = editAdminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const admin = await User.findOne({ _id: req.params.userId, shopId: req.params.id, role: 'admin' });
  if (!admin) return res.status(404).json({ error: 'Admin not found for this shop' });

  Object.assign(admin, parsed.data);
  await admin.save();

  res.json({ id: String(admin._id), name: admin.name, username: admin.username, status: admin.status });
}));

// GET /api/shops/:id/reports/daily?date= - same daily report shape the shop's own
// Admin app sees locally, sourced from the synced daily_summaries (Super Admin spec §5).
router.get('/:id/reports/daily', asyncHandler(async (req, res) => {
  const dateStr = req.query.date || dateStrFromDate(new Date());
  const summary = await computeDailySummary(req.params.id, dateStr);
  res.json(summary);
}));

// GET /api/shops/:id/reports/range?from=&to=
router.get('/:id/reports/range', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });

  const days = [];
  let cursor = new Date(`${from}T00:00:00.000Z`);
  const endDate = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= endDate) {
    days.push(dateStrFromDate(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  const summaries = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const dateStr of days) {
    // eslint-disable-next-line no-await-in-loop
    summaries.push(await computeDailySummary(req.params.id, dateStr));
  }
  res.json({ from, to, days: summaries });
}));

module.exports = router;
