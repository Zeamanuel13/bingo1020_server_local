const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const User = require('../models/User');
const Shop = require('../models/Shop');

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, shopId: user.shopId }, JWT_SECRET, {
    expiresIn: require('../config/env').JWT_EXPIRES_IN,
  });
}

// Validates the JWT AND re-checks the user's status in the DB on every request, so a
// disabled cashier's existing token stops working immediately instead of staying valid
// until it naturally expires.
function requireAuth(roles = []) {
  return async function authMiddleware(req, res, next) {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Missing token' });

      const payload = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(payload.sub);
      if (!user) return res.status(401).json({ error: 'User not found' });
      if (user.status !== 'active') {
        return res.status(403).json({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
      }
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      req.user = { id: String(user._id), role: user.role, shopId: user.shopId, name: user.name };
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// Cloud mode only: authenticates a shop's local server pushing to /api/sync/ingest via
// a per-shop API key (issued when the shop was created in the Super Admin app) rather
// than a JWT - the local server has no super_admin user to log in as.
async function requireShopApiKey(req, res, next) {
  try {
    const shopId = req.headers['x-shop-id'];
    const apiKey = req.headers['x-api-key'];
    if (!shopId || !apiKey) return res.status(401).json({ error: 'Missing shop credentials' });

    const shop = await Shop.findById(shopId);
    if (!shop || shop.syncApiKey !== apiKey) {
      return res.status(401).json({ error: 'Invalid shop credentials' });
    }
    if (shop.status !== 'active') {
      return res.status(403).json({ error: 'This shop has been suspended' });
    }

    req.shop = shop;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid shop credentials' });
  }
}

module.exports = { signToken, requireAuth, requireShopApiKey };
